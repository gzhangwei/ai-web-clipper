interface WebClipperConfig {
  icon: string;
  iconDark: string;
  yuqueClientId: string;
  yuqueCallback: string;
  yuqueScope: string;
  oneNoteCallBack: string;
  oneNoteClientId: string;
  // Notion OAuth 配置
  notionClientId: string;
  notionCallback: string;
}

export interface RemoteConfig {
  iconfont: string;
  chromeWebStoreVersion: string;
}

let config: WebClipperConfig = {
  icon: 'icons/icon.png',
  iconDark: 'icons/icon-dark.png',
  yuqueClientId: 'D1AwzCeDPLFWGfcGv7ze',
  yuqueCallback: 'http://webclipper-oauth.yfd.im/yuque_oauth',
  yuqueScope: 'doc,group,repo,attach_upload',
  oneNoteClientId: '563571ad-cfcd-442a-aa34-046bad24b1b6',
  oneNoteCallBack: 'https://webclipper-oauth.yfd.im/onenote_oauth',
  // Notion OAuth 配置
  notionClientId: '2e6d872b-594c-8077-b469-0037c71d5685',
  notionCallback: 'https://notion-oauth.xxynly.workers.dev/notion_oauth',
};

if (process.env.NODE_ENV === 'development') {
  config = Object.assign({}, config, {
    icon: 'icons/icon-dev.png',
  });
}

export default config;
