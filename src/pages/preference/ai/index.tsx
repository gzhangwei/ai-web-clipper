import * as React from 'react';
import { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Switch, message, Card, InputNumber, Space, AutoComplete } from 'antd';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  AIServiceConfig,
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_PROCESS_OPTIONS,
} from '@/service/ai/types';
import { loadAIConfig, saveAIConfig } from '@/service/ai/storage';
import styles from '../index.less';

const { Option } = Select;

// 常用模型列表（用户可以输入任意模型名）
const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (128K)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (128K)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (128K)' },
  { value: 'gpt-4', label: 'GPT-4 (8K)' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (16K)' },
  { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  { value: 'deepseek-chat', label: 'DeepSeek Chat' },
  { value: 'deepseek-coder', label: 'DeepSeek Coder' },
  { value: 'qwen-turbo', label: 'Qwen Turbo' },
  { value: 'qwen-plus', label: 'Qwen Plus' },
  { value: 'glm-4', label: 'GLM-4' },
  { value: 'moonshot-v1-8k', label: 'Moonshot v1 8K' },
  { value: 'moonshot-v1-32k', label: 'Moonshot v1 32K' },
  { value: 'moonshot-v1-128k', label: 'Moonshot v1 128K' },
];

const AISettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState(MODEL_OPTIONS);
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
      const model = form.getFieldValue('model') || 'gpt-4o-mini';

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

  // 模型搜索过滤
  const handleModelSearch = (searchText: string) => {
    if (!searchText) {
      setModelOptions(MODEL_OPTIONS);
      return;
    }
    const filtered = MODEL_OPTIONS.filter(
      opt => opt.value.toLowerCase().includes(searchText.toLowerCase()) ||
             opt.label.toLowerCase().includes(searchText.toLowerCase())
    );
    // 如果没有匹配的，允许用户使用自定义值
    if (filtered.length === 0) {
      setModelOptions([{ value: searchText, label: searchText }]);
    } else {
      setModelOptions(filtered);
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
              <Option value="anthropic">Anthropic (Claude)</Option>
              <Option value="deepseek">DeepSeek</Option>
              <Option value="moonshot">Moonshot (Kimi)</Option>
              <Option value="qwen">Qwen (Alibaba)</Option>
              <Option value="zhipu">Zhipu (GLM)</Option>
              <Option value="custom">Custom / Other</Option>
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
            <Input.Password placeholder="sk-... / api-key-..." />
          </Form.Item>

          <Form.Item
            name="endpoint"
            label={<FormattedMessage id="preference.ai.endpoint" defaultMessage="API Endpoint" />}
            extra={
              <FormattedMessage
                id="preference.ai.endpoint.hint"
                defaultMessage="Leave empty for default OpenAI endpoint. For other providers, enter their API endpoint."
              />
            }
          >
            <Input placeholder="https://api.openai.com/v1/chat/completions" />
          </Form.Item>

          <Form.Item
            name="model"
            label={<FormattedMessage id="preference.ai.model" defaultMessage="Model" />}
            extra={
              <FormattedMessage
                id="preference.ai.model.hint"
                defaultMessage="Select from list or type any custom model name"
              />
            }
          >
            <AutoComplete
              options={modelOptions}
              onSearch={handleModelSearch}
              placeholder="gpt-4o-mini"
              allowClear
            />
          </Form.Item>

          <Form.Item
            name="maxTokens"
            label={<FormattedMessage id="preference.ai.maxTokens" defaultMessage="Max Output Tokens" />}
            extra={
              <FormattedMessage
                id="preference.ai.maxTokens.hint"
                defaultMessage="Maximum tokens for AI response. Depends on your model's limit (e.g., GPT-4o: 16K output, Claude: 4K output)"
              />
            }
          >
            <InputNumber min={100} max={128000} step={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="temperature"
            label={<FormattedMessage id="preference.ai.temperature" defaultMessage="Temperature" />}
            extra={
              <FormattedMessage
                id="preference.ai.temperature.hint"
                defaultMessage="Lower values = more focused, higher = more creative (0-2)"
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
