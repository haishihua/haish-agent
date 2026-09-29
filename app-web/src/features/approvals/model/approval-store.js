export const approvalStore = (() => {
  let pending = [];
  const listeners = new Set();
  let stopEvents = null;
  let inputs = [];
  let mode = null;
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
