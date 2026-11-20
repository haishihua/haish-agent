import { nodeRuntimeConfigRequest } from '../../../core/node-runtime-config.js';

/** Production entry points share the same save barrier and configuration source. */
export function createNodeConfigActions({ selection, task, workflow, providers, saveNode, rerun, deploy }) {
  return {
    change: (nodeId, config) => selection.change(nodeId, config, () => saveNode?.(nodeId, nodeRuntimeConfigRequest(config, providers).nodeRuntimeConfig)),
    async retry(nodeId) {
      const configs = await selection.ensureSaved();
      const configurable = ['agent', 'llm'].includes(workflow?.nodes?.find((node) => node.id === nodeId)?.type);
      return rerun({ ...task, nodeRuntimeConfigs: configs }, nodeId, configurable ? nodeRuntimeConfigRequest(configs[nodeId], providers) : null);
    },
    async send(text, attachment, modelId, effort, images, agentId, provider, displayText, annotations = []) {
      const configs = await selection.ensureSaved();
      return deploy(text, attachment, modelId, effort, images, agentId, provider, displayText, annotations, configs);
    },
  };
}
