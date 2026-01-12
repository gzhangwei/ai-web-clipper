/**
 * 目录解析器 - 从页面 DOM 中提取章节结构
 */

import { ChapterNode, TOCParseResult } from './types';

/**
 * 目录解析器
 * 支持多种常见的文档站点结构
 */
export class TOCParser {
  private baseUrl: string;
  private document: Document;

  constructor(document: Document, baseUrl: string) {
    this.document = document;
    this.baseUrl = baseUrl;
  }

  /**
   * 解析目录结构
   */
  parse(): TOCParseResult {
    // 尝试多种解析策略，返回最佳结果
    const strategies = [
      () => this.parseNavElement(),
      () => this.parseSidebar(),
      () => this.parseTOCElement(),
      () => this.parseMainLinks(),
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result && result.chapters.length > 0) {
        return result;
      }
    }

    // 如果都失败，返回空结果
    return {
      rootTitle: this.document.title || 'Untitled',
      chapters: [],
      source: 'links',
      totalLinks: 0,
    };
  }

  /**
   * 策略1: 解析 <nav> 元素
   */
  private parseNavElement(): TOCParseResult | null {
    const navs = this.document.querySelectorAll('nav');

    for (const nav of navs) {
      const links = this.extractLinksFromElement(nav);
      if (links.length >= 3) {
        return {
          rootTitle: this.getRootTitle(),
          chapters: this.buildTree(links),
          source: 'nav',
          totalLinks: links.length,
        };
      }
    }
    return null;
  }

  /**
   * 策略2: 解析侧边栏
   */
  private parseSidebar(): TOCParseResult | null {
    const sidebarSelectors = [
      '.sidebar',
      '.side-bar',
      '.sidenav',
      '.side-nav',
      '[class*="sidebar"]',
      '[class*="sidenav"]',
      'aside',
      '.toc',
      '.table-of-contents',
      '.menu',
      '.nav-menu',
      // GitBook
      '.book-summary',
      // Docusaurus
      '.theme-doc-sidebar-container',
      // MkDocs
      '.md-sidebar',
      // VuePress
      '.sidebar-links',
    ];

    for (const selector of sidebarSelectors) {
      try {
        const elements = this.document.querySelectorAll(selector);
        for (const el of elements) {
          const links = this.extractLinksFromElement(el);
          if (links.length >= 3) {
            return {
              rootTitle: this.getRootTitle(),
              chapters: this.buildTree(links),
              source: 'sidebar',
              totalLinks: links.length,
            };
          }
        }
      } catch (e) {
        // 选择器可能无效，跳过
      }
    }
    return null;
  }

  /**
   * 策略3: 解析 TOC 元素
   */
  private parseTOCElement(): TOCParseResult | null {
    const tocSelectors = [
      '#toc',
      '.toc',
      '#table-of-contents',
      '.table-of-contents',
      '[id*="toc"]',
      '[class*="toc"]',
    ];

    for (const selector of tocSelectors) {
      try {
        const elements = this.document.querySelectorAll(selector);
        for (const el of elements) {
          const links = this.extractLinksFromElement(el);
          if (links.length >= 3) {
            return {
              rootTitle: this.getRootTitle(),
              chapters: this.buildTree(links),
              source: 'toc',
              totalLinks: links.length,
            };
          }
        }
      } catch (e) {
        // 跳过
      }
    }
    return null;
  }

  /**
   * 策略4: 解析主内容区的链接
   */
  private parseMainLinks(): TOCParseResult | null {
    const mainSelectors = ['main', 'article', '.content', '.main-content', '#content'];

    for (const selector of mainSelectors) {
      try {
        const main = this.document.querySelector(selector);
        if (main) {
          const links = this.extractLinksFromElement(main);
          // 过滤掉明显不是章节的链接
          const filtered = links.filter(link => this.isChapterLink(link));
          if (filtered.length >= 3) {
            return {
              rootTitle: this.getRootTitle(),
              chapters: this.buildTree(filtered),
              source: 'links',
              totalLinks: filtered.length,
            };
          }
        }
      } catch (e) {
        // 跳过
      }
    }
    return null;
  }

  /**
   * 从元素中提取链接
   */
  private extractLinksFromElement(element: Element): Array<{
    title: string;
    url: string;
    depth: number;
    element: Element;
  }> {
    const links: Array<{ title: string; url: string; depth: number; element: Element }> = [];
    const anchors = element.querySelectorAll('a[href]');

    for (const anchor of anchors) {
      const href = anchor.getAttribute('href');
      if (!href) continue;

      // 跳过锚点链接、外部链接、javascript 链接
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

      // 跳过隐藏的链接
      const style = window.getComputedStyle?.(anchor as HTMLElement);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;

      const url = this.normalizeUrl(href);
      if (!url || !this.isSameDomain(url)) continue;

      // 跳过当前页面的链接
      if (url === this.baseUrl || url === this.baseUrl + '/') continue;

      const title = this.getCleanText(anchor);
      if (!title || title.length < 2 || title.length > 200) continue;

      // 跳过只有图标/图片的链接
      const hasOnlyImage = anchor.querySelectorAll('img, svg').length > 0 &&
                          !anchor.textContent?.trim();
      if (hasOnlyImage) continue;

      // 计算深度（基于 DOM 结构）
      const depth = this.calculateDepth(anchor, element);

      links.push({ title, url, depth, element: anchor });
    }

    // 去重
    const seen = new Set<string>();
    return links.filter(link => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    });
  }

  /**
   * 构建章节树
   */
  private buildTree(links: Array<{ title: string; url: string; depth: number }>): ChapterNode[] {
    if (links.length === 0) return [];

    // 简化处理：按深度分组，构建层级
    const minDepth = Math.min(...links.map(l => l.depth));

    const result: ChapterNode[] = [];
    const stack: { node: ChapterNode; depth: number }[] = [];

    for (const link of links) {
      const node: ChapterNode = {
        title: link.title,
        url: link.url,
        depth: link.depth - minDepth,
        children: [],
      };

      // 找到合适的父节点
      while (stack.length > 0 && stack[stack.length - 1].depth >= link.depth) {
        stack.pop();
      }

      if (stack.length === 0) {
        result.push(node);
      } else {
        const parent = stack[stack.length - 1].node;
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      }

      stack.push({ node, depth: link.depth });
    }

    return result;
  }

  /**
   * 计算链接的深度
   */
  private calculateDepth(anchor: Element, container: Element): number {
    let depth = 0;
    let current: Element | null = anchor;
    let foundList = false;

    while (current && current !== container) {
      const tagName = current.tagName.toLowerCase();

      // 嵌套的 ul/ol 增加深度
      if ((tagName === 'ul' || tagName === 'ol') && foundList) {
        depth++;
      }

      if (tagName === 'ul' || tagName === 'ol') {
        foundList = true;
      }

      // 检查是否有明确的层级 class
      const classList = current.className?.toLowerCase() || '';
      if (classList.includes('level-') || classList.includes('depth-') || classList.includes('indent')) {
        const match = classList.match(/(?:level|depth)-(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }

      // 检查 aria-level 属性
      const ariaLevel = current.getAttribute('aria-level');
      if (ariaLevel) {
        return parseInt(ariaLevel, 10) - 1;
      }

      current = current.parentElement;
    }

    return depth;
  }

  /**
   * 判断是否为章节链接
   */
  private isChapterLink(link: { title: string; url: string }): boolean {
    const title = link.title.toLowerCase();
    const url = link.url.toLowerCase();

    // 标题太短或太长的跳过
    if (link.title.length < 2 || link.title.length > 200) {
      return false;
    }

    // 排除常见的非章节链接
    const excludePatterns = [
      /^(home|首页|返回|back|top|login|logout|sign|register|edit|delete|copy|share|print)/i,
      /^(github|twitter|facebook|linkedin|youtube|instagram|discord)/i,
      /^(previous|next|上一页|下一页|prev|next page)/i,
      /^(搜索|search|find)/i,
      /^(contact|联系|about|关于|help|帮助|faq|support)/i,
      /^(\d+|#\d+|page \d+)$/i, // 纯数字或页码
      /\.(png|jpg|jpeg|gif|svg|pdf|zip|exe|dmg|pkg|tar|gz)$/i,
      /(twitter\.com|facebook\.com|github\.com|linkedin\.com|youtube\.com)/i,
      /(\?|&)(share|comment|reply|edit|delete)/i,
      /^(view|download|更多|more|see more|read more)/i,
      /^\[.*\]$/i, // [something] 格式
      /^<|>$/i, // 导航箭头
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(title) || pattern.test(url)) {
        return false;
      }
    }

    // URL 必须看起来像文档页面
    const docPatterns = [
      /\.(html?|md|mdx|rst|txt)$/i,
      /\/docs?\//i,
      /\/guide\//i,
      /\/tutorial/i,
      /\/chapter/i,
      /\/section/i,
      /\/learn/i,
      /\/getting-started/i,
      /\/api\//i,
      /\/reference/i,
    ];

    // 如果 URL 匹配文档模式，更可能是章节
    const looksLikeDoc = docPatterns.some(p => p.test(url));

    // URL 不应该包含太多查询参数（通常是功能链接）
    try {
      const parsed = new URL(url);
      if (parsed.search.length > 50) {
        return false;
      }
    } catch {
      // ignore
    }

    return true;
  }

  /**
   * 获取根标题
   */
  private getRootTitle(): string {
    // 优先使用 h1
    const h1 = this.document.querySelector('h1');
    if (h1) {
      const text = this.getCleanText(h1);
      if (text) return text;
    }

    // 使用 title
    return this.document.title || 'Untitled';
  }

  /**
   * 获取干净的文本
   */
  private getCleanText(element: Element): string {
    return (element.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 规范化 URL
   */
  private normalizeUrl(href: string): string {
    try {
      return new URL(href, this.baseUrl).href;
    } catch {
      return '';
    }
  }

  /**
   * 检查是否同域
   */
  private isSameDomain(url: string): boolean {
    try {
      const base = new URL(this.baseUrl);
      const target = new URL(url);
      return base.hostname === target.hostname;
    } catch {
      return false;
    }
  }
}

/**
 * 扁平化章节树
 */
export function flattenChapters(chapters: ChapterNode[]): ChapterNode[] {
  const result: ChapterNode[] = [];

  function traverse(nodes: ChapterNode[]) {
    for (const node of nodes) {
      result.push(node);
      if (node.children) {
        traverse(node.children);
      }
    }
  }

  traverse(chapters);
  return result;
}

/**
 * 计算章节总数
 */
export function countChapters(chapters: ChapterNode[]): number {
  return flattenChapters(chapters).length;
}
