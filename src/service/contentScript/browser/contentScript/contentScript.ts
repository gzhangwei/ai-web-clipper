import { IContentScriptService, IToggleConfig } from '@/service/common/contentScript';
import { Service, Inject } from 'typedi';
import styles from '@/service/contentScript/browser/contentScript/contentScript.less';
import * as QRCode from 'qrcode';
import { Readability } from '@web-clipper/readability';
import AreaSelector from '@web-clipper/area-selector';
import Highlighter from '@web-clipper/highlight';
import plugins from '@web-clipper/turndown';
import TurndownService from 'turndown';
import { ContentScriptContext } from '@/extensions/common';
import { localStorageService } from '@/common/chrome/storage';
import { LOCAL_USER_PREFERENCE_LOCALE_KEY } from '@/common/types';
import { IExtensionContainer } from '@/service/common/extension';
import { getResourcePath } from '@/common/getResource';

const turndownService = new TurndownService({ codeBlockStyle: 'fenced' });
turndownService.use(plugins);

// 自定义规则：处理没有 <th> 标头的表格（GFM 默认只处理有 <th> 的表格）
turndownService.addRule('tableWithoutHeaders', {
  filter: (node: HTMLElement) => {
    if (node.nodeName !== 'TABLE') return false;
    const rows = (node as HTMLTableElement).rows;
    if (!rows || rows.length === 0) return false;
    // 检查第一行是否全是 TH（如果是，GFM 插件会处理）
    const firstRow = rows[0];
    const allTh = Array.from(firstRow.cells).every(cell => cell.nodeName === 'TH');
    // 只处理没有 TH 标头的表格
    return !allTh;
  },
  replacement: (_content: string, node: HTMLElement) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.rows);
    if (rows.length === 0) return '';

    const markdownRows: string[] = [];

    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.cells);
      const cellContents = cells.map(cell => {
        // 清理单元格内容：移除多余空白和换行
        let text = cell.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        // 转义管道符号
        text = text.replace(/\|/g, '\\|');
        return text;
      });

      // 构建表格行
      const rowStr = '| ' + cellContents.join(' | ') + ' |';
      markdownRows.push(rowStr);

      // 在第一行后添加分隔行
      if (rowIndex === 0) {
        const separator = '| ' + cells.map(() => '---').join(' | ') + ' |';
        markdownRows.push(separator);
      }
    });

    return '\n\n' + markdownRows.join('\n') + '\n\n';
  },
});

// 自定义规则：处理空链接 [](url) -> 移除或转为纯URL
turndownService.addRule('emptyLinks', {
  filter: (node: HTMLElement) => {
    return (
      node.nodeName === 'A' &&
      node.getAttribute('href') &&
      !node.textContent?.trim()
    );
  },
  replacement: (_content: string, node: HTMLElement) => {
    // 空链接直接移除，不保留
    return '';
  },
});

// 自定义规则：处理只有图片的链接，避免生成空括号
turndownService.addRule('imageOnlyLinks', {
  filter: (node: HTMLElement) => {
    if (node.nodeName !== 'A') return false;
    const children = node.childNodes;
    // 只有一个子节点且是图片
    return children.length === 1 && children[0].nodeName === 'IMG';
  },
  replacement: (_content: string, node: HTMLElement) => {
    const img = node.querySelector('img');
    if (!img) return '';
    const alt = img.getAttribute('alt') || '';
    const src = img.getAttribute('src') || '';
    const href = node.getAttribute('href') || '';
    // 返回带链接的图片
    if (src) {
      return `[![${alt}](${src})](${href})`;
    }
    return '';
  },
});

class ContentScriptService implements IContentScriptService {
  constructor(@Inject(IExtensionContainer) private extensionContainer: IExtensionContainer) {}

  async remove() {
    $(`.${styles.toolFrame}`).remove();
  }
  async hide() {
    $(`.${styles.toolFrame}`).hide();
  }
  async toggle(config: IToggleConfig) {
    const toolPath = getResourcePath('tool.html');
    let src = chrome.runtime.getURL(toolPath);
    if (config) {
      src = `${chrome.runtime.getURL(toolPath)}#${config.pathname}?${config.query}`;
    }
    if ($(`.${styles.toolFrame}`).length === 0) {
      if (config) {
        $('body').append(`<iframe src="${src}" class=${styles.toolFrame}></iframe>`);
        return;
      }
      $('body').append(`<iframe src="${src}" class=${styles.toolFrame}></iframe>`);
    } else {
      const srcRaw = $(`.${styles.toolFrame}`).attr('src');

      if (srcRaw !== src) {
        $(`.${styles.toolFrame}`).attr('src', src);
      }
      $(`.${styles.toolFrame}`).toggle();
    }
  }
  async getSelectionMarkdown() {
    let selection = document.getSelection();
    if (selection?.rangeCount) {
      let container = document.createElement('div');
      for (let i = 0, len = selection.rangeCount; i < len; ++i) {
        container.appendChild(selection.getRangeAt(i).cloneContents());
      }
      return turndownService.turndown(container.innerHTML);
    }
    return '';
  }
  async checkStatus() {
    return true;
  }
  async getPageUrl() {
    return location.href;
  }
  async toggleLoading() {
    const loadIngStyle = styles['web-clipper-loading-box'];
    if ($(`.${loadIngStyle}`).length === 0) {
      $('body').append(`
      <div class=${loadIngStyle}>
        <div class="web-clipper-loading">
          <div>
            <div class="line"></div>
            <div class="line"></div>
            <div class="line"></div>
            <div class="line"></div>
          </div>
        </div>
      </div>
      `);
    } else {
      $(`.${loadIngStyle}`).remove();
    }
  }

  async runScript(id: string, lifeCycle: 'run' | 'destroy') {
    const extensions = this.extensionContainer.extensions;
    console.log(`[ContentScript] runScript called: id=${id}, lifeCycle=${lifeCycle}, extensions count=${extensions.length}`);

    const extension = extensions.find((o) => o.id === id);
    console.log(`[ContentScript] Extension found:`, extension ? `yes (type=${extension.type})` : 'no');

    if (extension) {
      console.log(`[ContentScript] Extension lifecycle methods:`, Object.keys(extension.extensionLifeCycle || {}));
    }

    const lifeCycleFunc = extension?.extensionLifeCycle[lifeCycle];
    console.log(`[ContentScript] lifeCycleFunc exists:`, !!lifeCycleFunc);

    if (!lifeCycleFunc) {
      console.warn(`[ContentScript] No ${lifeCycle} function found for extension ${id}`);
      return;
    }
    await localStorageService.init();
    const toggleClipper = () => {
      $(`.${styles.toolFrame}`).toggle();
    };
    const context: ContentScriptContext = {
      locale: localStorageService.get(LOCAL_USER_PREFERENCE_LOCALE_KEY, navigator.language),
      turndown: turndownService,
      Highlighter: Highlighter,
      toggleClipper,
      Readability,
      document,
      AreaSelector,
      QRCode,
      $,
      toggleLoading: () => {
        this.toggleLoading();
      },
    };
    $(`.${styles.toolFrame}`).blur();
    try {
      const result = await lifeCycleFunc(context);
      console.log(`[ContentScript] ${lifeCycle} result:`, result);
      return result;
    } catch (e) {
      console.error(`[ContentScript] ${lifeCycle} error:`, e);
      throw e;
    }
  }
}

Service(IContentScriptService)(ContentScriptService);
