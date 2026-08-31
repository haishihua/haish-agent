import { API_BASE } from '../../../shared/api/base.js';
import { fetchInitialApprovalState } from '../api/approvals.js';

export const approvalStore = (() => {
  let pending = [];
  const listeners = new Set();
  const eventListeners = new Set();
  let es = null;
  let initialFetchInflight = null;
  // Browser-runtime cards embedded in the chat timeline claim their request
  // while mounted, so ApprovalInline does not also render a duplicate
  // standalone row for the same request. Exclusive: only the FIRST mounted
  // card wins the claim; later mounts of the same request render nothing.
  const claimedBrowserRuntimeIds = new Set();

  function notify() {
    const snapshot = pending.slice();
    for (const fn of listeners) {
      try {
        fn(snapshot);
      } catch (_) {}
    }
  }

  function ensureStream() {
    if (es) return;
    const url = `${API_BASE}/api/approvals/stream`;
    try {
      es = new EventSource(url);
    } catch (err) {
      console.warn('[approval] EventSource construction failed', err);
      es = null;
      return;
    }
    es.onmessage = (ev) => {
      let payload;
      try {
        payload = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      for (const listener of eventListeners) {
        try {
          listener(payload);
        } catch (_) {}
      }
      if (payload.type === 'approval_requested') {
        if (pending.some((p) => p.request_id === payload.request_id)) return;
        pending = [...pending, payload];
        notify();
      } else if (payload.type === 'browser_runtime_install_required') {
        if (pending.some((p) => p.request_id === payload.request_id)) return;
        pending = [...pending, payload];
        notify();
      } else if (payload.type === 'approval_resolved') {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== payload.request_id);
        if (pending.length !== before) notify();
      } else if (payload.type === 'browser_runtime_install_resolved') {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== payload.request_id);
        if (pending.length !== before) notify();
      }
    };
    // Keep es open across reconnects; EventSource auto-reconnects on
    // transient drops. We only close on full teardown (which never happens
    // in the current Electron lifecycle).
  }

  function ensureInitial() {
    if (initialFetchInflight) return initialFetchInflight;
    initialFetchInflight = fetchInitialApprovalState()
      .then((items) => {
        // Merge in case stream events arrived first; dedupe by request_id.
        const seen = new Set(pending.map((p) => p.request_id));
        const next = pending.slice();
        for (const item of items) {
          if (!seen.has(item.request_id)) {
            seen.add(item.request_id);
            next.push(item);
          }
        }
        pending = next;
        notify();
      })
      .catch((err) => {
        console.warn('[approval] initial state load failed', err);
      });
    return initialFetchInflight;
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      ensureStream();
      ensureInitial();
      // Push current snapshot immediately so new subscriber renders.
      try {
        fn(pending.slice());
      } catch (_) {}
      return () => {
        listeners.delete(fn);
      };
    },
    subscribeEvents(fn) {
      eventListeners.add(fn);
      ensureStream();
      return () => {
        eventListeners.delete(fn);
      };
    },
    remove(requestId) {
      const before = pending.length;
      pending = pending.filter((p) => p.request_id !== requestId);
      if (pending.length !== before) notify();
    },
    claimBrowserRuntime(requestId) {
      if (claimedBrowserRuntimeIds.has(requestId)) return false;
      claimedBrowserRuntimeIds.add(requestId);
      notify();
      return true;
    },
    unclaimBrowserRuntime(requestId) {
      if (!claimedBrowserRuntimeIds.delete(requestId)) return false;
      notify();
      return true;
    },
    isBrowserRuntimeClaimed(requestId) {
      return claimedBrowserRuntimeIds.has(requestId);
    },
  };
})();

export function subscribeApprovalEvents(listener) {
  return approvalStore.subscribeEvents(listener);
}

export function isBrowserRuntimeRequest(request) {
  return request?.type === 'browser_runtime_install_required' || request?.action === 'install_browser_runtime';
}

export function isWorkflowApprovalRequest(request) {
  return request?.approval_kind === 'workflow_human_approval';
}
