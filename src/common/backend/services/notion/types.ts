import { Repository } from '../interface';

export interface NotionUserContent {
  recordMap: {
    notion_user: {
      [uuid: string]: {
        role: string;
        value: {
          name: string;
          id: string;
          email: string;
          profile_photo: string;
        };
      };
    };
    space: {
      [id: string]: {
        role: string;
        value: {
          id: string;
          name: string;
          domain: string;
          pages: string[];
        };
      };
    };
    block: {
      [uuid: string]: {
        role: string;
        value: {
          id: string;
          version: string;
          parent_id: string;
          type: string;
          created_time: number;
          properties: {
            title: string[][];
            content: string[];
          };
          collection_id: string;
        };
      };
    };
    collection: {
      [uuid: string]: {
        role: string;
        value: {
          id: string;
          version: string;
          parent_id: string;
          name: string[][];
        };
      };
    };
  };
}

export interface RecentPages {
  recordMap: {
    collection?: {
      [uuid: string]: {
        role: string;
        value: {
          id: string;
          version: string;
          parent_id: string;
          name: string[][];
        };
      };
    };
  };
}

export interface NotionRepository extends Repository {
  pageType: string;
}

// ===== 层级页面相关类型 =====

/**
 * 层级页面节点 - 用于批量创建层级目录
 */
export interface HierarchyNode {
  // 页面标题
  title: string;
  // 页面内容 (Markdown)
  content?: string;
  // 原始 URL
  url?: string;
  // AI 生成的元数据
  metadata?: {
    summary?: string;
    tags?: string[];
    keyPoints?: string[];
    category?: string;
  };
  // 子节点
  children?: HierarchyNode[];
}

/**
 * 层级创建请求
 */
export interface CreateHierarchyRequest {
  // 根页面 ID (在哪个页面下创建)
  parentId: string;
  // 空间 ID
  spaceId: string;
  // 层级结构
  hierarchy: HierarchyNode;
  // 选项
  options?: CreateHierarchyOptions;
}

/**
 * 层级创建选项
 */
export interface CreateHierarchyOptions {
  // 是否包含原始内容 (默认 true)
  includeContent?: boolean;
  // 是否包含 AI 摘要 (默认 true)
  includeSummary?: boolean;
  // 是否包含标签 (默认 true)
  includeTags?: boolean;
  // 请求间隔 (毫秒，默认 350ms 以满足 3 req/s 限制)
  requestInterval?: number;
  // 失败重试次数 (默认 3)
  maxRetries?: number;
}

/**
 * 单个页面创建结果
 */
export interface PageCreateResult {
  // 页面 ID
  pageId: string;
  // 页面标题
  title: string;
  // 页面 URL
  href: string;
  // 是否成功
  success: boolean;
  // 错误信息
  error?: string;
  // 子页面结果
  children?: PageCreateResult[];
}

/**
 * 层级创建进度回调
 */
export interface CreateHierarchyProgress {
  // 当前处理的页面
  current: string;
  // 已完成数量
  completed: number;
  // 总数量
  total: number;
  // 当前状态
  status: 'pending' | 'creating' | 'uploading' | 'done' | 'error';
}
