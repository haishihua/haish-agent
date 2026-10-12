import { workflowNodeRuntimeConfig } from './node-runtime-config.js';
import { migrateExecutionRoute } from '../../settings/model/execution-identity.js';

export function executionConfigError({ executionMode = 'chat', provider, legacyProvider, modelId, workflow, nodeRuntimeConfigs = {}, providerOptions = [] }) {
  function routeError(route, label) {
    if (route.llm_config_id && route.provider && route.llm_config_id !== route.provider) return `${label}: conflicting model configuration identities.`;
    route = migrateExecutionRoute(route, providerOptions);
    const selected = String(route.llm_config_id || '').trim();
    if (!selected || selected.toLowerCase() === 'auto') return `${label}: select a saved model configuration before sending.`;
    if (providerOptions.filter((item) => item.id === selected).length !== 1) return `${label}: the selected configuration is unavailable. Select a saved configuration.`;
    if (!String(route.model_id || '').trim() || String(route.model_id).trim().toLowerCase() === 'auto') return `${label}: select a concrete model before sending.`;
    return '';
  }
  if (executionMode === 'chat') return routeError({ llm_config_id: provider, provider: legacyProvider, model_id: modelId }, 'Chat');
  if (!workflow?.nodes?.length) return 'Select an available Workflow before sending.';
  const taskDefaults = { requestedProvider: provider, requestedModelId: modelId };
  if (provider || modelId) {
    const error = routeError({ llm_config_id: provider, model_id: modelId }, 'Workflow default');
    if (error) return error;
  }
  let modelNodes = 0;
  for (const node of workflow.nodes) {
    if (node.type === 'agent') {
      modelNodes += 1;
      const error = routeError(workflowNodeRuntimeConfig(node, taskDefaults, nodeRuntimeConfigs, true, providerOptions), `Node ${node.label || node.id}`);
      if (error) return error;
    } else if (node.type === 'llm') {
      modelNodes += 1;
      const ownRoute = Boolean(node.llm_config_id || node.provider);
      const error = routeError({ llm_config_id: node.llm_config_id || (ownRoute ? '' : provider), provider: node.provider,
        model_id: node.model || (ownRoute ? '' : modelId) }, `Node ${node.label || node.id}`);
      if (error) return error;
    }
  }
  return modelNodes ? '' : routeError({ llm_config_id: provider, model_id: modelId }, 'Workflow');
}
