import { createNodeConfigWrites } from '../model/node-config-writes.js';
import React from 'react';
import { nodeRuntimeConfigsForWorkflow } from '../../../core/node-runtime-config.js';

export function useNodeRuntimeConfigs(storageKey, workflow, savedConfigs, taskId = '', providerOptions = []) {
  const key = `${storageKey}:nodes:${workflow?.workflow_id || workflow?.id || ''}`;
  const scope = `${key}:task:${taskId}`;
  const [state, setState] = React.useState({ key: '', configs: {} });
  const [latest, setLatest] = React.useState({ key: '', configs: {} });
  const stored = React.useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem(key) || '{}'); } catch { return {}; }
  }, [key]);
  const configs = nodeRuntimeConfigsForWorkflow(workflow, state.key === scope ? state.configs : (savedConfigs || (latest.key === key ? latest.configs : stored)), providerOptions);
  const writesRef = React.useRef(null);
  if (writesRef.current?.scope !== scope) writesRef.current = { scope, queue: createNodeConfigWrites(configs) };
  const writes = writesRef.current.queue;
  React.useEffect(() => { writes.sync(configs); }, [writes, configs]);
  const change = (nodeId, config, save) => {
    const operation = writes.change(nodeId, config, save);
    const next = nodeRuntimeConfigsForWorkflow(workflow, writes.read(), providerOptions);
    setState({ key: scope, configs: next });
    setLatest({ key, configs: next });
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Session selection remains usable. */ }
    return operation.catch(error => {
      const reverted = nodeRuntimeConfigsForWorkflow(workflow, writes.read(), providerOptions);
      setState(current => current.key === scope ? { key: scope, configs: reverted } : current);
      setLatest(current => current.key === key ? { key, configs: reverted } : current);
      try { window.localStorage.setItem(key, JSON.stringify(reverted)); } catch { /* Keep session state. */ }
      throw error;
    });
  };
  const restore = (next, workflowId, targetStorageKey = storageKey) => {
    const targetKey = workflowId ? `${targetStorageKey}:nodes:${workflowId}` : key;
    setState({ key: '', configs: {} });
    setLatest({ key: targetKey, configs: next });
    try { window.localStorage.setItem(targetKey, JSON.stringify(next)); } catch { /* Selection remains usable. */ }
  };
  return { configs, ensureSaved: async () => {
    const next = await writes.flush();
    if (writesRef.current.queue !== writes) throw new Error('Workflow changed while configuration was saving.');
    return nodeRuntimeConfigsForWorkflow(workflow, next, providerOptions);
  }, change, restore, conversationConfigs: nodeRuntimeConfigsForWorkflow(workflow, latest.key === key ? latest.configs : stored, providerOptions) };
}
