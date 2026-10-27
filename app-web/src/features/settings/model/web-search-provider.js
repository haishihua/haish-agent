// Search provider rows (Settings → Tools → Web Search).
//
// core 只看 `provider`（单选）和各家的 `enabled`；所以切 active 只改 `provider`，
// 编辑 key 只改那一家的 `api_key`，两者不互相牵连。
import { WEB_SEARCH_PROVIDER_OPTIONS } from './settings-records.js';
import { normalizeWebSearchDraft } from './settings-payload.js';

const isProvider = (id) => WEB_SEARCH_PROVIDER_OPTIONS.some((provider) => provider.id === id);

export function webSearchProviderState(web, id) {
  const draft = web?.providers?.[id] || {};
  return {
    enabled: draft.enabled !== false,
    configured: Boolean(draft.api_key_configured || String(draft.api_key || '').trim()),
    active: web?.provider === id,
  };
}

// 右侧只留一个开关：开关开着就是当前生效的 provider（与 core 的单选 `provider` 一致）。
// 已经是这家时原样返回：调用方靠「同一个对象」判断这次点击无需保存。
export function activateWebSearchProvider(web, id) {
  if (!isProvider(id)) return web;
  if (web?.provider === id && web?.providers?.[id]?.enabled !== false) return web;
  return normalizeWebSearchDraft({
    ...web,
    provider: id,
    providers: { ...web?.providers, [id]: { ...(web?.providers?.[id] || {}), enabled: true } },
  });
}

export function patchWebSearchProvider(web, id, patch) {
  if (!isProvider(id)) return web;
  return normalizeWebSearchDraft({
    ...web,
    providers: { ...web?.providers, [id]: { ...(web?.providers?.[id] || {}), ...patch } },
  });
}
