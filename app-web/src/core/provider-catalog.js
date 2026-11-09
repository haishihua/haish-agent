// LLM provider 目录：后端可选的 provider、默认模型与鉴权模式。
// chat 的模型选择器、workflow 的运行配置、settings 的编辑器都读这一份，
// 谁也不为了拿 provider 名字去 import settings。

export const LLM_PROVIDER_MODELS = {
  openai: ['gpt-5.5', 'gpt-5.4'],
  xai: ['grok-4.5'],
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
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
  { id: 'anthropic', label: 'Anthropic', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'claude-opus-5-5', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'gemini', label: 'Gemini', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'gemini-2.5-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'deepseek', label: 'DeepSeek', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'deepseek-v4-flash', baseUrl: 'https://api.deepseek.com' },
  { id: 'dashscope', label: 'DashScope', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'qwen3-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', label: 'Moonshot', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'kimi-k2.7-code', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'minimax', label: 'MiniMax', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'minimax-m3', baseUrl: 'https://api.minimaxi.com/v1' },
  { id: 'zhipu', label: 'Zhipu', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: 'glm-5.2', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'ollama', label: 'Ollama', authModes: ['none'], defaultAuth: 'none', defaultModel: '', baseUrl: 'http://127.0.0.1:11434/v1' },
  { id: 'custom', label: 'Custom', authModes: ['api_key'], defaultAuth: 'api_key', defaultModel: '', baseUrl: '' },
];

const HIDDEN_SETTINGS_LLM_PROVIDERS = new Set(['gemini']);
export const SETTINGS_LLM_PROVIDER_OPTIONS = LLM_PROVIDER_OPTIONS.filter((item) => !HIDDEN_SETTINGS_LLM_PROVIDERS.has(item.id));
/** Providers that show OAuth fields in Settings. */
export const LLM_OAUTH_UI_PROVIDERS = new Set(['openai', 'xai']);
/** Providers whose callback is captured and completed by the local runtime. */
export const LLM_OAUTH_CALLBACK_PROVIDERS = new Set(['openai', 'xai']);

export const CUSTOM_LLM_PROTOCOL_OPTIONS = [
  { id: 'openai', label: 'OpenAI-compatible' },
  { id: 'anthropic', label: 'Anthropic Messages' },
];

export function getLlmProvider(id) {
  return LLM_PROVIDER_OPTIONS.find((item) => item.id === id) || LLM_PROVIDER_OPTIONS[0];
}

// provider 之间真正影响 Settings 表单与运行时的差异只有这几项。原先散在各处的
// `=== 'custom'` / `=== 'ollama'` 全部改成查这张表：加新例外只改这里一行。
// 未登记的 provider 一律按默认能力处理。
const DEFAULT_PROVIDER_CAPABILITIES = {
  hasPresetModels: true,
  exposesModelOptions: true,
  requiresBaseUrl: false,
  defaultAuthMode: 'api_key',
};

const PROVIDER_CAPABILITIES = {
  // 自定义供应商：模型清单由用户填或现场发现，baseUrl、协议、显示名也都得用户自己给。
  custom: { ...DEFAULT_PROVIDER_CAPABILITIES, hasPresetModels: false, requiresBaseUrl: true },
  // 本地 Ollama：没有预设模型，运行时也不回模型清单，本地服务不用 key。
  ollama: { ...DEFAULT_PROVIDER_CAPABILITIES, hasPresetModels: false, exposesModelOptions: false, defaultAuthMode: 'none' },
};

// 这里不做归一化：各调用点比对的就是它自己拿到的原始值（例如 configuredModelOptions
// 只认小写 'ollama'），顺手归一化会改掉这些既有判定。
export function getProviderCapabilities(providerId) {
  // 只认自有键：'toString' 这类原型链上的键必须落到默认能力，而不是拿到函数。
  return Object.hasOwn(PROVIDER_CAPABILITIES, providerId) ? PROVIDER_CAPABILITIES[providerId] : DEFAULT_PROVIDER_CAPABILITIES;
}

// Provider ids and auth modes share one loose spelling ('API-KEY', 'api_key ').
export const normalizeProviderToken = (value) => String(value || '').trim().toLowerCase().replace(/-/g, '_');

export function normalizeLlmProviderId(value) {
  return normalizeProviderToken(value);
}

// 只有同时提供两种鉴权方式的 provider 才需要在列表/选择器里区分。
// 缺失的 mode 与创建 provider 记录时的默认值一致。
export function providerAuthBadge(providerId, authMode) {
  const id = normalizeLlmProviderId(providerId);
  const provider = LLM_PROVIDER_OPTIONS.find((item) => item.id === id);
  if (!provider?.authModes.includes('oauth') || !provider.authModes.includes('api_key')) return '';
  const mode = normalizeProviderToken(authMode || provider.defaultAuth);
  if (mode === 'api_key') return 'API';
  if (mode === 'oauth') return 'OAuth';
  return '';
}
