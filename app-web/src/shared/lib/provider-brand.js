// Model id → provider brand for the composer model list.
//
// Users configure custom routes whose display names say nothing about the model
// behind them (`ai router-ds` serves `deepseek-v4-flash`). The brand icon is
// therefore inferred from the model id first and falls back to nothing, so the
// caller can draw one neutral mark instead of guessing wrong.
//
// Keys match PROVIDER_LOGO_INK, so the same optical sizing applies.
const MODEL_BRAND_PATTERNS = [
  { brand: 'deepseek', pattern: /(^|[^a-z])deepseek([^a-z]|$)|(^|[^a-z])ds[-_ ]?v\d/ },
  { brand: 'anthropic', pattern: /claude|anthropic/ },
  { brand: 'gemini', pattern: /gemini|gemma|google/ },
  { brand: 'openai', pattern: /(^|[^a-z])(gpt|o[134])([^a-z]|$)|openai|chatgpt|codex/ },
  { brand: 'xai', pattern: /(^|[^a-z])grok([^a-z]|$)|(^|[^a-z])xai([^a-z]|$)/ },
  { brand: 'zhipu', pattern: /(^|[^a-z])(glm|chatglm|zhipu)([^a-z]|$)/ },
  { brand: 'moonshot', pattern: /(^|[^a-z])kimi([^a-z]|$)|moonshot/ },
  { brand: 'dashscope', pattern: /(^|[^a-z])(qwen|qwq|tongyi|dashscope)([^a-z]|$)/ },
  { brand: 'minimax', pattern: /minimax|(^|[^a-z])abab([^a-z]|$)|(^|[^a-z])m\d([^a-z]|$)/ },
];

/** Provider brand key for a model id, or '' when the vendor is unknown. */
export function providerBrandForModel(modelId) {
  const id = String(modelId || '').trim().toLowerCase();
  if (!id) return '';
  for (const { brand, pattern } of MODEL_BRAND_PATTERNS) {
    if (pattern.test(id)) return brand;
  }
  return '';
}
