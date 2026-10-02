const FIELDS = ['provider', 'model_id', 'reasoning_effort'];

export function nodeRuntimeConfigsForWorkflow(workflow, configs = {}) {
  return Object.fromEntries((workflow?.nodes || []).filter((node) => node.type === 'agent').flatMap((node) => {
    const config = configs[node.id];
    if (!config || typeof config !== 'object') return [];
    return [[node.id, Object.fromEntries(FIELDS.filter((field) => typeof config[field] === 'string' && config[field]).map((field) => [field, config[field]]))]];
  }));
}

export function nodeRuntimeConfigRequest(config = {}) {
  return { nodeRuntimeConfig: Object.fromEntries(FIELDS.filter((field) => config[field]).map((field) => [field, config[field]])) };
}
