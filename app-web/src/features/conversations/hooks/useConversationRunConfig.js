import React from 'react';

export function useConversationRunConfig({ sync, conversationId, scopeId, config, restore, loading, readOnly, initialAgentId, hasSentMessage, onAgentSaved, onToast }) {
  const [ready, setReady] = React.useState('');
  const [error, setError] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const currentRef = React.useRef({});
  currentRef.current = { config, restore, onAgentSaved, hasSentMessage, onToast };
  const committedRef = React.useRef(null);
  const baselineRef = React.useRef(null);
  const operationRef = React.useRef(null);
  const serverId = conversationId && !conversationId.startsWith('draft-') ? conversationId : '';
  const key = `${serverId}:${scopeId}`;
  const ownerRef = React.useRef({ key });
  if (ownerRef.current.key !== key) ownerRef.current = { key };
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
    if (!sync) { setReady(key); return undefined; }
    if (!serverId) { setReady(key); return undefined; }
    sync.load(serverId).then((saved) => {
      if (!alive) return;
      const baseline = saved || { ...currentRef.current.config, ...(initialAgentRef.current ? { agent_id: initialAgentRef.current } : {}) };
      committedRef.current = saved;
      baselineRef.current = baseline;
      currentRef.current.restore(baseline);
      setReady(key);
    }).catch((failure) => {
      if (alive) {
        setError(failure.message);
        currentRef.current.onToast?.('error', failure.message);
      }
    });
    return () => { alive = false; };
  }, [sync, serverId, key]);

  const persist = React.useCallback(async (next, switching = false) => {
    if (ownerRef.current !== owner || ready !== key) throw new Error('Conversation configuration is still loading.');
    if (operationRef.current) await operationRef.current;
    if (ownerRef.current !== owner) throw new Error('Conversation changed while configuration was saving.');
    const before = committedRef.current || baselineRef.current;
    const operation = (async () => {
      setPending(true); setError('');
      try {
        sync?.observe(scopeId, next);
        const saved = sync && serverId ? await sync.flush(serverId, scopeId) : next;
        if (ownerRef.current !== owner) throw new Error('Conversation changed while configuration was saving.');
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
        if (ownerRef.current === owner) {
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
    try { return await operation; } finally { if (operationRef.current === operation) operationRef.current = null; }
  }, [sync, scopeId, serverId, key, ready, owner]);

  React.useEffect(() => {
    if (ready !== key || loading || readOnly || operationRef.current) return;
    if (error && JSON.stringify(committedRef.current || baselineRef.current) === serialized) return;
    const next = JSON.parse(serialized);
    sync?.observe(scopeId, next);
    if (JSON.stringify(committedRef.current) === serialized) return;
    persist(next).catch(() => {}); // Error is surfaced and the saved selection is restored above.
  }, [sync, ready, key, loading, readOnly, scopeId, serialized, persist, pending, error]);

  return {
    error, pending, ready: ready === key,
    ensureSaved: async () => {
      if (operationRef.current) await operationRef.current;
      if (ownerRef.current !== owner || ready !== key || loading) throw new Error('Conversation configuration is not ready.');
      if (error) throw new Error(error);
      if (JSON.stringify(committedRef.current) === JSON.stringify(currentRef.current.config)) return committedRef.current;
      return persist(currentRef.current.config);
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
