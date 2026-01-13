import { TextExtension, ContentScriptContext, ToolContext } from '@/extensions/common';
import { getAIService, resetAIService } from '@/service/ai';
import { loadAIConfig, isAIConfigured } from '@/service/ai/storage';
import { AIProcessResult } from '@/service/ai/types';

interface AIOrganizeResult {
  originalContent: string;
  title: string;
  url: string;
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

  // 原始内容
  sections.push('## 📄 Original Content\n');
  sections.push(originalContent);

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
