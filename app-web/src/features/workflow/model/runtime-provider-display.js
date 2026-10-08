import { getLlmProvider } from '../../settings/model/llm-settings.js';

// Display metadata only: never replace a saved request key with a same-brand profile.
export function runtimeProviderDisplay(value, providerOptions = [], readOnly = false) {
  const selected = providerOptions.find((item) => (item.requestProvider || item.provider || item.id) === value);
  if (selected) return { selected, label: selected.label || selected.id, provider: selected.provider || 'custom' };
  const brand = getLlmProvider(value);
  const knownBrand = brand.id === value;
  return {
    selected: null,
    label: readOnly ? (knownBrand ? brand.label : value) : `Unavailable: ${value}`,
    provider: knownBrand ? value : 'custom',
  };
}
