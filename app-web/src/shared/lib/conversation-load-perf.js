// TEMPORARY: remove after measuring desktop conversation startup. No message content.
const PREFIX = '[conversation-load-perf] ';
let sequence = 0;
let active = null;
let observer = null;
let lastDomState = '';
let count = 0;

export function conversationLoadPerf(phase, conversationId = '', fields = {}) {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return;
  try {
    if (count++ > 300) return;
    console.info(PREFIX + JSON.stringify({
      phase, conversation_id: conversationId, sequence: active?.sequence || 0,
      timestamp_ms: Date.now(),
      page_ms: Math.round(performance.now() * 10) / 10,
      elapsed_ms: active ? Math.round((performance.now() - active.started) * 10) / 10 : 0,
      hidden: document.hidden, ...fields,
    }));
  } catch { /* Diagnostics must never affect conversation loading. */ }
}

function observeDom() {
  if (observer || typeof MutationObserver === 'undefined') return;
  const sample = () => {
    if (!active || performance.now() - active.started > 30000) return;
    const splash = Boolean(document.querySelector('.app-shell-loading'));
    const loader = Boolean(document.querySelector('.chat-conversation-loading'));
    const group = document.querySelector('.chat-row-group:not([hidden])');
    const id = group?.getAttribute('data-row-group') || '';
    const rows = group?.querySelectorAll('.chat-message-row').length || 0;
    const state = `${splash}:${loader}:${id}:${rows > 0}`;
    if (state === lastDomState) return;
    lastDomState = state;
    conversationLoadPerf('dom_state', id || active.conversationId, { splash, loader, rows });
    if (!splash && !loader && rows && id === active.conversationId) {
      const measured = active;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (active !== measured || document.hidden
          || document.querySelector('.chat-conversation-loading')
          || document.querySelector('.app-shell-loading')) return;
        conversationLoadPerf('body_paint_opportunity', id, { rows });
      }));
    }
  };
  observer = new MutationObserver(sample);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  sample();
  try {
    const resources = new PerformanceObserver((list) => {
      if (!active || performance.now() - active.started > 30000) return;
      for (const entry of list.getEntries()) {
        const path = new URL(entry.name, window.location.href).pathname;
        if (!/^\/api\/conversations\/[a-f0-9]+(?:\/tasks\/runtime)?$/.test(path)) continue;
        const id = path.split('/')[3];
        conversationLoadPerf('network_resource', id, {
          start_ms: entry.startTime, duration_ms: entry.duration,
          response_start_ms: entry.responseStart, response_end_ms: entry.responseEnd,
          transfer_bytes: entry.transferSize, decoded_bytes: entry.decodedBodySize,
        });
      }
    });
    resources.observe({ type: 'resource', buffered: true });
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      const tasks = new PerformanceObserver((list) => {
        if (!active || performance.now() - active.started > 30000) return;
        for (const entry of list.getEntries()) conversationLoadPerf('long_task', active.conversationId, {
          start_ms: entry.startTime, duration_ms: entry.duration,
        });
      });
      tasks.observe({ type: 'longtask', buffered: true });
    }
  } catch { /* Some Electron versions do not expose these timing entries. */ }
}

export function beginConversationLoadPerf(conversationId, source) {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return;
  active = { conversationId, sequence: ++sequence, started: performance.now() };
  lastDomState = '';
  conversationLoadPerf('begin', conversationId, { source });
  observeDom();
}

export async function timedConversationFetch(fetcher, input, init) {
  const match = String(input).match(/\/api\/conversations\/([a-f0-9]+)(\/tasks\/runtime)?(?:\?|$)/);
  if (!match) return fetcher(input, init);
  const id = match[1];
  const kind = match[2] ? 'runtime' : 'detail';
  const start = performance.now();
  conversationLoadPerf(`${kind}_request`, id);
  try {
    const response = await fetcher(input, init);
    conversationLoadPerf(`${kind}_headers`, id, { duration_ms: performance.now() - start, status: response.status });
    const parseJson = response.json.bind(response);
    response.json = async () => {
      const parseStart = performance.now();
      const result = await parseJson();
      conversationLoadPerf(`${kind}_json_ready`, id, {
        duration_ms: performance.now() - parseStart, total_ms: performance.now() - start,
        tasks: Array.isArray(result) ? result.length : result?.tasks?.length || 0,
        messages: result?.messages?.length || 0,
      });
      return result;
    };
    return response;
  } catch (error) {
    conversationLoadPerf(`${kind}_request_failed`, id, { duration_ms: performance.now() - start, aborted: error?.name === 'AbortError' });
    throw error;
  }
}
