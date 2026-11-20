import { workflowNodeRuntimeConfig } from '../../../core/node-runtime-config.js';

export function workflowDisplayConfig(node, workflow, task, configs, readOnly, providers) {
  const own = configs[node.id] || {};
  const source = node.type === 'llm' && node.runtime_config_from
    ? workflow.nodes.find((item) => item.id === node.runtime_config_from) : null;
  const inherited = source && !own.llm_config_id && !own.provider
    ? workflowNodeRuntimeConfig(source, task, configs, readOnly, providers) : null;
  return workflowNodeRuntimeConfig(node, task, inherited
    ? { ...configs, [node.id]: { ...inherited, ...own, agent_id: undefined } } : configs, readOnly, providers);
}
