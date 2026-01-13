/**
 * Notion OAuth 服务配置接口
 */
export interface NotionOAuthBackendServiceConfig {
  // OAuth 获取的访问令牌
  access_token: string;
  // 工作空间 ID
  workspace_id?: string;
  // 工作空间名称
  workspace_name?: string;
  // Bot ID
  bot_id?: string;
}

/**
 * Notion 官方 API 用户信息响应
 */
export interface NotionApiUserResponse {
  object: 'user';
  id: string;
  name: string;
  avatar_url: string | null;
  type: 'person' | 'bot';
  person?: {
    email: string;
  };
  bot?: {
    owner: {
      type: 'workspace' | 'user';
      workspace?: boolean;
    };
    workspace_name?: string;
  };
}

/**
 * Notion 官方 API 搜索响应
 */
export interface NotionApiSearchResponse {
  object: 'list';
  results: NotionApiPage[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Notion 官方 API 页面对象
 */
export interface NotionApiPage {
  object: 'page' | 'database';
  id: string;
  created_time: string;
  last_edited_time: string;
  parent: {
    type: 'workspace' | 'page_id' | 'database_id';
    workspace?: boolean;
    page_id?: string;
    database_id?: string;
  };
  properties: {
    title?: {
      type: 'title';
      title: Array<{ plain_text: string }>;
    };
    Name?: {
      type: 'title';
      title: Array<{ plain_text: string }>;
    };
    [key: string]: any;
  };
  icon?: {
    type: 'emoji' | 'external' | 'file';
    emoji?: string;
    external?: { url: string };
    file?: { url: string };
  } | null;
  url: string;
}

/**
 * Notion 仓库（页面）
 */
export interface NotionOAuthRepository {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  pageType: string;
}
