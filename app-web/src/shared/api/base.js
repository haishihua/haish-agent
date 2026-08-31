export function resolveApiBase() {
  const explicitBase = String(window.HAISH_API_BASE || '').trim();
  if (explicitBase) return explicitBase.replace(/\/$/, '');
  return '';
}

export const API_BASE = resolveApiBase();
