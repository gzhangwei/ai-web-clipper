/**
 * AI 处理服务类型定义
 */

// AI 处理请求
export interface AIProcessRequest {
  // 原始内容 (Markdown 或纯文本)
  content: string;
  // 页面标题
  title: string;
  // 页面 URL
  url?: string;
  // 处理选项
  options?: AIProcessOptions;
}

// AI 处理选项
export interface AIProcessOptions {
  // 生成摘要
  generateSummary?: boolean;
  // 生成关键点
  generateKeyPoints?: boolean;
  // 生成标签
  generateTags?: boolean;
  // 生成 Q&A
  generateQA?: boolean;
  // 生成行动项
  generateActionItems?: boolean;
  // 自定义 prompt
  customPrompt?: string;
  // 目标语言 (默认跟随原文)
  targetLanguage?: string;
  // 最大标签数量
  maxTags?: number;
  // 最大关键点数量
  maxKeyPoints?: number;
}

// AI 处理结果
export interface AIProcessResult {
  // 摘要
  summary?: string;
  // 关键点列表
  keyPoints?: string[];
  // 标签列表
  tags?: string[];
  // Q&A 列表
  qa?: Array<{ question: string; answer: string }>;
  // 行动项
  actionItems?: string[];
  // 内容分类
  category?: string;
  // 原始内容 (处理后)
  processedContent?: string;
  // 处理元数据
  metadata?: {
    model: string;
    tokensUsed?: number;
    processingTime?: number;
  };
}

// AI 服务配置
export interface AIServiceConfig {
  // API 提供商
  provider: 'openai' | 'azure' | 'custom';
  // API Key (建议通过后端代理)
  apiKey?: string;
  // API 端点 (自定义或 Azure)
  endpoint?: string;
  // 模型名称
  model?: string;
  // 最大 tokens
  maxTokens?: number;
  // 温度参数
  temperature?: number;
}

// AI 服务接口
export interface IAIService {
  // 处理内容
  process(request: AIProcessRequest): Promise<AIProcessResult>;
  // 检查服务是否可用
  isAvailable(): Promise<boolean>;
  // 获取当前配置
  getConfig(): AIServiceConfig;
  // 更新配置
  updateConfig(config: Partial<AIServiceConfig>): void;
}

// 默认处理选项
export const DEFAULT_PROCESS_OPTIONS: AIProcessOptions = {
  generateSummary: true,
  generateKeyPoints: true,
  generateTags: true,
  generateQA: false,
  generateActionItems: false,
  maxTags: 5,
  maxKeyPoints: 5,
};

// 默认服务配置
export const DEFAULT_SERVICE_CONFIG: AIServiceConfig = {
  provider: 'openai',
  model: 'gpt-3.5-turbo',
  maxTokens: 2000,
  temperature: 0.3,
};
