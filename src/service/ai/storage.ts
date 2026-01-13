/**
 * AI 服务配置存储
 */

import { syncStorageService } from '@/common/chrome/storage';
import { AIServiceConfig, DEFAULT_SERVICE_CONFIG } from './types';

const AI_CONFIG_KEY = 'ai_service_config';

// 确保存储服务已初始化
async function ensureStorageInit(): Promise<void> {
  try {
    await syncStorageService.init();
  } catch (e) {
    // 可能已经初始化过了，忽略错误
  }
}

export async function loadAIConfig(): Promise<AIServiceConfig> {
  try {
    await ensureStorageInit();
    const storedStr = syncStorageService.get<string>(AI_CONFIG_KEY);
    console.log('[AI Storage] Raw stored value:', storedStr);

    if (storedStr && typeof storedStr === 'string' && storedStr !== '[object Object]') {
      try {
        const stored = JSON.parse(storedStr) as AIServiceConfig;
        console.log('[AI Storage] Parsed config:', { ...stored, apiKey: stored.apiKey ? '***' : 'empty' });
        return { ...DEFAULT_SERVICE_CONFIG, ...stored };
      } catch (parseError) {
        console.warn('[AI Storage] Failed to parse stored config:', parseError);
      }
    }
  } catch (e) {
    console.warn('[AI Storage] Failed to load AI config:', e);
  }
  return { ...DEFAULT_SERVICE_CONFIG };
}

export async function saveAIConfig(config: Partial<AIServiceConfig>): Promise<void> {
  try {
    await ensureStorageInit();
    const current = await loadAIConfig();
    const updated = { ...current, ...config };
    // 必须用 JSON.stringify 序列化，否则对象会变成 "[object Object]"
    const jsonStr = JSON.stringify(updated);
    await syncStorageService.set(AI_CONFIG_KEY, jsonStr);
    console.log('[AI Storage] Config saved successfully:', { ...updated, apiKey: updated.apiKey ? '***' : 'empty' });
  } catch (e) {
    console.error('[AI Storage] Failed to save AI config:', e);
    throw e;
  }
}

export async function clearAIConfig(): Promise<void> {
  try {
    await ensureStorageInit();
    await syncStorageService.delete(AI_CONFIG_KEY);
  } catch (e) {
    console.error('[AI Storage] Failed to clear AI config:', e);
  }
}

// 检查 API Key 是否已配置
export async function isAIConfigured(): Promise<boolean> {
  const config = await loadAIConfig();
  const configured = !!config.apiKey;
  console.log('[AI Storage] isAIConfigured:', configured);
  return configured;
}
