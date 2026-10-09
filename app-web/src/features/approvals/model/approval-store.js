export const approvalStore = (() => {
  let pending = [];
  const listeners = new Set();
  let stopEvents = null;
  let inputs = [];
  const modes = new Map();
  const inputListeners = new Set();
  const modeListeners = new Set();
  // Runtime cards embedded in the chat timeline claim their request while
  // mounted, so ApprovalInline does not also render a duplicate standalone
  // row. Exclusive: only the FIRST mounted card wins the claim.
  const claimedRuntimeIds = new Set();

  function notify() {
    const snapshot = pending.slice();
    for (const fn of listeners) {
      try {
        fn(snapshot);
      } catch (_) {}
    }
  }

  function notifyModes() {
    for (const { conversationId, fn } of modeListeners) fn(modes.get(conversationId) ?? null);
  }

  function ensureStream() {
    if (stopEvents) return;
    if (!window.haish?.onApprovalEvent) {
      console.warn('[approval] realtime event bridge is unavailable');
      return;
    }
    stopEvents = window.haish.onApprovalEvent((payload) => {
      if (payload.type === 'approval_snapshot') {
        const state = payload.state;
        pending = [
          ...(state.pending || []),
          ...(state.pending_workflow_approvals || []),
          ...(state.pending_browser_runtime_installs || []),
          ...(state.pending_computer_runtime_installs || []),
        ];
        inputs = state.pending_user_inputs;
        for (const [conversationId, value] of Object.entries(state.conversation_modes || {})) {
          modes.set(conversationId, value);
        }
        notify();
        for (const listener of inputListeners) listener(inputs.slice());
        notifyModes();
      } else if (payload.type === 'approval_mode_changed') {
        if (!payload.conversation_id) return;
        modes.set(payload.conversation_id, payload.mode);
        notifyModes();
      } else if (payload.type === 'input_requested' || payload.type === 'input_resolved') {
        inputs = inputs.filter((item) => item.request_id !== payload.request_id);
        if (payload.type === 'input_requested') inputs.push(payload);
        for (const listener of inputListeners) listener(inputs.slice());
      } else if (payload.type === 'approval_requested') {
        if (pending.some((p) => p.request_id === payload.request_id)) return;
        pending = [...pending, payload];
        notify();
      } else if (
        payload.type === 'browser_runtime_install_required' ||
        payload.type === 'computer_runtime_install_required'
      ) {
        if (pending.some((p) => p.request_id === payload.request_id)) return;
        pending = [...pending, payload];
        notify();
      } else if (payload.type === 'approval_resolved') {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== payload.request_id);
        if (pending.length !== before) notify();
      } else if (
        payload.type === 'browser_runtime_install_resolved' ||
        payload.type === 'computer_runtime_install_resolved'
      ) {
        const before = pending.length;
        pending = pending.filter((p) => p.request_id !== payload.request_id);
        if (pending.length !== before) notify();
      }
    });
  }

  function closeStream() {
    stopEvents?.();
    stopEvents = null;
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
    getMode(conversationId) {
      return modes.get(conversationId) ?? null;
    },
    subscribeMode(conversationId, fn) {
      const listener = { conversationId, fn };
      modeListeners.add(listener);
      fn(modes.get(conversationId) ?? null);
      return () => modeListeners.delete(listener);
    },
    setMode(conversationId, value) {
      modes.set(conversationId, value);
      notifyModes();
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
      modes.clear();
      claimedRuntimeIds.clear();
    },
    remove(requestId) {
      const before = pending.length;
      pending = pending.filter((p) => p.request_id !== requestId);
      if (pending.length !== before) notify();
    },
    claimRuntime(requestId) {
      if (claimedRuntimeIds.has(requestId)) return false;
      claimedRuntimeIds.add(requestId);
      notify();
      return true;
    },
    unclaimRuntime(requestId) {
      if (!claimedRuntimeIds.delete(requestId)) return false;
      notify();
      return true;
    },
    isRuntimeClaimed(requestId) {
      return claimedRuntimeIds.has(requestId);
    },
  };
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => approvalStore.dispose());
}

export function isBrowserRuntimeRequest(request) {
  return request?.type === 'browser_runtime_install_required' || request?.action === 'install_browser_runtime';
}

export function isComputerRuntimeRequest(request) {
  return request?.type === 'computer_runtime_install_required' || request?.action === 'install_computer_runtime';
}

export function isRuntimeRequest(request) {
  return isBrowserRuntimeRequest(request) || isComputerRuntimeRequest(request);
}

export function requestBelongsToConversation(request, conversationId) {
  const requestConversationId = String(request?.conversation_id || request?.conversationId || '').trim();
  const targetConversationId = String(conversationId || '').trim();
  return Boolean(requestConversationId && targetConversationId && requestConversationId === targetConversationId);
}

export function selectConversationApprovalRequests(requests, conversationId) {
  return (Array.isArray(requests) ? requests : []).filter(
    (request) => requestBelongsToConversation(request, conversationId),
  );
}

export function isWorkflowApprovalRequest(request) {
  return request?.approval_kind === 'workflow_human_approval';
}
