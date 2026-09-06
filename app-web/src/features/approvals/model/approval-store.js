import { API_BASE } from '../../../shared/api/base.js';

export const approvalStore = (() => {
  let pending = [];
  const listeners = new Set();
  let es = null;
  let inputs = [];
  let mode = null;
  const inputListeners = new Set();
  const modeListeners = new Set();
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
      if (payload.type === 'approval_snapshot') {
        const state = payload.state;
        pending = [
          ...state.pending,
          ...state.pending_workflow_approvals,
          ...state.pending_browser_runtime_installs,
        ];
        inputs = state.pending_user_inputs;
        mode = state.mode;
        notify();
        for (const listener of inputListeners) listener(inputs.slice());
        for (const listener of modeListeners) listener(mode);
      } else if (payload.type === 'approval_mode_changed') {
        mode = payload.mode;
        for (const listener of modeListeners) listener(mode);
      } else if (payload.type === 'input_requested' || payload.type === 'input_resolved') {
        inputs = inputs.filter((item) => item.request_id !== payload.request_id);
        if (payload.type === 'input_requested') inputs.push(payload);
        for (const listener of inputListeners) listener(inputs.slice());
      } else if (payload.type === 'approval_requested') {
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
  }

  function closeStream() {
    es?.close();
    es = null;
  }

  return {
    start: ensureStream,
    stop: closeStream,
    subscribeInputs(fn) {
      inputListeners.add(fn);
      fn(inputs.slice());
      return () => inputListeners.delete(fn);
    },
    removeInput(requestId) {
      inputs = inputs.filter((item) => item.request_id !== requestId);
      for (const listener of inputListeners) listener(inputs.slice());
    },
    subscribeMode(fn) {
      modeListeners.add(fn);
      fn(mode);
      return () => modeListeners.delete(fn);
    },
    subscribe(fn) {
      listeners.add(fn);
      // Push current snapshot immediately so new subscriber renders.
      try {
        fn(pending.slice());
      } catch (_) {}
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      closeStream();
      listeners.clear();
      inputListeners.clear();
      modeListeners.clear();
      pending = [];
      inputs = [];
      mode = null;
      claimedBrowserRuntimeIds.clear();
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => approvalStore.dispose());
}

export function isBrowserRuntimeRequest(request) {
  return request?.type === 'browser_runtime_install_required' || request?.action === 'install_browser_runtime';
}

export function isWorkflowApprovalRequest(request) {
  return request?.approval_kind === 'workflow_human_approval';
}
