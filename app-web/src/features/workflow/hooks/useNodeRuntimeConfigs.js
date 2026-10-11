import React from 'react';
import { nodeRuntimeConfigsForWorkflow } from '../model/node-runtime-config.js';

export function useNodeRuntimeConfigs(storageKey, workflow, savedConfigs, taskId = '', providerOptions = []) {
  const key = `${storageKey}:nodes:${workflow?.workflow_id || workflow?.id || ''}`;
  const scope = `${key}:task:${taskId}`;
  const [state, setState] = React.useState({ key: '', configs: {} });
  const [latest, setLatest] = React.useState({ key: '', configs: {} });
  const stored = React.useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem(key) || '{}'); } catch { return {}; }
  }, [key]);
  const configs = nodeRuntimeConfigsForWorkflow(workflow, state.key === scope ? state.configs : (savedConfigs || (latest.key === key ? latest.configs : stored)), providerOptions);
  const change = (nodeId, config) => {
    const next = nodeRuntimeConfigsForWorkflow(workflow, { ...configs, [nodeId]: config }, providerOptions);
    setState({ key: scope, configs: next });
    setLatest({ key, configs: next });
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* Session selection remains usable. */ }
  };
  const restore = (next, workflowId) => {
    const targetKey = workflowId ? `${storageKey}:nodes:${workflowId}` : key;
    setLatest({ key: targetKey, configs: next });
    try { window.localStorage.setItem(targetKey, JSON.stringify(next)); } catch { /* Selection remains usable. */ }
  };
  return { configs, change, restore, conversationConfigs: nodeRuntimeConfigsForWorkflow(workflow, latest.key === key ? latest.configs : stored, providerOptions) };
}
