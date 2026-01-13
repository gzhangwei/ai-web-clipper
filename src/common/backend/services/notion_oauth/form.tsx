import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import React, { Component, Fragment } from 'react';
import { NotionOAuthBackendServiceConfig } from './interface';
import { FormattedMessage } from 'react-intl';

interface NotionOAuthFormProps {
  verified?: boolean;
  info?: NotionOAuthBackendServiceConfig;
}

export default class NotionOAuthForm extends Component<NotionOAuthFormProps & FormComponentProps> {
  render() {
    const {
      form: { getFieldDecorator },
      info,
      verified,
    } = this.props;

    let initData: Partial<NotionOAuthBackendServiceConfig> = {};
    if (info) {
      initData = info;
    }

    return (
      <Fragment>
        <Form.Item
          label={
            <FormattedMessage
              id="backend.services.notion_oauth.form.accessToken"
              defaultMessage="Access Token"
            />
          }
        >
          {getFieldDecorator('access_token', {
            initialValue: initData.access_token,
            rules: [
              {
                required: true,
                message: (
                  <FormattedMessage
                    id="backend.services.notion_oauth.form.accessTokenRequired"
                    defaultMessage="Access Token is required"
                  />
                ),
              },
            ],
          })(<Input disabled={verified} />)}
        </Form.Item>
        {initData.workspace_name && (
          <Form.Item
            label={
              <FormattedMessage
                id="backend.services.notion_oauth.form.workspace"
                defaultMessage="Workspace"
              />
            }
          >
            <Input disabled value={initData.workspace_name} />
          </Form.Item>
        )}
      </Fragment>
    );
  }
}
