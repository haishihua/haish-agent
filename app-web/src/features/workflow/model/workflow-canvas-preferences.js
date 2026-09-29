const KEY = 'haish.workflow-canvas-preferences.v1';
const EVENT = 'haish:workflow-canvas-preferences';
export const workflowCanvasPreferencesSnapshot = () => {
  try { return window.localStorage.getItem(KEY) || '{}'; } catch { return '{}'; }
};
export const parseWorkflowCanvasPreferences = (text) => {
  try { const value = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
};
export const subscribeWorkflowCanvasPreferences = (listener) => {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener); };
};
export function saveWorkflowCanvasPreferences(id, patch) {
  if (!id) return false;
  try {
    const all = parseWorkflowCanvasPreferences(workflowCanvasPreferencesSnapshot());
    all[id] = { ...all[id], ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch { return false; }
}
export function workflowFitOptions(id, defaults) {
  const zoom = parseWorkflowCanvasPreferences(workflowCanvasPreferencesSnapshot())[id]?.zoom;
  return Number.isFinite(zoom) ? { ...defaults, minZoom: zoom, maxZoom: zoom } : defaults;
}
