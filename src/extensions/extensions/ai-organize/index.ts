import { ToolExtension } from '@/extensions/common';
import { getAIService } from '@/service/ai';
import { loadAIConfig, isAIConfigured } from '@/service/ai/storage';
import { AIProcessResult } from '@/service/ai/types';

interface AIOrganizeResult {
  originalContent: string;
  aiResult?: AIProcessResult;
  error?: string;
}

export default new ToolExtension<AIOrganizeResult>(
  {
    name: 'AI Organize',
    icon: 'robot',
    version: '0.0.1',
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
    init: async _context => {
      // 检查 AI 是否已配置
      const configured = await isAIConfigured();
      return configured;
    },
    afterRun: async context => {
      const { result, message } = context;

      // 检查 result 是否存在
      if (!result) {
        console.warn('AI Organize: No result available');
        return context.data || '';
      }

      const originalContent = result.originalContent || context.data || '';

      if (result.error) {
        message.info(`AI processing error: ${result.error}`);
        return originalContent;
      }

      if (!result.aiResult) {
        return originalContent;
      }

      const { summary, keyPoints, tags, category } = result.aiResult;

      // 构建增强后的 Markdown 内容
      const sections: string[] = [];

      // AI 生成的元信息块
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
        sections.push('## Summary\n');
        sections.push(summary);
        sections.push('\n');
      }

      // 关键点
      if (keyPoints && keyPoints.length > 0) {
        sections.push('## Key Points\n');
        keyPoints.forEach(point => {
          sections.push(`- ${point}`);
        });
        sections.push('\n');
      }

      // 分隔线
      sections.push('---\n');

      // 原始内容
      sections.push('## Original Content\n');
      sections.push(originalContent);

      return sections.join('\n');
    },
  }
);

// 独立的 AI 处理函数，可以从其他地方调用
export async function processContentWithAI(
  content: string,
  title: string,
  url?: string
): Promise<AIOrganizeResult> {
  try {
    const configured = await isAIConfigured();
    if (!configured) {
      return {
        originalContent: content,
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
      originalContent: content,
      aiResult,
    };
  } catch (e: any) {
    return {
      originalContent: content,
      error: e.message || 'Unknown error during AI processing',
    };
  }
}
