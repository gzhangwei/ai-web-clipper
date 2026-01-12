import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Form,
  Input,
  Button,
  Card,
  Tree,
  Progress,
  Switch,
  InputNumber,
  Space,
  message,
  Alert,
  Divider,
  Select,
} from 'antd';
import { FormattedMessage, useIntl } from 'react-intl';
import { connect } from 'dva';
import { GlobalStore } from '@/common/types';
import { BatchClipService, ChapterNode, TOCParseResult, BatchProgress, countChapters } from '@/service/batch';
import { HierarchyNode } from '@/common/backend/services/notion/types';
import styles from './index.less';

const { Option } = Select;

interface TreeNode {
  title: string;
  key: string;
  children?: TreeNode[];
}

const mapStateToProps = ({ clipper: { repositories }, account: { accounts } }: GlobalStore) => {
  return {
    repositories,
    accounts,
  };
};

type PageProps = ReturnType<typeof mapStateToProps>;

const BatchClipPage: React.FC<PageProps> = ({ repositories }) => {
  const [form] = Form.useForm();
  const intl = useIntl();

  // 状态
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [tocResult, setTocResult] = useState<TOCParseResult | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [service, setService] = useState<BatchClipService | null>(null);

  // 解析目录
  const handleParseTOC = useCallback(async () => {
    const url = form.getFieldValue('tocUrl');
    if (!url) {
      message.warning('Please enter a URL');
      return;
    }

    setParsing(true);
    setTocResult(null);

    try {
      const batchService = new BatchClipService();
      const result = await batchService.parseTOC(url);

      if (result.chapters.length === 0) {
        message.warning('No chapters found on this page');
      } else {
        message.success(`Found ${countChapters(result.chapters)} chapters`);
      }

      setTocResult(result);
    } catch (e: any) {
      message.error(`Parse failed: ${e.message}`);
    } finally {
      setParsing(false);
    }
  }, [form]);

  // 开始批量剪切
  const handleStartClip = useCallback(async () => {
    if (!tocResult) return;

    const values = form.getFieldsValue();
    if (!values.targetRepository) {
      message.warning('Please select a target repository');
      return;
    }

    setLoading(true);
    setProgress(null);

    const batchService = new BatchClipService(
      {
        useAI: values.useAI,
        maxConcurrency: values.maxConcurrency || 3,
        requestInterval: values.requestInterval || 500,
      },
      (p) => setProgress(p)
    );

    setService(batchService);

    try {
      // 1. 抓取所有页面
      setProgress({ stage: 'fetching', completed: 0, total: countChapters(tocResult.chapters) });
      const fetchResults = await batchService.fetchPages(tocResult.chapters);

      // 2. AI 处理
      setProgress({ stage: 'processing', completed: 0, total: fetchResults.size });
      const processedData = await batchService.processWithAI(tocResult.chapters, fetchResults);

      // 3. 构建层级结构
      const hierarchy = batchService.buildHierarchy(
        tocResult.chapters,
        processedData,
        tocResult.rootTitle
      );

      // 4. 保存到 Notion (这里需要调用 Notion 服务)
      setProgress({ stage: 'saving', completed: 0, total: 1, current: 'Saving to Notion...' });

      // TODO: 调用 Notion createHierarchy
      message.success(`Batch clip completed! Processed ${fetchResults.size} pages.`);
      setProgress({ stage: 'done', completed: 1, total: 1 });

      console.log('Hierarchy to save:', hierarchy);
    } catch (e: any) {
      message.error(`Batch clip failed: ${e.message}`);
      setProgress({ stage: 'error', completed: 0, total: 0, errors: [e.message] });
    } finally {
      setLoading(false);
      setService(null);
    }
  }, [form, tocResult]);

  // 中止操作
  const handleAbort = useCallback(() => {
    if (service) {
      service.abort();
      message.info('Aborting...');
    }
  }, [service]);

  // 转换章节为树形数据
  const convertToTreeData = (chapters: ChapterNode[]): TreeNode[] => {
    return chapters.map((chapter, index) => ({
      title: chapter.title,
      key: `${chapter.url}-${index}`,
      children: chapter.children ? convertToTreeData(chapter.children) : undefined,
    }));
  };

  // 获取进度百分比
  const getProgressPercent = (): number => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.completed / progress.total) * 100);
  };

  // 获取进度状态文本
  const getProgressStatus = (): string => {
    if (!progress) return '';
    const stageText: Record<string, string> = {
      parsing: 'Parsing TOC...',
      fetching: 'Fetching pages...',
      processing: 'Processing with AI...',
      saving: 'Saving to Notion...',
      done: 'Done!',
      error: 'Error occurred',
    };
    return `${stageText[progress.stage]} ${progress.current || ''} (${progress.completed}/${progress.total})`;
  };

  return (
    <div className={styles.batchContainer}>
      <Card title={<FormattedMessage id="batch.title" defaultMessage="Batch Clip" />}>
        <Alert
          message={
            <FormattedMessage
              id="batch.description"
              defaultMessage="Enter a documentation page URL to batch clip all linked pages into Notion with hierarchy."
            />
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form form={form} layout="vertical">
          <Form.Item
            name="tocUrl"
            label={<FormattedMessage id="batch.tocUrl" defaultMessage="Documentation URL" />}
            rules={[{ required: true, message: 'Please enter URL' }]}
          >
            <Input.Search
              placeholder="https://docs.example.com/guide/"
              enterButton={
                <FormattedMessage id="batch.parse" defaultMessage="Parse" />
              }
              loading={parsing}
              onSearch={handleParseTOC}
            />
          </Form.Item>

          {tocResult && tocResult.chapters.length > 0 && (
            <>
              <Divider />

              <Alert
                message={`Found ${countChapters(tocResult.chapters)} pages from ${tocResult.source}`}
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form.Item
                label={<FormattedMessage id="batch.preview" defaultMessage="Chapter Structure" />}
              >
                <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 4, padding: 8 }}>
                  <Tree
                    treeData={convertToTreeData(tocResult.chapters)}
                    defaultExpandAll
                  />
                </div>
              </Form.Item>

              <Divider />

              <Form.Item
                name="targetRepository"
                label={<FormattedMessage id="batch.target" defaultMessage="Save to" />}
                rules={[{ required: true, message: 'Please select target' }]}
              >
                <Select placeholder="Select Notion page">
                  {repositories.map(repo => (
                    <Option key={repo.id} value={repo.id}>
                      {repo.groupName} / {repo.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="useAI"
                valuePropName="checked"
                initialValue={true}
                label={<FormattedMessage id="batch.useAI" defaultMessage="Use AI Processing" />}
              >
                <Switch />
              </Form.Item>

              <Space>
                <Form.Item name="maxConcurrency" label="Concurrency" initialValue={3}>
                  <InputNumber min={1} max={10} />
                </Form.Item>

                <Form.Item name="requestInterval" label="Interval (ms)" initialValue={500}>
                  <InputNumber min={100} max={5000} step={100} />
                </Form.Item>
              </Space>

              {progress && (
                <Form.Item>
                  <Progress
                    percent={getProgressPercent()}
                    status={progress.stage === 'error' ? 'exception' : progress.stage === 'done' ? 'success' : 'active'}
                  />
                  <div style={{ color: '#666', marginTop: 4 }}>{getProgressStatus()}</div>
                </Form.Item>
              )}

              <Form.Item>
                <Space>
                  <Button
                    type="primary"
                    onClick={handleStartClip}
                    loading={loading}
                    disabled={!tocResult || tocResult.chapters.length === 0}
                  >
                    <FormattedMessage id="batch.start" defaultMessage="Start Batch Clip" />
                  </Button>

                  {loading && (
                    <Button onClick={handleAbort} danger>
                      <FormattedMessage id="batch.abort" defaultMessage="Abort" />
                    </Button>
                  )}
                </Space>
              </Form.Item>
            </>
          )}
        </Form>
      </Card>
    </div>
  );
};

export default connect(mapStateToProps)(BatchClipPage);
