// @haish-esm
import { API_BASE } from '../api/base.js';
import {
  CONTEXT_USAGE_STORAGE_KEY,
  DEFAULT_CONTEXT_TOTAL_TOKENS,
  RESTORED_CONTEXT_BASE_TOKENS,
} from '../api/auth.js';

export function normalizeContextUsage(value, fallbackConversationId = null) {
  const rawUsedTokens = Math.max(0, Math.round(Number(value?.contextUsedTokens ?? value?.context_used_tokens ?? value?.usedTokens ?? value?.used_tokens ?? 0) || 0));
  const totalTokens = Math.max(1, Math.round(Number(value?.contextTotalTokens ?? value?.context_total_tokens ?? value?.totalTokens ?? value?.total_tokens ?? value?.effective_budget ?? DEFAULT_CONTEXT_TOTAL_TOKENS) || DEFAULT_CONTEXT_TOTAL_TOKENS));
  const valid = value?.valid !== false && value?.valid_context_usage !== false && rawUsedTokens <= totalTokens;
  const usedTokens = valid ? rawUsedTokens : 0;
  const compressedCount = Math.max(0, Math.round(Number(value?.compressedCount ?? value?.compressed_count ?? 0) || 0));
  return {
    conversationId: value?.conversationId || value?.conversation_id || fallbackConversationId || null,
    usedTokens,
    totalTokens,
    ratio: Math.max(0, Math.min(1, totalTokens > 0 ? usedTokens / totalTokens : 0)),
    compressed: Boolean(value?.compressed) || compressedCount > 0,
    compressedCount,
    valid,
    updatedAt: value?.updatedAt || value?.updated_at || null,
  };
}

export function createEmptyContextUsage(conversationId = null) {
  return normalizeContextUsage({
    conversationId,
    usedTokens: 0,
    totalTokens: DEFAULT_CONTEXT_TOTAL_TOKENS,
  }, conversationId);
}

export function loadStoredContextUsage(conversationId) {
  if (!conversationId) return createEmptyContextUsage(null);
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeContextUsage(parsed?.[conversationId] || null, conversationId);
  } catch (error) {
    console.warn('Failed to load context usage:', error);
    return createEmptyContextUsage(conversationId);
  }
}

export function saveStoredContextUsage(usage) {
  if (!usage?.conversationId) return;
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[usage.conversationId] = usage;
    window.localStorage.setItem(CONTEXT_USAGE_STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.warn('Failed to save context usage:', error);
  }
}

export function estimateTextTokens(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  let cjk = 0;
  let latin = 0;
  for (const char of value) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) cjk += 1;
    else if (!/\s/u.test(char)) latin += 1;
  }
  return Math.ceil(cjk + (latin / 4));
}

export function estimateContextUsageFromConversationDetail(detail) {
  if (!detail?.conversation_id) return createEmptyContextUsage(null);
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : [];
  let usedTokens = messages.reduce((total, message) => (
    total + estimateTextTokens(message?.content) + 24
  ), 0);
  usedTokens += tasks.reduce((total, task) => (
    total
    + estimateTextTokens(task?.title)
    + estimateTextTokens(task?.description)
    + estimateTextTokens(task?.answer_text)
    + 16
  ), 0);
  if (usedTokens > 0) usedTokens += RESTORED_CONTEXT_BASE_TOKENS;
  return normalizeContextUsage({
    conversationId: detail.conversation_id,
    usedTokens,
    totalTokens: DEFAULT_CONTEXT_TOTAL_TOKENS,
  }, detail.conversation_id);
}

export function mergeContextUsage(primary, fallback) {
  const normalizedPrimary = normalizeContextUsage(primary, fallback?.conversationId || null);
  const normalizedFallback = normalizeContextUsage(fallback, normalizedPrimary.conversationId);
  return normalizedPrimary.usedTokens >= normalizedFallback.usedTokens
    ? normalizedPrimary
    : normalizedFallback;
}


