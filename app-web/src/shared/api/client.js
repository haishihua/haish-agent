export const CONVERSATION_STORAGE_KEY = 'haish_conversation_id';
export const WORKSPACE_STORAGE_KEY = 'haish_workspaces_v2';
export const CONTEXT_USAGE_STORAGE_KEY = 'haish_context_usage_v1';
export const RUN_CONFIG_STORAGE_PREFIX = 'haish_run_config_v1';
export const RESTORED_CONTEXT_BASE_TOKENS = 4200;
export const DEFAULT_PROJECT_ID = 'default-project';
export const DEFAULT_PROJECT_NAME = 'Default project';
export const DEFAULT_SESSION_NAME = 'Default Session';
export const DEFAULT_CONVERSATION_NAMES = new Set([
  DEFAULT_SESSION_NAME,
  'New Chat',
  'New Conversation',
  'Untitled Chat',
]);

export function stableHash(value) {
  const input = String(value || '');
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function buildRunConfigStorageKey(providerKey, conversationId = '') {
  const provider = String(providerKey || 'unknown').trim() || 'unknown';
  const conversation = String(conversationId || '').trim();
  if (provider === 'unknown' || !conversation) return '';
  return `${RUN_CONFIG_STORAGE_PREFIX}:${stableHash(provider)}:${stableHash(conversation)}`;
}

export function buildApiHeaders(extraHeaders = {}) {
  const headers = new Headers(extraHeaders || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return Object.fromEntries(headers.entries());
}

export function withApiInit(init = {}, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(init.headers || {});
  if (options.json !== false && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return {
    ...init,
    headers: Object.fromEntries(headers.entries()),
  };
}

export function apiFetch(input, init = {}, options = {}) {
  return fetch(input, withApiInit(init, options));
}

export async function parseResponseMessage(response, fallback) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item?.msg || item?.message || String(item)).join(' ');
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  } catch {
    // Keep the fallback when the server returns an empty or non-JSON response.
  }
  return fallback;
}
