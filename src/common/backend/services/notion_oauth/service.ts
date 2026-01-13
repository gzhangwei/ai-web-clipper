import { Container } from 'typedi';
import { DocumentService, CreateDocumentRequest } from '../../index';
import { CompleteStatus, UnauthorizedError } from '../interface';
import md5 from '@web-clipper/shared/lib/md5';
import axios, { AxiosInstance } from 'axios';
import localeService from '@/common/locales';
import {
  NotionOAuthBackendServiceConfig,
  NotionApiUserResponse,
  NotionApiSearchResponse,
  NotionApiPage,
  NotionOAuthRepository,
} from './interface';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';
const PAGE = 'page';

export default class NotionOAuthDocumentService implements DocumentService {
  private request: AxiosInstance;
  private config: NotionOAuthBackendServiceConfig;
  private repositories: NotionOAuthRepository[];
  private cachedUserInfo?: NotionApiUserResponse;

  constructor(config: NotionOAuthBackendServiceConfig) {
    this.config = config;
    this.repositories = [];

    this.request = axios.create({
      baseURL: NOTION_API_BASE,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${config.access_token}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
      },
    });

    this.request.interceptors.response.use(
      (r) => r,
      (error) => {
        if (error.response && error.response.status === 401) {
          return Promise.reject(
            new UnauthorizedError(
              localeService.format({
                id: 'backend.services.notion_oauth.unauthorizedErrorMessage',
                defaultMessage: 'Authorization expired. Please re-authorize with Notion.',
              })
            )
          );
        }
        if (error.response && error.response.status === 403) {
          return Promise.reject(
            new UnauthorizedError(
              localeService.format({
                id: 'backend.services.notion_oauth.noAccess',
                defaultMessage: 'No access to this resource. Please check your permissions.',
              })
            )
          );
        }
        return Promise.reject(error);
      }
    );
  }

  getId = () => md5(this.config.access_token);

  getUserInfo = async () => {
    if (!this.cachedUserInfo) {
      const response = await this.request.get<NotionApiUserResponse>('/users/me');
      this.cachedUserInfo = response.data;
    }
    const user = this.cachedUserInfo;

    // 对于 bot 类型的用户，获取工作空间名称
    let name = user.name || 'Notion';
    let description = '';

    if (user.type === 'bot' && user.bot?.workspace_name) {
      name = user.bot.workspace_name;
      description = 'Workspace';
    } else if (user.type === 'person' && user.person?.email) {
      description = user.person.email;
    }

    // 如果有存储的工作空间名称，使用它
    if (this.config.workspace_name) {
      name = this.config.workspace_name;
    }

    return {
      name,
      avatar: user.avatar_url || 'https://www.notion.so/images/favicon.ico',
      homePage: 'https://www.notion.so/',
      description,
    };
  };

  getRepositories = async (): Promise<NotionOAuthRepository[]> => {
    const repositories: NotionOAuthRepository[] = [];
    let hasMore = true;
    let startCursor: string | undefined;

    // 获取工作空间名称作为分组名
    const groupName = this.config.workspace_name || 'Notion';

    while (hasMore) {
      const response = await this.request.post<NotionApiSearchResponse>('/search', {
        filter: {
          value: 'page',
          property: 'object',
        },
        sort: {
          direction: 'descending',
          timestamp: 'last_edited_time',
        },
        start_cursor: startCursor,
        page_size: 100,
      });

      const { results, has_more, next_cursor } = response.data;

      for (const page of results) {
        if (page.object === 'page') {
          const title = this.extractPageTitle(page);
          if (title) {
            repositories.push({
              id: page.id,
              name: title,
              groupId: this.getParentId(page),
              groupName: groupName,
              pageType: PAGE,
            });
          }
        }
      }

      hasMore = has_more;
      startCursor = next_cursor || undefined;

      // 限制最多获取 500 个页面
      if (repositories.length >= 500) {
        break;
      }
    }

    this.repositories = repositories;
    return repositories;
  };

  createDocument = async ({
    repositoryId,
    title,
    content,
  }: CreateDocumentRequest): Promise<CompleteStatus> => {
    // 将 Markdown 内容转换为 Notion blocks
    const children = this.markdownToNotionBlocks(content);

    // 创建页面
    const response = await this.request.post<{ id: string; url: string }>('/pages', {
      parent: {
        page_id: repositoryId,
      },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
      children,
    });

    return {
      href: response.data.url,
    };
  };

  /**
   * 从页面对象中提取标题
   */
  private extractPageTitle(page: NotionApiPage): string | null {
    // 尝试从 title 属性获取
    if (page.properties.title?.title?.length) {
      return page.properties.title.title.map(t => t.plain_text).join('');
    }
    // 尝试从 Name 属性获取（数据库页面常用）
    if (page.properties.Name?.title?.length) {
      return page.properties.Name.title.map(t => t.plain_text).join('');
    }
    // 遍历其他属性查找 title 类型
    for (const [, value] of Object.entries(page.properties)) {
      if (value?.type === 'title' && value.title?.length) {
        return value.title.map((t: { plain_text: string }) => t.plain_text).join('');
      }
    }
    return null;
  }

  /**
   * 获取父级 ID
   */
  private getParentId(page: NotionApiPage): string {
    if (page.parent.type === 'workspace') {
      return 'workspace';
    }
    if (page.parent.page_id) {
      return page.parent.page_id;
    }
    if (page.parent.database_id) {
      return page.parent.database_id;
    }
    return 'unknown';
  }

  /**
   * 将 Markdown 转换为 Notion blocks
   */
  private markdownToNotionBlocks(markdown: string): any[] {
    const lines = markdown.split('\n');
    const blocks: any[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;

      // 标题
      if (line.startsWith('### ')) {
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: line.slice(4) } }],
          },
        });
      } else if (line.startsWith('## ')) {
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: line.slice(3) } }],
          },
        });
      } else if (line.startsWith('# ')) {
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
          },
        });
      }
      // 无序列表
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
          },
        });
      }
      // 有序列表
      else if (/^\d+\.\s/.test(line)) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [{ type: 'text', text: { content: line.replace(/^\d+\.\s/, '') } }],
          },
        });
      }
      // 代码块标记
      else if (line.startsWith('```')) {
        continue;
      }
      // 引用
      else if (line.startsWith('> ')) {
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: line.slice(2) } }],
          },
        });
      }
      // 普通段落
      else {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: line } }],
          },
        });
      }
    }

    // Notion API 限制每次最多 100 个 blocks
    return blocks.slice(0, 100);
  }
}
