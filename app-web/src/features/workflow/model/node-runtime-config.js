import { normalizeReasoningEffort } from '../../chat/model/run-catalog.js';

const FIELDS = ['provider', 'model_id', 'reasoning_effort'];

function configFields(config, providerOptions = [], effectiveProvider = config.provider) {
  const result = Object.fromEntries(FIELDS.filter((field) => typeof config[field] === 'string' && config[field]).map((field) => [field, config[field]]));
  if ((result.provider && result.model_id) || Object.hasOwn(config, 'reasoning_effort')) {
    const provider = providerOptions.find((item) => (item.requestProvider || item.provider || item.id) === effectiveProvider);
    result.reasoning_effort = normalizeReasoningEffort(config.reasoning_effort, provider?.defaultReasoningEffort);
  }
  return result;
}

export function nodeRuntimeConfigsForWorkflow(workflow, configs = {}, providerOptions = []) {
  return Object.fromEntries((workflow?.nodes || []).filter((node) => node.type === 'agent').flatMap((node) => {
    const config = configs[node.id];
    if (!config || typeof config !== 'object') return [];
    const effective = workflowNodeRuntimeConfig(node, null, configs);
    return [[node.id, configFields(config, providerOptions, effective.provider)]];
  }));
}

// Task-level route is the recorded default, not another node's execution result.
export function workflowNodeRuntimeConfig(node, task, configs = {}, readOnly = false) {
  const defaults = readOnly ? {
    provider: task?.requestedProvider && task.requestedProvider !== 'auto' ? task.requestedProvider : '',
    model_id: task?.requestedModelId || task?.providerState?.model || '',
    reasoning_effort: task?.requestedReasoningEffort ?? null,
  } : {};
  let value = { ...defaults };
  for (const config of [node?.runtime_config || {}, configs[node?.id] || {}]) {
    if (config.provider) { value.model_id = ''; delete value.reasoning_effort; }
    value = { ...value, ...config };
  }
  return { ...value, ...(readOnly ? task?.workflowRun?.nodes?.[node?.id]?.runtime_config : {}) };
}

export function nodeRuntimeConfigRequest(config = {}, providerOptions = []) {
  return { nodeRuntimeConfig: configFields(config, providerOptions) };
}
