const FIELDS = ['provider', 'model_id', 'reasoning_effort'];

export function nodeRuntimeConfigsForWorkflow(workflow, configs = {}) {
  return Object.fromEntries((workflow?.nodes || []).filter((node) => node.type === 'agent').flatMap((node) => {
    const config = configs[node.id];
    if (!config || typeof config !== 'object') return [];
    return [[node.id, Object.fromEntries(FIELDS.filter((field) => typeof config[field] === 'string' && config[field]).map((field) => [field, config[field]]))]];
  }));
}

// Task-level route is the recorded default, not another node's execution result.
export function workflowNodeRuntimeConfig(node, task, configs = {}, readOnly = false) {
  const defaults = readOnly ? {
    provider: task?.requestedProvider && task.requestedProvider !== 'auto' ? task.requestedProvider : '',
    model_id: task?.requestedModelId || task?.providerState?.model || '',
    reasoning_effort: task?.requestedReasoningEffort || '',
  } : {};
  let value = { ...defaults };
  for (const config of [node?.runtime_config || {}, configs[node?.id] || {}]) {
    if (config.provider) value.model_id = '';
    value = { ...value, ...config };
  }
  return { ...value, ...(readOnly ? task?.workflowRun?.nodes?.[node?.id]?.runtime_config : {}) };
}

export function nodeRuntimeConfigRequest(config = {}) {
  return { nodeRuntimeConfig: Object.fromEntries(FIELDS.filter((field) => config[field]).map((field) => [field, config[field]])) };
}
