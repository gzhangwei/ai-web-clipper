/**
 * 批量剪切服务 - 类型定义
 */

/**
 * 章节节点 - 从目录页解析出的链接结构
 */
export interface ChapterNode {
  // 章节标题
  title: string;
  // 章节 URL
  url: string;
  // 层级深度 (0 = 根级)
  depth: number;
  // 子章节
  children?: ChapterNode[];
}

/**
 * 目录解析结果
 */
export interface TOCParseResult {
  // 根标题 (整个目录的标题)
  rootTitle: string;
  // 章节树
  chapters: ChapterNode[];
  // 解析来源
  source: 'nav' | 'sidebar' | 'toc' | 'links' | 'ai';
  // 总链接数
  totalLinks: number;
}

/**
 * 页面抓取结果
 */
export interface PageFetchResult {
  // 页面 URL
  url: string;
  // 页面标题
  title: string;
  // 页面内容 (Markdown)
  content: string;
  // 是否成功
  success: boolean;
  // 错误信息
  error?: string;
}

/**
 * 批量处理进度
 */
export interface BatchProgress {
  // 当前阶段
  stage: 'parsing' | 'fetching' | 'processing' | 'saving' | 'done' | 'error';
  // 当前处理的项目
  current?: string;
  // 已完成数量
  completed: number;
  // 总数量
  total: number;
  // 错误列表
  errors?: string[];
}

/**
 * 批量剪切请求
 */
export interface BatchClipRequest {
  // 目录页 URL
  tocUrl: string;
  // 目标 Notion 页面 ID
  notionParentId: string;
  // 选项
  options?: BatchClipOptions;
}

/**
 * 批量剪切选项
 */
export interface BatchClipOptions {
  // 是否使用 AI 处理
  useAI?: boolean;
  // 最大并发数
  maxConcurrency?: number;
  // 请求间隔 (毫秒)
  requestInterval?: number;
  // 最大深度 (-1 = 无限)
  maxDepth?: number;
  // URL 过滤模式 (正则)
  urlFilter?: string;
  // 排除模式
  excludePattern?: string;
}

/**
 * 批量剪切结果
 */
export interface BatchClipResult {
  // 是否成功
  success: boolean;
  // 根页面 URL
  rootPageUrl?: string;
  // 成功数量
  successCount: number;
  // 失败数量
  failCount: number;
  // 详细结果
  details?: Array<{
    title: string;
    url: string;
    success: boolean;
    error?: string;
  }>;
}

// 默认选项
export const DEFAULT_BATCH_OPTIONS: Required<BatchClipOptions> = {
  useAI: true,
  maxConcurrency: 3,
  requestInterval: 500,
  maxDepth: -1,
  urlFilter: '',
  excludePattern: '',
};
