import { TextExtension, ContentScriptContext, ToolContext } from '@/extensions/common';
import { getAIService, resetAIService } from '@/service/ai';
import { loadAIConfig, isAIConfigured } from '@/service/ai/storage';
import { AIProcessResult } from '@/service/ai/types';

interface AIOrganizeResult {
  originalContent: string;
  title: string;
  url: string;
}

/**
 * 清理 Markdown 内容，修复常见格式问题
 */
function cleanupMarkdown(content: string): string {
  let cleaned = content;

  // 1. 移除空链接 [](url) 或 [ ](url)
  cleaned = cleaned.replace(/\[[\s]*\]\([^)]+\)/g, '');

  // 2. 修复转义的数字序号：1\. -> 1.
  cleaned = cleaned.replace(/(\d+)\\\.(\s)/g, '$1.$2');

  // 3. 修复多余的转义字符
  cleaned = cleaned.replace(/\\\*/g, '*');
  cleaned = cleaned.replace(/\\_/g, '_');

  // 4. 清理连续多个空行为最多两个
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

  // 5. 清理行尾空白
  cleaned = cleaned.replace(/[ \t]+$/gm, '');

  // 6. 修复表格：移除表格中多余的空行
  cleaned = cleaned.replace(/(\|[^\n]+\|)\n\n(\|)/g, '$1\n$2');

  // 7. 移除空的粗体/斜体标记
  cleaned = cleaned.replace(/\*\*\s*\*\*/g, '');
  cleaned = cleaned.replace(/\*\s*\*/g, '');

  // 8. 修复破碎的表格格式（每个单元格单独一行的情况）
  // 匹配模式：多行只有 "|" 和内容，需要合并成正确的表格行
  cleaned = repairBrokenTables(cleaned);

  return cleaned.trim();
}

/**
 * 修复破碎的表格格式
 * 将每个单元格单独一行的格式修复为标准 Markdown 表格
 */
function repairBrokenTables(content: string): string {
  // 匹配破碎的表格模式：连续的 "| 内容 |" 或 "| 内容" 行
  // 例如：
  // |
  // 项目
  // |
  // 标准
  // |

  const lines = content.split('\n');
  const result: string[] = [];
  let tableBuffer: string[] = [];
  let inBrokenTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测是否是破碎表格的一部分
    // 破碎表格特征：独立的 "|" 行，或者 "| 内容 |" 但内容很短且后面跟着更多类似行
    const isJustPipe = line === '|';
    const isPipeWithContent = /^\|[^|]+\|$/.test(line) || /^\|[^|]+$/.test(line);
    const looksLikeBrokenTable = isJustPipe || (isPipeWithContent && line.length < 50);

    if (looksLikeBrokenTable) {
      if (!inBrokenTable) {
        inBrokenTable = true;
      }
      // 收集非空内容
      if (!isJustPipe) {
        const cellContent = line.replace(/^\||\|$/g, '').trim();
        if (cellContent) {
          tableBuffer.push(cellContent);
        }
      }
    } else {
      // 如果之前在处理破碎表格，现在要结束了
      if (inBrokenTable && tableBuffer.length > 0) {
        // 尝试将收集的内容重构为表格
        const reconstructedTable = reconstructTable(tableBuffer);
        result.push(reconstructedTable);
        tableBuffer = [];
        inBrokenTable = false;
      }
      result.push(lines[i]); // 保留原始格式（包括空白）
    }
  }

  // 处理文件末尾的破碎表格
  if (inBrokenTable && tableBuffer.length > 0) {
    const reconstructedTable = reconstructTable(tableBuffer);
    result.push(reconstructedTable);
  }

  return result.join('\n');
}

/**
 * 将收集到的表格单元格内容重构为 Markdown 表格
 */
function reconstructTable(cells: string[]): string {
  if (cells.length === 0) return '';

  // 尝试推断列数
  // 通常表格会有标题行，我们假设前几个是标题
  // 简单策略：如果单元格数量是某个数的倍数，使用那个作为列数
  let numCols = 2; // 默认 2 列

  // 尝试找到合适的列数（2-6 列）
  for (let cols = 6; cols >= 2; cols--) {
    if (cells.length % cols === 0 && cells.length >= cols * 2) {
      numCols = cols;
      break;
    }
  }

  // 构建表格
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += numCols) {
    rows.push(cells.slice(i, i + numCols));
  }

  if (rows.length === 0) return cells.join(' ');

  // 生成 Markdown 表格
  const tableLines: string[] = [];

  rows.forEach((row, index) => {
    // 补齐不足的列
    while (row.length < numCols) {
      row.push('');
    }
    tableLines.push('| ' + row.join(' | ') + ' |');

    // 添加分隔行
    if (index === 0) {
      tableLines.push('| ' + row.map(() => '---').join(' | ') + ' |');
    }
  });

  return '\n' + tableLines.join('\n') + '\n';
}

export default new TextExtension<AIOrganizeResult>(
  {
    name: 'AI Organize',
    icon: 'robot',
    version: '0.0.4',
    description: 'Use AI to generate summary, tags, and key points for your clipped content.',
    i18nManifest: {
      'en-US': {
        name: 'AI Organize',
        description: 'Use AI to generate summary, tags, and key points for your clipped content.',
      },
      'zh-CN': {
        name: 'AI 整理',
        description: '使用 AI 为剪切的内容生成摘要、标签和关键点。',
      },
    },
  },
  {
    // run 在 content script 中执行，提取内容
    run: async (context: ContentScriptContext): Promise<AIOrganizeResult> => {
      const { turndown, document, Readability, $ } = context;

      try {
        // 使用 Readability 提取主要内容
        let documentClone = document.cloneNode(true) as Document;
        $(documentClone).find('#skPlayer, script, style, noscript').remove();

        let article = new Readability(documentClone, {
          keepClasses: true,
        }).parse();

        const content = article?.content ? turndown.turndown(article.content) : '';

        console.log('[AI Organize] run: Content extracted, length:', content.length);

        const result: AIOrganizeResult = {
          originalContent: content,
          title: document.title || '',
          url: window.location.href || '',
        };

        console.log('[AI Organize] run: Returning result:', {
          contentLength: result.originalContent.length,
          title: result.title,
          url: result.url,
        });

        return result;
      } catch (e) {
        console.error('[AI Organize] run: Error:', e);
        return {
          originalContent: '',
          title: document.title || '',
          url: window.location.href || '',
        };
      }
    },

    // afterRun 在 popup 中执行，可以访问 API
    afterRun: async (context: ToolContext<AIOrganizeResult, string>): Promise<string> => {
      const { result, message, data } = context;

      console.log('[AI Organize] afterRun: Called with result:', result);
      console.log('[AI Organize] afterRun: Context data:', data);

      // 如果没有从 run 获取到结果，使用已有的 data
      if (!result) {
        console.warn('[AI Organize] afterRun: No result from run, using existing data');
        if (data && typeof data === 'string') {
          return data;
        }
        message.info('无法提取内容');
        return '';
      }

      const { originalContent, title, url } = result;

      console.log('[AI Organize] afterRun: Extracted content length:', originalContent?.length || 0);

      if (!originalContent) {
        console.warn('[AI Organize] afterRun: No content extracted');
        message.info('页面内容为空');
        return typeof data === 'string' ? data : '';
      }

      // 检查 AI 是否已配置
      let configured = false;
      try {
        configured = await isAIConfigured();
        console.log('[AI Organize] afterRun: AI configured:', configured);
      } catch (e) {
        console.error('[AI Organize] afterRun: Error checking AI config:', e);
      }

      if (!configured) {
        console.log('[AI Organize] afterRun: AI not configured, returning original content');
        message.info('AI 未配置，请在设置中配置 API Key');
        return originalContent;
      }

      try {
        message.info('正在使用 AI 处理内容...');

        // 重置 AI 服务以确保使用最新配置
        resetAIService();
        const config = await loadAIConfig();
        console.log('[AI Organize] afterRun: Loaded AI config:', {
          ...config,
          apiKey: config.apiKey ? '***' : 'empty',
        });

        const aiService = getAIService(config);

        console.log('[AI Organize] afterRun: Calling AI service...');
        const aiResult = await aiService.process({
          content: originalContent,
          title,
          url,
        });

        console.log('[AI Organize] afterRun: AI processing complete:', aiResult);

        // 构建增强后的 Markdown 内容
        const enhancedContent = buildEnhancedContent(originalContent, aiResult);
        console.log('[AI Organize] afterRun: Enhanced content length:', enhancedContent.length);

        message.info('AI 处理完成');
        return enhancedContent;
      } catch (e: any) {
        console.error('[AI Organize] afterRun: AI processing error:', e);
        message.info(`AI 处理失败: ${e.message}`);
        // Return original content on error so user still gets the clipped content
        return originalContent;
      }
    },
  }
);

/**
 * 构建增强后的内容
 */
function buildEnhancedContent(originalContent: string, aiResult: AIProcessResult): string {
  const sections: string[] = [];

  const { summary, keyPoints, tags, category } = aiResult;

  // 先清理原始内容
  const cleanedContent = cleanupMarkdown(originalContent);

  // AI 生成的元信息块 (YAML front matter)
  sections.push('---');
  if (tags && tags.length > 0) {
    sections.push(`tags: [${tags.join(', ')}]`);
  }
  if (category) {
    sections.push(`category: ${category}`);
  }
  sections.push('---\n');

  // 摘要
  if (summary) {
    sections.push('## 📝 Summary\n');
    sections.push(summary);
    sections.push('\n');
  }

  // 关键点
  if (keyPoints && keyPoints.length > 0) {
    sections.push('## 🔑 Key Points\n');
    keyPoints.forEach(point => {
      sections.push(`- ${point}`);
    });
    sections.push('\n');
  }

  // 分隔线
  sections.push('---\n');

  // 原始内容（已清理）
  sections.push('## 📄 Original Content\n');
  sections.push(cleanedContent);

  return sections.join('\n');
}

// 独立的 AI 处理函数，可以从其他地方调用
export async function processContentWithAI(
  content: string,
  title: string,
  url?: string
): Promise<{ content: string; aiResult?: AIProcessResult; error?: string }> {
  try {
    const configured = await isAIConfigured();
    if (!configured) {
      return {
        content,
        error: 'AI not configured. Please set up your API key in Settings > AI.',
      };
    }

    const config = await loadAIConfig();
    const aiService = getAIService(config);

    const aiResult = await aiService.process({
      content,
      title,
      url,
    });

    return {
      content: buildEnhancedContent(content, aiResult),
      aiResult,
    };
  } catch (e: any) {
    return {
      content,
      error: e.message || 'Unknown error during AI processing',
    };
  }
}
