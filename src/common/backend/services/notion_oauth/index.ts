import config from '@/config';
import { ServiceMeta } from '../interface';
import Service from './service';
import Form from './form';
import localeService from '@/common/locales';
import { stringify } from 'qs';
import { IConfigService } from '@/service/common/config';
import { Container } from 'typedi';

export default (): ServiceMeta => {
  // 在函数内部获取 state，避免在模块加载时就调用 Container.get
  let state = '';
  try {
    state = Container.get(IConfigService).id;
  } catch (e) {
    // 如果服务还未初始化，使用空字符串
    console.warn('IConfigService not ready, state will be empty');
  }

  // Notion OAuth 授权 URL
  // owner=user 表示以用户身份授权
  const oauthUrl = `https://api.notion.com/v1/oauth/authorize?${stringify({
    client_id: config.notionClientId,
    redirect_uri: config.notionCallback,
    response_type: 'code',
    owner: 'user',
    state: state,
  })}`;

  return {
    name: localeService.format({
      id: 'backend.services.notion_oauth.name',
      defaultMessage: 'Notion (OAuth)',
    }),
    icon: 'https://www.notion.so/images/favicon.ico',
    type: 'notion_oauth',
    service: Service,
    oauthUrl,
    form: Form,
    homePage: 'https://www.notion.so/',
    permission: {
      origins: ['https://api.notion.com/*'],
    },
  };
};
