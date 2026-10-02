import React from 'react';

export function useConversationRunConfig({ sync, conversationId, scopeId, config, restore, loading }) {
  const [ready, setReady] = React.useState('');
  const [error, setError] = React.useState('');
  const restoreRef = React.useRef(restore);
  restoreRef.current = restore;
  const serverId = conversationId && !conversationId.startsWith('draft-') ? conversationId : '';
  const key = `${serverId}:${scopeId}`;
  const serialized = JSON.stringify(config);
  React.useEffect(() => {
    let alive = true;
    setError('');
    setReady('');
    if (!sync) return undefined;
    if (!serverId) { setReady(key); return undefined; }
    sync.load(serverId).then((saved) => {
      if (!alive) return;
      if (saved) restoreRef.current(saved);
      setReady(key);
    }).catch((failure) => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, [sync, serverId, key]);
  React.useEffect(() => {
    if (!sync || ready !== key || loading) return;
    sync.observe(scopeId, JSON.parse(serialized));
    let alive = true;
    if (serverId) sync.flush(serverId, scopeId).then(() => { if (alive) setError(''); }).catch((failure) => { if (alive) setError(failure.message); });
    return () => { alive = false; };
  }, [sync, ready, key, loading, scopeId, serverId, serialized]);
  return error;
}
