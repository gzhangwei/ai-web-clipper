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
