// Settings domain model.
import { REASONING_EFFORT_OPTIONS, normalizeReasoningEffort } from '../../../core/run-catalog.js';
import {
  LLM_PROVIDER_MODELS,
  LLM_PROVIDER_OPTIONS,
  getLlmProvider,
  normalizeLlmProviderId,
  normalizeProviderToken as normalizeToken,
} from '../../../core/provider-catalog.js';

export const LLM_SETTINGS_STORAGE_KEY = 'haish.llmSettingsDraft.v1';

export const SETTINGS_REASONING_OPTIONS = REASONING_EFFORT_OPTIONS;

export function formatAuthModeLabel(mode) {
  const value = String(mode || '').trim();
  if (value === 'api_key') return 'API Key';
  if (value === 'oauth') return 'OAuth';
  if (value === 'none') return 'None';
  return value.replace(/_/g, ' ');
}

export function modelChoicesFor(provider) {
  const configured = provider === 'custom' ? [] : (LLM_PROVIDER_MODELS[provider] || []);
  return Array.from(new Set(configured));
}

export function uniqueModelChoices(...groups) {
  const seen = new Set();
  const result = [];
  groups.flat().forEach((value) => {
    const id = typeof value === 'string' ? value : value?.id;
    const label = typeof value === 'string' ? value : (value?.label || value?.id);
    const normalized = String(id || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push({ id: normalized, label: String(label || normalized) });
  });
  return result;
}

export function customModelIds(config) {
  return uniqueModelChoices(Array.isArray(config?.custom_model_ids) ? config.custom_model_ids : []).map(item => item.id);
}

export function addCustomModelId(config, value) {
  const id = String(value || '').trim();
  const existing = customModelIds(config);
  if (!id || id.length > 512 || (existing.length >= 256 && !existing.includes(id))) return {};
  return { custom_model_ids: uniqueModelChoices(existing, id).map(item => item.id) };
}

export function llmModelCatalogPatch(config, catalog) {
  const remote = uniqueModelChoices(Array.isArray(catalog?.models) ? catalog.models : []);
  const additions = customModelIds(config);
  const choices = uniqueModelChoices(remote, additions, config?.model);
  const defaultModel = String(config?.model || '').trim();
  return {
    // Keep additions out of the discovery cache so removing one also removes
    // its option, unless it is still selected as the default.
    model_options: remote.filter(item => !additions.includes(item.id)),
    ...(!defaultModel && catalog?.default_model ? { model: catalog.default_model } : {}),
    ...(catalog?.oauth_saved ? { oauth_configured: true, oauth_code: '' } : {}),
    choices,
  };
}

export function configuredModelOptions(config) {
  if (config?.provider === 'ollama') return [];
  return config?.model_options || [];
}

export function runtimeProviderLabel(config) {
  const provider = getLlmProvider(config.provider);
  const name = String(config.name || config.custom_provider || '').trim();
  return config.provider === 'custom' && name ? name : provider.label;
}

export function runtimeLlmProviderOptions(draft) {
  const records = [draft?.chat, draft?.embedding, ...(draft?.profiles || []), ...(draft?.vision?.providers || []), ...(draft?.image?.providers || []), ...(draft?.compact?.providers || [])];
  const idCounts = new Map();
  for (const record of records) {
    const id = String(record?.id || '').trim();
    if (record?.provider && id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const reserved = new Set([...LLM_PROVIDER_OPTIONS.map(item => item.id), 'auto', 'chat', 'vision', 'image', 'compact', 'embedding']);
  const rows = [
    draft?.chat,
    ...(Array.isArray(draft?.profiles) ? draft.profiles : []),
  ].filter((item) => item && item.provider && item._persisted !== false);
  const options = rows.map((config) => {
    const id = String(config.id || '').trim();
    if (!id || id.length > 256 || reserved.has(id.toLowerCase()) || id.toLowerCase().startsWith('custom:') || idCounts.get(id) !== 1) return null;
    const requestProvider = id;
    const provider = normalizeLlmProviderId(config.provider);
    const modelOptions = uniqueModelChoices(config.model, configuredModelOptions(config), customModelIds(config));
    return {
      id,
      label: runtimeProviderLabel(config),
      provider,
      requestProvider,
      legacySelectors: Array.isArray(config.legacy_selectors) ? config.legacy_selectors : [],
      authMode: String(config.auth_mode || getLlmProvider(provider).defaultAuth || '').trim(),
      customProvider: provider === 'custom' ? String(config.name || config.custom_provider || '').trim() : '',
      baseUrl: provider === 'custom' ? String(config.base_url || '').trim() : '',
      ...(provider === 'custom' ? { protocol: config.protocol || 'openai' } : {}),
      defaultModelId: String(config.model || '').trim(),
      defaultReasoningEffort: normalizeReasoningEffort(config.reasoning_effort),
      customModelIds: customModelIds(config),
      modelOptions,
    };
  });
  return options.filter(Boolean);
}

export function nextProviderDraft(providerId, previous = {}) {
  const provider = getLlmProvider(providerId);
  const isCustom = providerId === 'custom';
  const choices = modelChoicesFor(providerId);
  return {
    ...previous,
    provider: provider.id,
    auth_mode: provider.defaultAuth,
    protocol: isCustom ? 'openai' : undefined,
    custom_provider: isCustom ? String(previous.custom_provider || previous.name || '').trim() : '',
    model: isCustom || providerId === 'ollama' ? '' : (choices[0] || provider.defaultModel),
    base_url: isCustom ? '' : provider.baseUrl,
    name: isCustom ? String(previous.name || previous.custom_provider || '').trim() : '',
    api_key: '',
    api_key_configured: false,
    model_options: [],
    custom_model_ids: [],
    oauth_auth_url: '',
    oauth_code: '',
    oauth_state: '',
    oauth_verifier: '',
    oauth_configured: false,
  };
}

// Vision providers are a list because the runtime only ever runs one VLM: the
// chat model is preferred, and otherwise the single enabled provider serves
// the request. A draft entry stays disabled until the user flips its switch.
function normalizeVisionProvider(entry, index = 0) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const provider = normalizeLlmProviderId(source.provider);
  const authMode = normalizeToken(source.auth_mode);
  return {
    ...source,
    id: String(source.id || '').trim() || `vision-${index + 1}`,
    _persisted: source.id ? source._persisted : false,
    enabled: source.enabled === true,
    provider,
    auth_mode: authMode || (provider === 'ollama' ? 'none' : 'api_key'),
    custom_provider: String(source.custom_provider || '').trim(),
    name: String(source.name || source.custom_provider || '').trim(),
    model: String(source.model || '').trim(),
    base_url: String(source.base_url || '').trim(),
    model_options: Array.isArray(source.model_options) ? source.model_options : [],
  };
}

// Accepts the canonical {mode, providers} shape plus the legacy single-object
// draft (`{enabled, provider, model, ...}`) so stored drafts keep their VLM.
export function normalizeVisionDraft(value) {
  const source = value && typeof value === 'object' ? value : {};
  let rows;
  if (Array.isArray(source.providers)) {
    rows = source.providers;
  } else if (source.provider) {
    // Legacy single-object draft: the list-level keys move to the draft, not
    // into the migrated provider entry.
    const legacy = { ...source };
    delete legacy.mode;
    delete legacy.enabled;
    delete legacy.providers;
    rows = [legacy];
  } else {
    rows = [];
  }
  const providers = [];
  let active = false;
  const legacyRows = !Array.isArray(source.providers);
  rows.forEach((row, index) => {
    const hasFlag = Boolean(row) && typeof row === 'object' && row.enabled !== undefined;
    // 旧单对象草稿没写 enabled 时按“有 provider 即启用”迁移；列表里的新条目默认关闭。
    const requested = hasFlag ? row.enabled === true : (legacyRows && Boolean(row?.provider));
    const entry = normalizeVisionProvider(row, index);
    const enabled = requested && !active;
    active = active || enabled;
    providers.push({ ...entry, enabled });
  });
  return {
    mode: String(source.mode || 'auto').trim() || 'auto',
    providers,
  };
}

export function createVisionProviderDraft() {
  return {
    id: `vision-${Date.now()}`,
    _persisted: false,
    enabled: false,
    provider: 'custom',
    auth_mode: 'api_key',
    custom_provider: '',
    name: '',
    model: '',
    api_key: '',
    base_url: '',
    model_options: [],
    oauth_auth_url: '',
    oauth_code: '',
    oauth_state: '',
    oauth_verifier: '',
    oauth_configured: false,
  };
}

// Enabling one provider releases the others; disabling leaves the rest alone.
export function setVisionProviderEnabled(vision, entryId, enabled) {
  const source = vision && typeof vision === 'object' ? vision : {};
  const providers = (Array.isArray(source.providers) ? source.providers : []).map((item) => {
    if (item.id === entryId) return { ...item, enabled: enabled === true };
    return enabled === true ? { ...item, enabled: false } : item;
  });
  return {
    ...source,
    mode: String(source.mode || 'auto').trim() || 'auto',
    providers,
  };
}

// Image providers reuse the Vision list shape (at most one enabled) but carry no
// `mode`: it would have no runtime consumer. Only OpenAI-compatible endpoints
// expose /images/generations, so the editor offers just these two providers.
export const IMAGE_PROVIDER_IDS = ['openai', 'custom'];

function normalizeImageProvider(entry, index = 0) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const provider = normalizeLlmProviderId(source.provider);
  const authMode = normalizeToken(source.auth_mode);
  return {
    ...source,
    id: String(source.id || '').trim() || `image-${index + 1}`,
    _persisted: source.id ? source._persisted : false,
    enabled: source.enabled === true,
    provider,
    auth_mode: authMode || 'api_key',
    custom_provider: String(source.custom_provider || '').trim(),
    name: String(source.name || source.custom_provider || '').trim(),
    model: String(source.model || '').trim(),
    base_url: String(source.base_url || '').trim(),
    model_options: Array.isArray(source.model_options) ? source.model_options : [],
  };
}

// Accepts the canonical {providers} shape plus a legacy single-object draft.
export function normalizeImageDraft(value) {
  const source = value && typeof value === 'object' ? value : {};
  let rows;
  if (Array.isArray(source.providers)) {
    rows = source.providers;
  } else if (source.provider) {
    const legacy = { ...source };
    delete legacy.enabled;
    delete legacy.providers;
    rows = [legacy];
  } else {
    rows = [];
  }
  const providers = [];
  let active = false;
  const legacyRows = !Array.isArray(source.providers);
  rows.forEach((row, index) => {
    const hasFlag = Boolean(row) && typeof row === 'object' && row.enabled !== undefined;
    const requested = hasFlag ? row.enabled === true : (legacyRows && Boolean(row?.provider));
    const entry = normalizeImageProvider(row, index);
    const enabled = requested && !active;
    active = active || enabled;
    providers.push({ ...entry, enabled });
  });
  return { providers };
}

export function createImageProviderDraft() {
  return {
    ...createVisionProviderDraft(),
    id: `image-${Date.now()}`,
    provider: 'openai',
  };
}

// Enabling one provider releases the others; disabling leaves the rest alone.
export function setImageProviderEnabled(image, entryId, enabled) {
  const source = image && typeof image === 'object' ? image : {};
  const providers = (Array.isArray(source.providers) ? source.providers : []).map((item) => {
    if (item.id === entryId) return { ...item, enabled: enabled === true };
    return enabled === true ? { ...item, enabled: false } : item;
  });
  return { ...source, providers };
}

export function normalizeCompactDraft(value) {
  const sources = (Array.isArray(value?.providers) ? value.providers : []).filter(row => row && typeof row === 'object' && row.provider);
  const normalized = normalizeVisionDraft({ providers: sources });
  return { providers: normalized.providers.map((row, index) => ({
    ...row,
    id: sources[index]?.id || `compact-${index + 1}`,
    reasoning_effort: row.reasoning_effort || 'high',
    thinking: row.thinking || 'auto',
  })) };
}

// Secrets are submitted to the backend credential store, never persisted in
// the ordinary local draft cache (including unsaved Compact credentials).
export function llmDraftForStorage(draft) {
  return JSON.stringify(draft, (key, value) => ['api_key', 'oauth_code', 'oauth_verifier', 'oauth_state'].includes(key) ? undefined : value);
}

export function createCompactProviderDraft() {
  return { ...createVisionProviderDraft(), id: `compact-${Date.now()}`, reasoning_effort: 'high', thinking: 'auto' };
}

// Compact shares Chat's generic effort choices; adapters own wire mapping.
export function compactThinkingOptions() {
  return { modes: ['auto'], efforts: SETTINGS_REASONING_OPTIONS.map(item => item.id) };
}

function createDefaultLlmSettings() {
  return {
    chat: {},
    compact: { providers: [] },
    vision: {
      mode: 'auto',
      providers: [],
    },
    image: {
      providers: [],
    },
    embedding: {
      enabled: false,
      provider: 'custom',
      auth_mode: 'api_key',
      custom_provider: '',
      model: '',
      api_key: '',
      base_url: '',
    },
    profiles: [],
  };
}

function normalizeLlmModelConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const provider = normalizeLlmProviderId(config.provider);
  if (!provider) return { ...config, provider: '' };
  if (provider === 'custom' && !config.name && config.custom_provider) {
    return { ...config, provider, name: config.custom_provider, reasoning_effort: normalizeReasoningEffort(config.reasoning_effort) };
  }
  return { ...config, provider, reasoning_effort: normalizeReasoningEffort(config.reasoning_effort) };
}

export function loadLlmSettingsDraft() {
  const fallback = createDefaultLlmSettings();
  try {
    const raw = window.localStorage?.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw);
    const draft = {
      chat: normalizeLlmModelConfig({ ...fallback.chat, ...(stored?.chat || {}) }),
      vision: normalizeVisionDraft(stored?.vision),
      image: normalizeImageDraft(stored?.image),
      compact: normalizeCompactDraft(stored?.compact),
      embedding: { ...fallback.embedding, ...(stored?.embedding || {}) },
      profiles: Array.isArray(stored?.profiles) ? stored.profiles : [],
    };
    return draft;
  } catch {
    return fallback;
  }
}

function persistedAuxiliaryRows(section) {
  const rows = Array.isArray(section?.providers) ? section.providers : (section?.provider ? [section] : []);
  return { ...section, providers: rows.filter(row => row && typeof row === 'object').map(row => ({ ...row, _persisted: Boolean(row.id) })) };
}

export function applyLlmSettingsPayloadToDraft(previous, payload) {
  if (!payload || typeof payload !== 'object') return previous;
  const hasBackendConfig = ['chat', 'vision', 'image', 'compact', 'embedding', 'profiles']
    .some(key => Object.hasOwn(payload, key));
  if (!hasBackendConfig) return previous;
  const fallback = createDefaultLlmSettings();
  return {
    chat: normalizeLlmModelConfig({ ...fallback.chat, ...(payload.chat || {}), _persisted: Boolean(payload.chat?.id) }),
    vision: normalizeVisionDraft(persistedAuxiliaryRows(payload.vision)),
    image: normalizeImageDraft(persistedAuxiliaryRows(payload.image)),
    compact: normalizeCompactDraft(persistedAuxiliaryRows(payload.compact)),
    embedding: { ...fallback.embedding, ...(payload.embedding || {}), _persisted: Boolean(payload.embedding?.id) },
    profiles: Array.isArray(payload.profiles)
      ? payload.profiles.map((profile) => normalizeLlmModelConfig({ ...profile, _persisted: Boolean(profile.id) }))
      : [],
  };
}

// Reads and successful writes refresh saved settings, not edits made while
// the request was pending. Lists reconcile by record id, never by position.
export function mergeLlmSettingsDraft(current, saved, baseline) {
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  if (same(current, baseline)) return saved;
  const record = (draft = {}, incoming = {}, before = {}) => {
    if (draft.id && draft.id !== incoming.id && !same(draft, before)) {
      return { ...draft, _persisted: false };
    }
    return {
      ...incoming,
      ...Object.fromEntries(Object.entries(draft).filter(([key, value]) => !same(value, before?.[key]))),
    };
  };
  const rows = (draft = [], incoming = [], before = []) => {
    const currentById = new Map(draft.map(row => [row.id, row]));
    const beforeById = new Map(before.map(row => [row.id, row]));
    const incomingIds = new Set(incoming.map(row => row.id));
    return [
      ...incoming.filter(row => !beforeById.has(row.id) || currentById.has(row.id))
        .map(row => record(currentById.get(row.id), row, beforeById.get(row.id))),
      ...draft.filter(row => !incomingIds.has(row.id)
        && (!beforeById.has(row.id) || !same(row, beforeById.get(row.id))))
        .map(row => ({ ...row, _persisted: false })),
    ];
  };
  const auxiliary = key => ({
    ...record(current?.[key], saved[key], baseline?.[key]),
    providers: rows(current?.[key]?.providers, saved[key]?.providers, baseline?.[key]?.providers),
  });
  return {
    ...saved,
    chat: record(current?.chat, saved.chat, baseline?.chat),
    embedding: record(current?.embedding, saved.embedding, baseline?.embedding),
    profiles: rows(current?.profiles, saved.profiles, baseline?.profiles),
    vision: auxiliary('vision'),
    image: auxiliary('image'),
    compact: auxiliary('compact'),
  };
}
