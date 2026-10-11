import { workflowNodeRuntimeConfig } from './node-runtime-config.js';

export function executionConfigError({ executionMode = 'chat', provider, modelId, workflow, nodeRuntimeConfigs = {}, providerOptions = [] }) {
  function routeError(route, label) {
    const selected = String(route.provider || '').trim();
    if (!selected || selected.toLowerCase() === 'auto') return `${label}: select a configured model provider before sending.`;
    if (!providerOptions.some((item) => (item.requestProvider || item.provider || item.id) === selected)) return `${label}: the selected provider is unavailable. Select a configured provider.`;
    if (!String(route.model_id || '').trim() || String(route.model_id).trim().toLowerCase() === 'auto') return `${label}: select a concrete model before sending.`;
    return '';
  }
  if (executionMode === 'chat') return routeError({ provider, model_id: modelId }, 'Chat');
  if (!workflow?.nodes?.length) return 'Select an available Workflow before sending.';
  const taskDefaults = { requestedProvider: provider, requestedModelId: modelId };
  if (provider || modelId) {
    const error = routeError({ provider, model_id: modelId }, 'Workflow default');
    if (error) return error;
  }
  let modelNodes = 0;
  for (const node of workflow.nodes) {
    if (node.type === 'agent') {
      modelNodes += 1;
      const error = routeError(workflowNodeRuntimeConfig(node, taskDefaults, nodeRuntimeConfigs, true), `Node ${node.label || node.id}`);
      if (error) return error;
    } else if (node.type === 'llm') {
      modelNodes += 1;
      const error = routeError({ provider: node.provider && node.provider !== 'auto' ? node.provider : provider, model_id: node.model || modelId }, `Node ${node.label || node.id}`);
      if (error) return error;
    }
  }
  return modelNodes ? '' : routeError({ provider, model_id: modelId }, 'Workflow');
}
