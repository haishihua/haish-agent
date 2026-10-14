import { normalizeReasoningEffort } from '../../chat/model/run-catalog.js';
import { migrateExecutionRoute } from '../../settings/model/execution-identity.js';

const FIELDS = ['llm_config_id', 'provider', 'model_id', 'reasoning_effort'];

function configFields(config, providerOptions = [], effectiveId = config.llm_config_id) {
  config = migrateExecutionRoute(config, providerOptions);
  const result = Object.fromEntries(FIELDS.filter((field) => typeof config[field] === 'string' && config[field]).map((field) => [field, config[field]]));
  if ((result.llm_config_id && result.model_id) || Object.hasOwn(config, 'reasoning_effort')) {
    const provider = providerOptions.find((item) => item.id === (effectiveId || config.llm_config_id));
    result.reasoning_effort = normalizeReasoningEffort(config.reasoning_effort, provider?.defaultReasoningEffort);
  }
  return result;
}

export function nodeRuntimeConfigsForWorkflow(workflow, configs = {}, providerOptions = []) {
  return Object.fromEntries((workflow?.nodes || []).filter((node) => node.type === 'agent').flatMap((node) => {
    const config = configs[node.id];
    if (!config || typeof config !== 'object') return [];
    const effective = workflowNodeRuntimeConfig(node, null, configs, false, providerOptions);
    return [[node.id, configFields(config, providerOptions, effective.llm_config_id)]];
  }));
}

export function workflowNodeRuntimeConfig(node, task, configs = {}, readOnly = false, providerOptions = []) {
  const defaults = readOnly ? {
    llm_config_id: task?.requestedProvider || '',
    model_id: task?.requestedModelId || task?.providerState?.model || '',
    reasoning_effort: task?.requestedReasoningEffort ?? null,
  } : {};
  let value = { ...defaults };
  // An executed route replaces the requested identity before legacy migration;
  // otherwise a requested llm_config_id would mask an actual provider snapshot.
  for (const config of [node?.runtime_config || {}, configs[node?.id] || {}, ...(readOnly ? [task?.workflowRun?.nodes?.[node?.id]?.runtime_config || {}] : [])]) {
    if (config.llm_config_id || config.provider) {
      value.model_id = ''; delete value.reasoning_effort;
      delete value.llm_config_id; delete value.provider;
    }
    value = { ...value, ...config };
  }
  return migrateExecutionRoute(value, providerOptions);
}

export function nodeRuntimeConfigRequest(config = {}, providerOptions = []) {
  return { nodeRuntimeConfig: configFields(config, providerOptions) };
}
