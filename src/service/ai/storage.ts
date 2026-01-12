/**
 * AI 服务配置存储
 */

import { syncStorageService } from '@/common/chrome/storage';
import { AIServiceConfig, DEFAULT_SERVICE_CONFIG } from './types';

const AI_CONFIG_KEY = 'ai_service_config';

export async function loadAIConfig(): Promise<AIServiceConfig> {
  try {
    const stored = await syncStorageService.get<AIServiceConfig>(AI_CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_SERVICE_CONFIG, ...stored };
    }
  } catch (e) {
    console.warn('Failed to load AI config:', e);
  }
  return { ...DEFAULT_SERVICE_CONFIG };
}

export async function saveAIConfig(config: Partial<AIServiceConfig>): Promise<void> {
  try {
    const current = await loadAIConfig();
    const updated = { ...current, ...config };
    await syncStorageService.set(AI_CONFIG_KEY, updated);
    console.log('AI config saved:', updated);
  } catch (e) {
    console.error('Failed to save AI config:', e);
    throw e;
  }
}

export async function clearAIConfig(): Promise<void> {
  try {
    await syncStorageService.delete(AI_CONFIG_KEY);
  } catch (e) {
    console.error('Failed to clear AI config:', e);
  }
}

// 检查 API Key 是否已配置
export async function isAIConfigured(): Promise<boolean> {
  const config = await loadAIConfig();
  return !!config.apiKey;
}
