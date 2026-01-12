import * as React from 'react';
import { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Switch, message, Card, InputNumber, Space } from 'antd';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  AIServiceConfig,
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_PROCESS_OPTIONS,
  AIProcessOptions,
} from '@/service/ai/types';
import { loadAIConfig, saveAIConfig } from '@/service/ai/storage';
import styles from '../index.less';

const { Option } = Select;

const AISettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const intl = useIntl();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await loadAIConfig();
      form.setFieldsValue(config);
    } catch (e) {
      console.error('Failed to load AI config:', e);
    }
  };

  const handleSave = async (values: AIServiceConfig) => {
    setLoading(true);
    try {
      await saveAIConfig(values);
      message.success(
        intl.formatMessage({
          id: 'preference.ai.save.success',
          defaultMessage: 'AI settings saved successfully',
        })
      );
    } catch (e) {
      message.error(
        intl.formatMessage({
          id: 'preference.ai.save.error',
          defaultMessage: 'Failed to save AI settings',
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    const apiKey = form.getFieldValue('apiKey');
    if (!apiKey) {
      message.warning(
        intl.formatMessage({
          id: 'preference.ai.test.noKey',
          defaultMessage: 'Please enter your API key first',
        })
      );
      return;
    }

    setTestLoading(true);
    try {
      const endpoint = form.getFieldValue('endpoint') || 'https://api.openai.com/v1/chat/completions';
      const model = form.getFieldValue('model') || 'gpt-3.5-turbo';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5,
        }),
      });

      if (response.ok) {
        message.success(
          intl.formatMessage({
            id: 'preference.ai.test.success',
            defaultMessage: 'Connection successful!',
          })
        );
      } else {
        const error = await response.text();
        message.error(`API Error: ${response.status} - ${error.substring(0, 100)}`);
      }
    } catch (e: any) {
      message.error(`Connection failed: ${e.message}`);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className={styles.preferenceContainer}>
      <Card
        title={
          <FormattedMessage id="preference.ai.title" defaultMessage="AI Processing Settings" />
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={DEFAULT_SERVICE_CONFIG}
          onFinish={handleSave}
        >
          <Form.Item
            name="provider"
            label={<FormattedMessage id="preference.ai.provider" defaultMessage="Provider" />}
          >
            <Select>
              <Option value="openai">OpenAI</Option>
              <Option value="azure">Azure OpenAI</Option>
              <Option value="custom">Custom Endpoint</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="apiKey"
            label={<FormattedMessage id="preference.ai.apiKey" defaultMessage="API Key" />}
            extra={
              <FormattedMessage
                id="preference.ai.apiKey.hint"
                defaultMessage="Your API key is stored locally and never sent to our servers"
              />
            }
          >
            <Input.Password placeholder="sk-..." />
          </Form.Item>

          <Form.Item
            name="endpoint"
            label={<FormattedMessage id="preference.ai.endpoint" defaultMessage="API Endpoint" />}
            extra={
              <FormattedMessage
                id="preference.ai.endpoint.hint"
                defaultMessage="Leave empty for default OpenAI endpoint"
              />
            }
          >
            <Input placeholder="https://api.openai.com/v1/chat/completions" />
          </Form.Item>

          <Form.Item
            name="model"
            label={<FormattedMessage id="preference.ai.model" defaultMessage="Model" />}
          >
            <Select>
              <Option value="gpt-3.5-turbo">GPT-3.5 Turbo</Option>
              <Option value="gpt-4">GPT-4</Option>
              <Option value="gpt-4-turbo">GPT-4 Turbo</Option>
              <Option value="gpt-4o">GPT-4o</Option>
              <Option value="gpt-4o-mini">GPT-4o Mini</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="maxTokens"
            label={<FormattedMessage id="preference.ai.maxTokens" defaultMessage="Max Tokens" />}
          >
            <InputNumber min={100} max={8000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="temperature"
            label={<FormattedMessage id="preference.ai.temperature" defaultMessage="Temperature" />}
            extra={
              <FormattedMessage
                id="preference.ai.temperature.hint"
                defaultMessage="Lower values = more focused, higher = more creative"
              />
            }
          >
            <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                <FormattedMessage id="preference.ai.save" defaultMessage="Save" />
              </Button>
              <Button onClick={handleTest} loading={testLoading}>
                <FormattedMessage id="preference.ai.test" defaultMessage="Test Connection" />
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card
        title={
          <FormattedMessage
            id="preference.ai.options.title"
            defaultMessage="Default Processing Options"
          />
        }
        style={{ marginTop: 16 }}
      >
        <Form layout="vertical" initialValues={DEFAULT_PROCESS_OPTIONS}>
          <Form.Item
            name="generateSummary"
            valuePropName="checked"
            label={
              <FormattedMessage id="preference.ai.options.summary" defaultMessage="Generate Summary" />
            }
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="generateKeyPoints"
            valuePropName="checked"
            label={
              <FormattedMessage
                id="preference.ai.options.keyPoints"
                defaultMessage="Generate Key Points"
              />
            }
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="generateTags"
            valuePropName="checked"
            label={
              <FormattedMessage id="preference.ai.options.tags" defaultMessage="Generate Tags" />
            }
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="maxTags"
            label={<FormattedMessage id="preference.ai.options.maxTags" defaultMessage="Max Tags" />}
          >
            <InputNumber min={1} max={20} />
          </Form.Item>

          <Form.Item
            name="maxKeyPoints"
            label={
              <FormattedMessage
                id="preference.ai.options.maxKeyPoints"
                defaultMessage="Max Key Points"
              />
            }
          >
            <InputNumber min={1} max={20} />
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default AISettings;
