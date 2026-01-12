/**
 * 批量剪切服务 - 核心逻辑
 */

import {
  ChapterNode,
  TOCParseResult,
  PageFetchResult,
  BatchProgress,
  BatchClipOptions,
  BatchClipResult,
  DEFAULT_BATCH_OPTIONS,
} from './types';
import { TOCParser, flattenChapters } from './tocParser';
import { getAIService } from '@/service/ai';
import { loadAIConfig, isAIConfigured } from '@/service/ai/storage';
import { HierarchyNode } from '@/common/backend/services/notion/types';

/**
 * 批量剪切服务
 */
export class BatchClipService {
  private options: Required<BatchClipOptions>;
  private onProgress?: (progress: BatchProgress) => void;
  private aborted = false;

  constructor(
    options?: BatchClipOptions,
    onProgress?: (progress: BatchProgress) => void
  ) {
    this.options = { ...DEFAULT_BATCH_OPTIONS, ...options };
    this.onProgress = onProgress;
  }

  /**
   * 中止操作
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * 解析目录页
   */
  async parseTOC(url: string): Promise<TOCParseResult> {
    this.reportProgress('parsing', url, 0, 1);

    try {
      // 获取页面 HTML
      const response = await fetch(url);
      const html = await response.text();

      // 创建 DOM 解析器
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 解析目录
      const tocParser = new TOCParser(doc, url);
      const result = tocParser.parse();

      this.reportProgress('parsing', url, 1, 1);
      return result;
    } catch (e: any) {
      throw new Error(`Failed to parse TOC: ${e.message}`);
    }
  }

  /**
   * 批量抓取页面
   */
  async fetchPages(chapters: ChapterNode[]): Promise<Map<string, PageFetchResult>> {
    const flatList = flattenChapters(chapters);
    const results = new Map<string, PageFetchResult>();
    const total = flatList.length;
    let completed = 0;

    // 并发控制
    const queue = [...flatList];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      if (this.aborted) break;

      // 填充到最大并发数
      while (queue.length > 0 && running.length < this.options.maxConcurrency) {
        const chapter = queue.shift()!;
        const promise = this.fetchPage(chapter.url, chapter.title)
          .then(result => {
            results.set(chapter.url, result);
            completed++;
            this.reportProgress('fetching', chapter.title, completed, total);
          })
          .catch(e => {
            results.set(chapter.url, {
              url: chapter.url,
              title: chapter.title,
              content: '',
              success: false,
              error: e.message,
            });
            completed++;
            this.reportProgress('fetching', chapter.title, completed, total);
          });

        running.push(promise);

        // 请求间隔
        if (this.options.requestInterval > 0) {
          await this.sleep(this.options.requestInterval);
        }
      }

      // 等待一个完成
      if (running.length > 0) {
        await Promise.race(running);
        // 移除已完成的
        const completed = running.filter(p => {
          // @ts-ignore
          return p._completed;
        });
        running.length = 0;
        running.push(...running.filter(p => !completed.includes(p)));
      }
    }

    // 等待所有完成
    await Promise.all(running);

    return results;
  }

  /**
   * 抓取单个页面
   */
  private async fetchPage(url: string, title: string): Promise<PageFetchResult> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      // 解析并提取正文
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // 尝试提取正文
      const content = this.extractContent(doc);

      // 获取更准确的标题
      const pageTitle = this.extractTitle(doc) || title;

      return {
        url,
        title: pageTitle,
        content,
        success: true,
      };
    } catch (e: any) {
      return {
        url,
        title,
        content: '',
        success: false,
        error: e.message,
      };
    }
  }

  /**
   * 提取页面正文
   */
  private extractContent(doc: Document): string {
    // 尝试常见的正文容器
    const selectors = [
      'article',
      'main',
      '.content',
      '.main-content',
      '.post-content',
      '.article-content',
      '.markdown-body',
      '.prose',
      // 各种文档框架
      '.theme-doc-markdown',
      '.md-content',
      '.vp-doc',
    ];

    for (const selector of selectors) {
      const el = doc.querySelector(selector);
      if (el) {
        return this.htmlToMarkdown(el);
      }
    }

    // 降级：使用 body
    return this.htmlToMarkdown(doc.body);
  }

  /**
   * 提取标题
   */
  private extractTitle(doc: Document): string {
    const h1 = doc.querySelector('h1');
    if (h1) {
      return h1.textContent?.trim() || '';
    }
    return doc.title || '';
  }

  /**
   * 简单的 HTML 转 Markdown
   * 注：实际应用中应该使用 Turndown
   */
  private htmlToMarkdown(element: Element): string {
    // 移除 script, style, nav, footer 等
    const clone = element.cloneNode(true) as Element;
    const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', '.sidebar', '.toc'];
    for (const selector of removeSelectors) {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    }

    // 简单转换
    let html = clone.innerHTML;

    // 标题
    html = html.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
    html = html.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
    html = html.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
    html = html.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');

    // 段落
    html = html.replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n');

    // 列表
    html = html.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    // 链接
    html = html.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // 代码
    html = html.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    html = html.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '\n```\n$1\n```\n');

    // 粗体斜体
    html = html.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    html = html.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    html = html.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    html = html.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // 清理标签
    html = html.replace(/<[^>]+>/g, '');

    // 清理空白
    html = html.replace(/\n\s*\n\s*\n/g, '\n\n');
    html = html.replace(/&nbsp;/g, ' ');
    html = html.replace(/&lt;/g, '<');
    html = html.replace(/&gt;/g, '>');
    html = html.replace(/&amp;/g, '&');

    return html.trim();
  }

  /**
   * 使用 AI 处理内容
   */
  async processWithAI(
    chapters: ChapterNode[],
    fetchResults: Map<string, PageFetchResult>
  ): Promise<Map<string, HierarchyNode>> {
    const results = new Map<string, HierarchyNode>();

    if (!this.options.useAI) {
      // 不使用 AI，直接转换
      for (const [url, fetchResult] of fetchResults) {
        results.set(url, {
          title: fetchResult.title,
          content: fetchResult.content,
          url,
        });
      }
      return results;
    }

    // 检查 AI 是否配置
    const configured = await isAIConfigured();
    if (!configured) {
      console.warn('AI not configured, skipping AI processing');
      for (const [url, fetchResult] of fetchResults) {
        results.set(url, {
          title: fetchResult.title,
          content: fetchResult.content,
          url,
        });
      }
      return results;
    }

    // 加载 AI 配置
    const aiConfig = await loadAIConfig();
    const aiService = getAIService(aiConfig);

    const entries = Array.from(fetchResults.entries());
    const total = entries.length;
    let completed = 0;

    for (const [url, fetchResult] of entries) {
      if (this.aborted) break;
      if (!fetchResult.success) {
        results.set(url, {
          title: fetchResult.title,
          content: '',
          url,
        });
        completed++;
        continue;
      }

      this.reportProgress('processing', fetchResult.title, completed, total);

      try {
        const aiResult = await aiService.process({
          content: fetchResult.content,
          title: fetchResult.title,
          url,
        });

        results.set(url, {
          title: fetchResult.title,
          content: fetchResult.content,
          url,
          metadata: {
            summary: aiResult.summary,
            tags: aiResult.tags,
            keyPoints: aiResult.keyPoints,
            category: aiResult.category,
          },
        });
      } catch (e: any) {
        console.error(`AI processing failed for ${url}:`, e);
        results.set(url, {
          title: fetchResult.title,
          content: fetchResult.content,
          url,
        });
      }

      completed++;
      this.reportProgress('processing', fetchResult.title, completed, total);

      // AI 请求间隔
      if (completed < total) {
        await this.sleep(1000); // AI 请求需要更长间隔
      }
    }

    return results;
  }

  /**
   * 构建层级结构
   */
  buildHierarchy(
    chapters: ChapterNode[],
    processedData: Map<string, HierarchyNode>,
    rootTitle: string
  ): HierarchyNode {
    const buildNode = (chapter: ChapterNode): HierarchyNode => {
      const data = processedData.get(chapter.url);
      const node: HierarchyNode = {
        title: data?.title || chapter.title,
        content: data?.content,
        url: chapter.url,
        metadata: data?.metadata,
      };

      if (chapter.children && chapter.children.length > 0) {
        node.children = chapter.children.map(buildNode);
      }

      return node;
    };

    // 构建根节点
    return {
      title: rootTitle,
      children: chapters.map(buildNode),
    };
  }

  /**
   * 报告进度
   */
  private reportProgress(
    stage: BatchProgress['stage'],
    current: string,
    completed: number,
    total: number
  ): void {
    if (this.onProgress) {
      this.onProgress({
        stage,
        current,
        completed,
        total,
      });
    }
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
