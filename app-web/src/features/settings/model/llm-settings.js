// Settings domain model.
export const LLM_PROVIDER_MODELS = {
  openai: ['gpt-5.5', 'gpt-5.4'],
  xai: ['grok-4.5'],
  anthropic: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-4-6'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  dashscope: ['qwen3-max', 'qwen3-plus', 'qwen3-vl-max'],
  moonshot: ['kimi-k2.7-code', 'kimi-k2.6', 'kimi-k2.5'],
  minimax: ['minimax-m3', 'minimax-m2.7', 'minimax-vl-01'],
  zhipu: ['glm-5.2', 'glm-5.1v-thinking-flash', 'glm-4.5v'],
  ollama: [],
  custom: [],
};

export const LLM_PROVIDER_OPTIONS = [
  { id: 'openai', label: 'OpenAI', authModes: ['api_key', 'oauth'], defaultAuth: 'api_key', defaultModel: 'gpt-5.5', baseUrl: 'https://api.openai.com/v1' },
  { id: 'xai', label: 'xAI', authModes: ['api_key', 'oauth'], defaultAuth: 'api_key', defaultModel: 'grok-4.5', baseUrl: 'https://api.x.ai/v1' },
  { id: 'anthropic', label: 'Anthropic', authModes: ['api_key', 'oauth'], defaultAuth: 'api_key', defaultModel: 'claude-opus-4-8', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'gemini', label: 'Gemini', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'gemini-2.5-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'deepseek', label: 'DeepSeek', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com' },
  { id: 'dashscope', label: 'DashScope', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'qwen3-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', label: 'Moonshot', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'kimi-k2.7-code', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'minimax', label: 'MiniMax', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'minimax-m3', baseUrl: 'https://api.minimaxi.com/v1' },
  { id: 'zhipu', label: 'Zhipu', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'glm-5.2', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'ollama', label: 'Ollama', authModes: ['none'], defaultAuth: 'none', defaultModel: '', baseUrl: 'http://127.0.0.1:11434/v1' },
  { id: 'custom', label: 'Custom', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: '', baseUrl: '' },
];
export const HIDDEN_SETTINGS_LLM_PROVIDERS = new Set(['anthropic', 'gemini']);
export const SETTINGS_LLM_PROVIDER_OPTIONS = LLM_PROVIDER_OPTIONS.filter((item) => !HIDDEN_SETTINGS_LLM_PROVIDERS.has(item.id));
/** Providers that show OAuth fields in Settings. */
export const LLM_OAUTH_UI_PROVIDERS = new Set(['openai', 'xai']);
/** Providers whose callback is captured and completed by the local runtime. */
export const LLM_OAUTH_CALLBACK_PROVIDERS = new Set(['openai', 'xai']);

export const LLM_SETTINGS_STORAGE_KEY = 'haish.llmSettingsDraft.v1';

export const SETTINGS_REASONING_OPTIONS = [
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
];

export function getLlmProvider(id) {
  return LLM_PROVIDER_OPTIONS.find((item) => item.id === id) || LLM_PROVIDER_OPTIONS[0];
}

export function normalizeLlmProviderId(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

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

export function configuredModelOptions(config) {
  if (config?.provider === 'ollama') return [];
  return config?.model_options || [];
}

export function runtimeProviderLabel(config) {
  const provider = getLlmProvider(config.provider);
  const name = String(config.name || config.custom_provider || '').trim();
  return config.provider === 'custom' && name ? name : provider.label;
}

export function runtimeProviderSelector(config) {
  const provider = normalizeLlmProviderId(config.provider);
  if (provider === 'custom') {
    const key = String(config.name || config.custom_provider || config.base_url || config.model || '').trim();
    return key ? `custom:${key}` : 'custom';
  }
  return provider || 'auto';
}

export function runtimeLlmProviderOptions(draft) {
  const rows = [
    draft?.chat,
    ...(Array.isArray(draft?.profiles) ? draft.profiles : []),
  ].filter((item) => item && item.provider);
  const seen = new Set();
  const options = rows.map((config, index) => {
    const providerSelector = runtimeProviderSelector(config);
    const requestProvider = String(config.id || '').trim() || providerSelector;
    const idBase = config.id || `${index === 0 ? 'chat' : 'profile'}:${providerSelector}`;
    const id = seen.has(idBase) ? `${idBase}:${index}` : idBase;
    seen.add(id);
    const provider = normalizeLlmProviderId(config.provider);
    const modelOptions = uniqueModelChoices(config.model, configuredModelOptions(config));
    return {
      id,
      label: runtimeProviderLabel(config),
      provider,
      requestProvider,
      authMode: String(config.auth_mode || getLlmProvider(provider).defaultAuth || '').trim(),
      customProvider: provider === 'custom' ? String(config.name || config.custom_provider || '').trim() : '',
      baseUrl: provider === 'custom' ? String(config.base_url || '').trim() : '',
      defaultModelId: String(config.model || '').trim(),
      modelOptions,
    };
  });
  return options;
}

export function nextProviderDraft(providerId, previous = {}) {
  const provider = getLlmProvider(providerId);
  const isCustom = providerId === 'custom';
  const choices = modelChoicesFor(providerId);
  return {
    ...previous,
    provider: provider.id,
    auth_mode: provider.defaultAuth,
    custom_provider: isCustom ? String(previous.custom_provider || previous.name || '').trim() : '',
    model: isCustom || providerId === 'ollama' ? '' : (choices[0] || provider.defaultModel),
    base_url: isCustom ? '' : provider.baseUrl,
    name: isCustom ? String(previous.name || previous.custom_provider || '').trim() : '',
    api_key: '',
    api_key_configured: false,
    model_options: [],
    oauth_auth_url: '',
    oauth_code: '',
    oauth_state: '',
    oauth_verifier: '',
    oauth_configured: false,
  };
}

export function createDefaultLlmSettings() {
  return {
    chat: {},
    vision: {
      enabled: false,
      mode: 'auto',
      provider: 'custom',
      auth_mode: 'api_key',
      custom_provider: '',
      model: '',
      api_key: '',
      base_url: '',
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

export function normalizeLlmModelConfig(config) {
  if (!config || typeof config !== 'object') return {};
  const provider = normalizeLlmProviderId(config.provider);
  if (!provider) return { ...config, provider: '' };
  if (provider === 'custom' && !config.name && config.custom_provider) {
    return { ...config, provider, name: config.custom_provider };
  }
  return { ...config, provider };
}

export function loadLlmSettingsDraft() {
  const fallback = createDefaultLlmSettings();
  try {
    const raw = window.localStorage?.getItem(LLM_SETTINGS_STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw);
    const draft = {
      chat: normalizeLlmModelConfig({ ...fallback.chat, ...(stored?.chat || {}) }),
      vision: { ...fallback.vision, ...(stored?.vision || {}) },
      embedding: { ...fallback.embedding, ...(stored?.embedding || {}) },
      profiles: Array.isArray(stored?.profiles) ? stored.profiles : [],
    };
    return draft;
  } catch {
    return fallback;
  }
}

export function applyLlmSettingsPayloadToDraft(previous, payload) {
  if (!payload || typeof payload !== 'object') return previous;
  const hasBackendConfig = Boolean(
    payload.chat?.provider
    || payload.vision?.provider
    || payload.embedding?.provider
    || (Array.isArray(payload.profiles) && payload.profiles.length > 0),
  );
  if (!hasBackendConfig) return previous;
  const fallback = createDefaultLlmSettings();
  return {
    chat: normalizeLlmModelConfig({ ...fallback.chat, ...(payload.chat || {}) }),
    vision: { ...fallback.vision, ...(payload.vision || {}) },
    embedding: { ...fallback.embedding, ...(payload.embedding || {}) },
    profiles: Array.isArray(payload.profiles)
      ? payload.profiles.map((profile) => normalizeLlmModelConfig(profile))
      : [],
  };
}
