import React from 'react';
import { waitForAttemptRunConfig } from '../model/attempt-run-config.js';

export function useConversationRunConfig({ sync, conversationId, scopeId, config, restore, loading, saveBlockedReason = '', validateConfig, readOnly, initialAgentId, hasSentMessage, onAgentSaved, onToast }) {
  const [ready, setReady] = React.useState('');
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const currentRef = React.useRef({});
  currentRef.current = { config, restore, onAgentSaved, hasSentMessage, onToast, saveBlockedReason };
  const committedRef = React.useRef(null);
  const baselineRef = React.useRef(null);
  const operationRef = React.useRef(null);
  const serverId = conversationId && !conversationId.startsWith('draft-') ? conversationId : '';
  const key = `${serverId}:${scopeId}`;
  const ownerRef = React.useRef(null);
  if (!ownerRef.current || ownerRef.current.key !== key || ownerRef.current.sync !== sync) {
    if (ownerRef.current) ownerRef.current.attached = false;
    ownerRef.current = { key, sync, serverId, scopeId, attached: true, loaded: false, saved: null, baseline: null, operation: null, error: '' };
  }
  const owner = ownerRef.current;
  const initialAgentRef = React.useRef(initialAgentId);
  initialAgentRef.current = initialAgentId;
  const serialized = JSON.stringify(config);
  React.useEffect(() => {
    let alive = true;
    setError(''); setReady(''); setPending(false);
    committedRef.current = null;
    baselineRef.current = null;
    operationRef.current = null;
    owner.attached = true;
    const initialConfig = { ...currentRef.current.config, ...(initialAgentRef.current ? { agent_id: initialAgentRef.current } : {}) };
    if (!sync || !serverId) {
      owner.loaded = true; owner.baseline = initialConfig;
      setReady(key);
      return () => { alive = false; owner.attached = false; };
    }
    owner.loaded = false; owner.error = '';
    sync.load(serverId).then((saved) => {
      const baseline = saved || initialConfig;
      // A Retry may still own this load after the composer has moved away.
      owner.saved = saved; owner.baseline = baseline; owner.loaded = true;
      if (!alive || ownerRef.current !== owner) return;
      committedRef.current = saved;
      baselineRef.current = baseline;
      currentRef.current.restore(baseline);
      setReady(key);
    }).catch((failure) => {
      owner.error = failure.message;
      if (alive && ownerRef.current === owner) {
        setError(failure.message);
        currentRef.current.onToast?.('error', failure.message);
      }
    });
    return () => { alive = false; owner.attached = false; };
  }, [sync, serverId, key, owner]);

  const persist = React.useCallback(async (next, switching = false) => {
    if (ownerRef.current !== owner || ready !== key) throw new Error('Conversation configuration is still loading.');
    if (operationRef.current) await operationRef.current;
    if (ownerRef.current !== owner) throw new Error('Conversation changed while configuration was saving.');
    if (currentRef.current.saveBlockedReason) throw new Error(currentRef.current.saveBlockedReason);
    const before = committedRef.current || baselineRef.current;
    const operation = (async () => {
      setPending(true); setError(''); owner.error = '';
      try {
        sync?.observe(scopeId, next);
        const saved = sync && serverId ? await sync.flush(serverId, scopeId) : next;
        owner.saved = saved;
        if (switching) owner.current = { ...owner.current, config: structuredClone(saved) };
        if (ownerRef.current !== owner || !mountedRef.current) return saved;
        committedRef.current = saved;
        if (switching) {
          // Commit is observable before React renders the restored selection.
          currentRef.current = { ...currentRef.current, config: saved };
          currentRef.current.restore(saved);
          currentRef.current.onAgentSaved?.(saved.agent_id);
          if (mountedRef.current && currentRef.current.hasSentMessage && before?.agent_id && before.agent_id !== saved.agent_id) {
            currentRef.current.onToast?.('info', 'Agent switched. Future tasks will use the new Agent.');
          }
        }
        return saved;
      } catch (failure) {
        owner.error = failure.message;
        if (ownerRef.current === owner && mountedRef.current) {
          if (before) { sync?.observe(scopeId, before); currentRef.current.restore(before); }
          setError(failure.message);
          if (mountedRef.current && !switching) currentRef.current.onToast?.('error', failure.message);
        }
        throw failure;
      } finally {
        if (ownerRef.current === owner) setPending(false);
      }
    })();
    operationRef.current = operation;
    owner.operation = operation;
    try {
      const saved = await operation;
      if (switching && ownerRef.current !== owner) throw new Error('Conversation changed while configuration was saving.');
      return saved;
    } finally {
      if (operationRef.current === operation) operationRef.current = null;
      if (owner.operation === operation) owner.operation = null;
    }
  }, [sync, scopeId, serverId, key, ready, owner]);

  // An action can outlive the render that started it. Read current readiness and
  // the current save callback after every wait, not the click's stale closure.
  const readinessRef = React.useRef(null);
  readinessRef.current = { ready, loading, error, persist };
  owner.current = { ready: ready === key, config: structuredClone(config), saveBlockedReason, validate: validateConfig, persist };

  React.useEffect(() => {
    // A missing/unavailable route is a restore/setup state, not a new selection.
    // Never observe it: another in-flight flush could otherwise persist it too.
    if (ready !== key || loading || saveBlockedReason || readOnly || operationRef.current) return;
    if (error && JSON.stringify(committedRef.current || baselineRef.current) === serialized) return;
    const next = JSON.parse(serialized);
    sync?.observe(scopeId, next);
    if (JSON.stringify(committedRef.current) === serialized) return;
    persist(next).catch(() => {}); // Error is surfaced and the saved selection is restored above.
  }, [sync, ready, key, loading, saveBlockedReason, readOnly, scopeId, serialized, persist, pending, error]);

  return {
    error, pending, ready: ready === key,
    ensureSaved: async ({ timeoutMs = 30_000, background = false, signal } = {}) => {
      if (background) return waitForAttemptRunConfig(owner, { timeoutMs, signal });
      const deadline = Date.now() + timeoutMs;
      let saving = null;
      let saveFailure = null;
      const waitForSave = (operation) => {
        saving = operation;
        // Observe settlement without blocking the ownership/timeout checks.
        operation.then(() => { saving = null; }, (failure) => { saveFailure = failure; saving = null; });
      };
      while (true) {
        if (signal?.aborted) throw new Error('Retry was stopped. Your changes have not been sent.');
        if (!mountedRef.current || ownerRef.current !== owner) throw new Error('Conversation changed while waiting for configuration. Your changes have not been sent.');
        if (saveFailure) throw saveFailure;
        const current = readinessRef.current;
        if (current.error && !operationRef.current) throw new Error(current.error);
        if (!saving && operationRef.current) {
          waitForSave(operationRef.current);
        } else if (!saving && current.ready === key && !current.loading) {
          if (currentRef.current.saveBlockedReason) throw new Error(currentRef.current.saveBlockedReason);
          if (JSON.stringify(committedRef.current) === JSON.stringify(currentRef.current.config)) return committedRef.current;
          waitForSave(current.persist(currentRef.current.config));
        }
        if (Date.now() >= deadline) throw new Error('Timed out waiting for conversation configuration. Your changes have not been sent. Please try again.');
        // Poll local state only: the in-flight load/save is not resubmitted.
        await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
      }
    },
    changeAgent: async (agentId) => {
      try {
        if (readOnly || pending || loading) throw new Error('Wait for the active task and configuration save to finish before switching Agent.');
        return await persist({ ...currentRef.current.config, agent_id: agentId }, true);
      } catch (failure) {
        if (mountedRef.current && ownerRef.current === owner) currentRef.current.onToast?.('error', failure.message);
        throw failure;
      }
    },
  };
}
