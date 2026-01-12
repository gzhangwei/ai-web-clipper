/**
 * Notion 层级页面服务
 * 用于批量创建层级目录结构
 */

import { generateUuid } from '@web-clipper/shared/lib/uuid';
import axios from 'axios';
import {
  HierarchyNode,
  CreateHierarchyRequest,
  CreateHierarchyOptions,
  PageCreateResult,
  CreateHierarchyProgress,
} from './types';

const PAGE = 'page';
const origin = 'https://www.notion.so/';

// 默认选项
const DEFAULT_OPTIONS: Required<CreateHierarchyOptions> = {
  includeContent: true,
  includeSummary: true,
  includeTags: true,
  requestInterval: 350, // 3 req/s = 333ms, 留点余量
  maxRetries: 3,
};

/**
 * 限速队列 - 确保不超过 Notion API 限制
 */
class RateLimiter {
  private lastRequestTime = 0;
  private interval: number;

  constructor(interval: number) {
    this.interval = interval;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.interval) {
      await this.sleep(this.interval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 统计层级节点总数
 */
function countNodes(node: HierarchyNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * 构建页面内容 (Markdown)
 */
function buildPageContent(node: HierarchyNode, options: Required<CreateHierarchyOptions>): string {
  const sections: string[] = [];

  // 添加元数据 YAML front matter
  if (node.metadata?.tags && options.includeTags) {
    sections.push('---');
    sections.push(`tags: [${node.metadata.tags.join(', ')}]`);
    if (node.metadata.category) {
      sections.push(`category: ${node.metadata.category}`);
    }
    if (node.url) {
      sections.push(`source: ${node.url}`);
    }
    sections.push('---\n');
  }

  // 添加摘要
  if (node.metadata?.summary && options.includeSummary) {
    sections.push('## Summary\n');
    sections.push(node.metadata.summary);
    sections.push('\n');
  }

  // 添加关键点
  if (node.metadata?.keyPoints && node.metadata.keyPoints.length > 0 && options.includeSummary) {
    sections.push('## Key Points\n');
    node.metadata.keyPoints.forEach(point => {
      sections.push(`- ${point}`);
    });
    sections.push('\n');
  }

  // 添加原始内容
  if (node.content && options.includeContent) {
    if (sections.length > 0) {
      sections.push('---\n');
      sections.push('## Content\n');
    }
    sections.push(node.content);
  }

  return sections.join('\n') || node.title;
}

/**
 * Notion 层级服务类
 */
export class NotionHierarchyService {
  private requestWithCookie: <T>(url: string, data?: any) => Promise<T>;
  private rateLimiter: RateLimiter;
  private options: Required<CreateHierarchyOptions>;
  private onProgress?: (progress: CreateHierarchyProgress) => void;
  private completed = 0;
  private total = 0;

  constructor(
    requestFn: <T>(url: string, data?: any) => Promise<T>,
    options?: CreateHierarchyOptions,
    onProgress?: (progress: CreateHierarchyProgress) => void
  ) {
    this.requestWithCookie = requestFn;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.rateLimiter = new RateLimiter(this.options.requestInterval);
    this.onProgress = onProgress;
  }

  /**
   * 创建层级目录
   */
  async createHierarchy(request: CreateHierarchyRequest): Promise<PageCreateResult> {
    this.completed = 0;
    this.total = countNodes(request.hierarchy);
    this.options = { ...this.options, ...request.options };

    return this.createNodeRecursive(
      request.hierarchy,
      request.parentId,
      request.spaceId
    );
  }

  /**
   * 递归创建节点
   */
  private async createNodeRecursive(
    node: HierarchyNode,
    parentId: string,
    spaceId: string
  ): Promise<PageCreateResult> {
    // 报告进度
    this.reportProgress(node.title, 'creating');

    let pageId: string;
    let success = true;
    let error: string | undefined;

    try {
      // 限速
      await this.rateLimiter.wait();

      // 创建页面
      pageId = await this.createPage(node.title, parentId, spaceId);

      // 如果有内容，上传内容
      if (node.content || node.metadata) {
        this.reportProgress(node.title, 'uploading');
        await this.rateLimiter.wait();
        await this.uploadContent(pageId, node, spaceId);
      }

    } catch (e: any) {
      success = false;
      error = e.message || 'Unknown error';
      pageId = '';
    }

    this.completed++;
    this.reportProgress(node.title, success ? 'done' : 'error');

    // 构建结果
    const result: PageCreateResult = {
      pageId,
      title: node.title,
      href: pageId ? `https://www.notion.so/${spaceId}/${pageId.replace(/-/g, '')}` : '',
      success,
      error,
    };

    // 递归创建子节点
    if (node.children && node.children.length > 0 && success) {
      result.children = [];
      for (const child of node.children) {
        const childResult = await this.createNodeRecursive(child, pageId, spaceId);
        result.children.push(childResult);
      }
    }

    return result;
  }

  /**
   * 创建空页面
   */
  private async createPage(title: string, parentId: string, spaceId: string): Promise<string> {
    const documentId = generateUuid();
    const requestId = generateUuid();
    const innerRequestId = generateUuid();
    const time = Date.now();

    const operations = [
      {
        id: documentId,
        table: 'block',
        path: [],
        command: 'set',
        args: {
          type: PAGE,
          id: documentId,
          space_id: spaceId,
          version: 1,
        },
      },
      {
        id: documentId,
        table: 'block',
        path: [],
        command: 'update',
        args: {
          parent_id: parentId,
          parent_table: 'block',
          alive: true,
          space_id: spaceId,
        },
      },
      {
        table: 'block',
        id: parentId,
        path: ['content'],
        command: 'listAfter',
        args: {
          id: documentId,
          space_id: spaceId,
        },
      },
      {
        id: documentId,
        table: 'block',
        path: [],
        command: 'update',
        args: {
          created_time: time,
          last_edited_time: time,
          space_id: spaceId,
        },
      },
      {
        id: parentId,
        table: 'block',
        path: [],
        command: 'update',
        args: {
          last_edited_time: time,
          space_id: spaceId,
        },
      },
      {
        id: documentId,
        table: 'block',
        path: ['properties', 'title'],
        command: 'set',
        args: [[title]],
      },
    ];

    await this.requestWithCookie('api/v3/saveTransactionsFanout', {
      requestId,
      transactions: [
        {
          id: innerRequestId,
          operations,
          spaceId,
        },
      ],
    });

    return documentId;
  }

  /**
   * 上传页面内容
   */
  private async uploadContent(
    pageId: string,
    node: HierarchyNode,
    spaceId: string
  ): Promise<void> {
    const content = buildPageContent(node, this.options);
    const fileName = `${node.title}.md`;

    // 获取上传 URL
    const fileUrl = await this.requestWithCookie<{
      url: string;
      signedPutUrl: string;
      signedToken: string;
    }>('api/v3/getUploadFileUrl', {
      bucket: 'temporary',
      name: encodeURI(fileName),
      contentType: 'text/markdown',
    });

    // 上传文件
    await axios.put(fileUrl.signedPutUrl, content, {
      headers: {
        'Content-Type': 'text/markdown',
      },
    });

    // 触发导入任务
    await this.rateLimiter.wait();
    await this.requestWithCookie('api/v3/enqueueTask', {
      task: {
        eventName: 'importFile',
        request: {
          fileURL: fileUrl.url,
          fileName,
          importType: 'ReplaceBlock',
          block: {
            id: pageId,
            spaceId,
          },
          spaceId,
          signedToken: fileUrl.signedToken,
        },
      },
    });
  }

  /**
   * 报告进度
   */
  private reportProgress(current: string, status: CreateHierarchyProgress['status']): void {
    if (this.onProgress) {
      this.onProgress({
        current,
        completed: this.completed,
        total: this.total,
        status,
      });
    }
  }
}

/**
 * 重试包装器
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (i < maxRetries - 1) {
        // 指数退避
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
}
