import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input, Alert } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import React, { Component, Fragment } from 'react';
import { NotionBackendServiceConfig } from './types';
import { FormattedMessage } from 'react-intl';

interface NotionFormProps {
  verified?: boolean;
  info?: NotionBackendServiceConfig;
}

export default class NotionForm extends Component<NotionFormProps & FormComponentProps> {
  render() {
    const {
      form: { getFieldDecorator },
      info,
      verified,
    } = this.props;

    let initData: Partial<NotionBackendServiceConfig> = {};
    if (info) {
      initData = info;
    }
    const editMode = !!info;

    return (
      <Fragment>
        <Alert
          style={{ marginBottom: 16 }}
          type="info"
          message={
            <FormattedMessage
              id="backend.services.notion.form.apiKeyHelp"
              defaultMessage="Get your API Key from Notion Integrations page, then share pages with your integration."
            />
          }
          description={
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
            >
              https://www.notion.so/my-integrations
            </a>
          }
        />
        <Form.Item
          label={
            <FormattedMessage
              id="backend.services.notion.form.apiKey"
              defaultMessage="API Key (Integration Token)"
            />
          }
        >
          {getFieldDecorator('apiKey', {
            initialValue: initData.apiKey,
            rules: [
              {
                required: true,
                message: (
                  <FormattedMessage
                    id="backend.services.notion.form.apiKeyRequired"
                    defaultMessage="API Key is required!"
                  />
                ),
              },
            ],
          })(
            <Input.Password
              placeholder="secret_xxxxxxxxxxxxx"
              disabled={editMode || verified}
            />
          )}
        </Form.Item>
      </Fragment>
    );
  }
}
