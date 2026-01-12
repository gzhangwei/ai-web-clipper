/**
 * AI 处理服务 - OpenAI 实现
 */

import {
  IAIService,
  AIProcessRequest,
  AIProcessResult,
  AIServiceConfig,
  AIProcessOptions,
  DEFAULT_PROCESS_OPTIONS,
  DEFAULT_SERVICE_CONFIG,
} from './types';

export class AIService implements IAIService {
  private config: AIServiceConfig;

  constructor(config?: Partial<AIServiceConfig>) {
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
  }

  getConfig(): AIServiceConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<AIServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.apiKey;
  }

  async process(request: AIProcessRequest): Promise<AIProcessResult> {
    const startTime = Date.now();
    const options = { ...DEFAULT_PROCESS_OPTIONS, ...request.options };

    if (!this.config.apiKey) {
      throw new Error('AI Service: API Key not configured');
    }

    const prompt = this.buildPrompt(request, options);
    const response = await this.callAPI(prompt);
    const result = this.parseResponse(response, options);

    result.metadata = {
      model: this.config.model || 'gpt-3.5-turbo',
      processingTime: Date.now() - startTime,
    };

    return result;
  }

  private buildPrompt(request: AIProcessRequest, options: AIProcessOptions): string {
    const sections: string[] = [];

    sections.push(`Analyze the following content and provide structured output in JSON format.`);
    sections.push(`\nTitle: ${request.title}`);
    if (request.url) {
      sections.push(`URL: ${request.url}`);
    }
    sections.push(`\nContent:\n${this.truncateContent(request.content)}`);

    sections.push(`\n\nProvide a JSON response with the following fields:`);

    if (options.generateSummary) {
      sections.push(`- "summary": A concise summary (2-3 sentences)`);
    }
    if (options.generateKeyPoints) {
      sections.push(`- "keyPoints": Array of ${options.maxKeyPoints || 5} key points`);
    }
    if (options.generateTags) {
      sections.push(`- "tags": Array of ${options.maxTags || 5} relevant tags (single words or short phrases)`);
    }
    if (options.generateQA) {
      sections.push(`- "qa": Array of {question, answer} objects`);
    }
    if (options.generateActionItems) {
      sections.push(`- "actionItems": Array of action items if any`);
    }

    sections.push(`- "category": Content category (e.g., "tutorial", "reference", "news", "documentation", "blog")`);

    if (options.targetLanguage) {
      sections.push(`\nRespond in ${options.targetLanguage}.`);
    } else {
      sections.push(`\nRespond in the same language as the content.`);
    }

    sections.push(`\nReturn ONLY valid JSON, no markdown code blocks or extra text.`);

    return sections.join('\n');
  }

  private truncateContent(content: string, maxLength: number = 8000): string {
    if (content.length <= maxLength) {
      return content;
    }
    // 保留开头和结尾，中间截断
    const halfLength = Math.floor(maxLength / 2);
    return (
      content.substring(0, halfLength) +
      '\n\n[... content truncated ...]\n\n' +
      content.substring(content.length - halfLength)
    );
  }

  private async callAPI(prompt: string): Promise<string> {
    const endpoint = this.config.endpoint || 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that analyzes web content and returns structured JSON data.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API Error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private parseResponse(response: string, options: AIProcessOptions): AIProcessResult {
    try {
      // 尝试直接解析 JSON
      const parsed = JSON.parse(response.trim());
      return this.normalizeResult(parsed, options);
    } catch {
      // 如果失败，尝试提取 JSON 块
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return this.normalizeResult(parsed, options);
        } catch {
          // 解析失败，返回原始响应作为摘要
          return {
            summary: response,
            tags: [],
            keyPoints: [],
          };
        }
      }
      return {
        summary: response,
        tags: [],
        keyPoints: [],
      };
    }
  }

  private normalizeResult(parsed: any, options: AIProcessOptions): AIProcessResult {
    const result: AIProcessResult = {};

    if (options.generateSummary && parsed.summary) {
      result.summary = String(parsed.summary);
    }

    if (options.generateKeyPoints && parsed.keyPoints) {
      result.keyPoints = Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.map(String).slice(0, options.maxKeyPoints || 5)
        : [];
    }

    if (options.generateTags && parsed.tags) {
      result.tags = Array.isArray(parsed.tags)
        ? parsed.tags.map(String).slice(0, options.maxTags || 5)
        : [];
    }

    if (options.generateQA && parsed.qa) {
      result.qa = Array.isArray(parsed.qa)
        ? parsed.qa.filter((item: any) => item.question && item.answer)
        : [];
    }

    if (options.generateActionItems && parsed.actionItems) {
      result.actionItems = Array.isArray(parsed.actionItems)
        ? parsed.actionItems.map(String)
        : [];
    }

    if (parsed.category) {
      result.category = String(parsed.category);
    }

    return result;
  }
}

// 单例实例
let aiServiceInstance: AIService | null = null;

export function getAIService(config?: Partial<AIServiceConfig>): AIService {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIService(config);
  } else if (config) {
    aiServiceInstance.updateConfig(config);
  }
  return aiServiceInstance;
}

export function resetAIService(): void {
  aiServiceInstance = null;
}
