// Saved snapshots, editable drafts and API revisions are deliberately separate.
// Events contain invalidations only: never settings, credentials or file paths.
const entries = new Map();
const listeners = new Set();
const refreshers = new Set();
const responses = new WeakMap();
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let scheduled = false;
let sequence = 0;
function changed() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => { scheduled = false; listeners.forEach(fn => fn()); });
}
const entry = resource => {
  if (!entries.has(resource)) entries.set(resource, {});
  return entries.get(resource);
};

export function trackSettingsDraft(resource, current) {
  const state = entry(resource);
  if (!Object.hasOwn(state, 'baseline')) state.baseline = current;
  state.current = current;
}

// Agents/Workflows save one row, not the whole catalog. A successful row
// mutation must not erase other unsaved rows that were never submitted.
function mergeCatalogWrite(resource, current, incoming, baseline, submitted, target) {
  const id = row => row?.[resource === 'agents' ? 'agent_id' : 'workflow_id'] || row?.id;
  const result = { ...incoming };
  for (const group of ['presets', 'custom']) {
    const before = new Map((baseline?.[group] || []).map(row => [id(row), row]));
    const atRequest = new Map((submitted?.[group] || []).map(row => [id(row), row]));
    const saved = new Map((incoming?.[group] || []).map(row => [id(row), row]));
    for (const row of current?.[group] || []) {
      const key = id(row);
      const reference = key === target ? atRequest.get(key) : before.get(key);
      if (!equal(row, reference)) saved.set(key, row);
    }
    result[group] = [...saved.values()];
  }
  return result;
}

export function reconcileSettings(resource, current, incoming, payload) {
  const state = entry(resource);
  const meta = responses.get(payload) || {};
  if (!Object.keys(meta.versions || {}).length) return incoming; // Compatibility with old runtimes.
  if (!settingsResponseIsCurrent(payload, resource)) return current;
  // React may evaluate a functional updater twice. Reusing the same response
  // must not reinterpret the original clean draft as a newly dirty one.
  const previous = state.reconciled;
  if (previous?.meta === meta && equal(previous.current, current) && equal(previous.incoming, incoming)) return previous.result;
  const accept = result => {
    state.reconciled = { meta, current, incoming, result };
    return result;
  };
  state.appliedSequence = meta.sequence;
  const version = meta.versions?.[resource];
  if (resource === 'skills') {
    state.baseline = incoming;
    state.current = incoming;
    state.version = version;
    state.conflict = false;
    changed();
    return accept(incoming);
  }
  if (!Object.hasOwn(state, 'baseline')) state.baseline = current;
  const writing = Object.hasOwn(meta.submitted || {}, resource);
  const discard = state.discard && equal(current, state.discard.current);
  state.discard = null;
  if (writing || discard || equal(current, state.baseline) || equal(current, incoming)) {
    const preserveLaterEdit = writing && !equal(current, meta.submitted[resource]);
    const next = writing && ['agents', 'workflows'].includes(resource)
      ? mergeCatalogWrite(resource, current, incoming, state.baseline, meta.submitted[resource], meta.target)
      : preserveLaterEdit ? current : incoming;
    state.baseline = incoming;
    state.version = version || state.version;
    state.conflict = false;
    state.discard = false;
    state.current = next;
    changed();
    return accept(state.current);
  }
  // Redacted secrets can change without changing the visible response body.
  // Never grant a dirty draft a new revision merely because both keys are blank.
  if (!equal(incoming, state.baseline) || (state.version && state.version !== version)) {
    state.conflict = true;
  } else {
    state.version = version || state.version;
    state.conflict = false;
  }
  state.current = current;
  changed();
  return accept(current);
}

export function settingsResponseIsCurrent(payload, resource) {
  const meta = responses.get(payload);
  if (!Object.keys(meta?.versions || {}).length) return true;
  const state = entry(resource);
  return Boolean(meta.versions[resource]) && meta.generations?.[resource] === state.generation
    && !meta.blocked?.[resource] && (meta.submitted || !state.pending)
    && meta.sequence >= (state.appliedSequence || 0);
}

export function settingsResources(input, init = {}) {
  const path = String(input).split('?')[0].replace(/^https?:\/\/[^/]+/, '');
  const route = path.split('/api/settings/')[1];
  if (!route || ['memory/test', 'tools/mcp/validate', 'tools/web-search/test'].includes(route) || route.startsWith('tools/browser')) return [];
  const root = route.split('/')[0];
  if (['llm', 'memory', 'agents', 'workflows'].includes(root)) return [root];
  if (route.startsWith('tools/skills')) return ['skills'];
  if (route !== 'tools') return [];
  if (!init.method || init.method === 'GET') return ['mcp', 'web_search', 'skills'];
  try { const payload = JSON.parse(init.body); return ['mcp', 'web_search', 'skills'].filter(key => Object.hasOwn(payload, key)); }
  catch { return []; }
}

export function prepareSettingsRequest(input, init) {
  const resources = settingsResources(input, init);
  const writing = ['PUT', 'POST', 'PATCH', 'DELETE'].includes(init.method);
  const generations = {};
  const blocked = {};
  resources.forEach(resource => {
    const state = entry(resource);
    generations[resource] = state.generation || 0;
    state.generation ||= 0;
    // Own-write notifications can start a GET before its PUT is applied. Such
    // reads must stay deferred even if React applies them after the PUT ends.
    blocked[resource] = !writing && Boolean(state.pending);
  });
  if (!writing || !resources.length) return { init, resources, generations, blocked, sequence: ++sequence };
  const versions = {};
  const submitted = {};
  let stale = false;
  for (const resource of resources) {
    const state = entry(resource);
    if (state.version && state.pending) throw new Error('Settings are still being saved. Wait for the current save to finish.');
    // 别处改过不拦保存：保存是用户的明确意图，这一笔按最后写入生效发出去，只是不带前置
    // 版本号，免得服务端用 409 把表单顶回来。版本号只用来识别旧数据、触发列表刷新。
    if (state.version && state.conflict) stale = true;
    else if (state.version) versions[resource] = state.version;
    submitted[resource] = state.current;
  }
  resources.forEach(resource => {
    const state = entry(resource);
    state.pending = (state.pending || 0) + 1;
    generations[resource] = ++state.generation;
  });
  let target;
  if (resources.some(resource => ['agents', 'workflows'].includes(resource))) {
    const route = String(input).split('?')[0];
    try { target = init.method === 'POST' ? JSON.parse(init.body).id : decodeURIComponent(route.split(/\/(?:custom|presets)\//)[1] || ''); }
    catch { /* Invalid payloads are rejected by the API. */ }
  }
  const headers = { ...init.headers };
  if (!stale && Object.keys(versions).length) headers['If-Haish-Settings-Match'] = JSON.stringify(versions);
  return { resources, submitted, generations, target, sequence: ++sequence, init: { ...init, headers } };
}

export function observeSettingsResponse(response, request) {
  if (!request.resources.length) return response;
  let versions = {};
  try { versions = JSON.parse(response.headers?.get('x-haish-settings-versions') || '{}'); } catch { /* Old runtime. */ }
  if (response.status === 409) {
    request.resources.forEach(resource => { entry(resource).conflict = true; });
    changed();
    invalidateSettings(request.resources);
  }
  const json = response.json.bind(response);
  response.json = async () => {
    try {
      const payload = await json();
      if (payload && typeof payload === 'object') responses.set(payload, { versions, generations: request.generations, blocked: request.blocked, target: request.target, sequence: request.sequence, submitted: response.ok ? request.submitted : undefined });
      return payload;
    } finally {
      finishSettingsRequest(request);
    }
  };
  return response;
}

export function finishSettingsRequest(request) {
  if (!request.submitted || request.finished) return;
  request.finished = true;
  request.resources.forEach(resource => { const state = entry(resource); state.pending = Math.max(0, (state.pending || 0) - 1); });
  // The writer applies its response first; reads skipped during PUT must recover.
  setTimeout(() => invalidateSettings(request.resources), 0);
}
export function hasSettingsVersion(payload, resource) {
  const versions = responses.get(payload)?.versions || {};
  return resource ? Boolean(versions[resource]) : Object.keys(versions).length > 0;
}
export function resetSettingsSync() { entries.clear(); changed(); }

export function subscribeSettingsStatus(callback) { listeners.add(callback); return () => listeners.delete(callback); }
export function settingsConflicts() { return [...entries].filter(([, state]) => state.conflict).map(([resource]) => resource); }
export function onSettingsInvalidated(callback) { refreshers.add(callback); return () => refreshers.delete(callback); }
export function invalidateSettings(resources) { refreshers.forEach(fn => fn(resources)); }
export function reloadSettings(resource) {
  const state = entry(resource);
  state.discard = { current: state.current };
  invalidateSettings([resource]);
}
export function copySettingsResponse(source, target) {
  const meta = responses.get(source);
  if (meta) responses.set(target, meta);
  return target;
}
