// @haish-esm
export function resolveApiBase() {
  const explicitBase = String(window.AGENT_WORLD_API_BASE || '').trim();
  if (explicitBase) return explicitBase.replace(/\/$/, '');
  return '';
}

export const API_BASE = resolveApiBase();
