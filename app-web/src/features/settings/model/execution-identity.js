// Legacy aliases are frozen by the backend upgrade, never inferred from today's names.
export function savedExecutionConfigId(selector, providerOptions = [], legacy = false) {
  const value = String(selector || '').trim();
  if (!value || value.toLowerCase() === 'auto') return '';
  const exact = providerOptions.filter((item) => item.id === value);
  if (exact.length) return exact.length === 1 ? exact[0].id : '';
  if (!legacy) return '';
  const aliases = providerOptions.filter((item) => item.legacySelectors?.includes(value));
  return aliases.length === 1 ? aliases[0].id : '';
}

export function migrateExecutionRoute(config = {}, providerOptions = []) {
  const result = { ...config };
  const id = String(config.llm_config_id || '').trim();
  const legacy = String(config.provider || '').trim();
  if (id && legacy && id !== legacy) return result; // Validation must reject the conflict.
  const resolved = savedExecutionConfigId(id || legacy, providerOptions, !id);
  if (resolved) {
    result.llm_config_id = resolved;
    delete result.provider;
  }
  return result; // Unresolved identity remains visible; never clear or substitute it.
}
