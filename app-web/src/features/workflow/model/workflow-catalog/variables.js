// 变量目录：把上游节点的输出字段摊成模板变量可选列表。
import { typeLabelForWorkflowNode, workflowFriendlyVariableLabel } from './labels.js';
import { workflowOutputFields, workflowSchemaFields } from './nodes.js';

function workflowUpstreamNodeIds(workflow, selectedNodeId) {
  if (!selectedNodeId) return new Set();
  const incoming = new Map();
  (workflow?.edges || []).forEach((edge) => {
    if (!edge.from || !edge.to) return;
    incoming.set(edge.to, [...(incoming.get(edge.to) || []), edge.from]);
  });
  const upstream = new Set();
  const stack = [...(incoming.get(selectedNodeId) || [])];
  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || upstream.has(nodeId)) continue;
    upstream.add(nodeId);
    stack.push(...(incoming.get(nodeId) || []));
  }
  return upstream;
}

export function workflowVariableCatalog(workflow, selectedNodeId = '') {
  const inputFields = workflowSchemaFields(workflow?.input_schema).map((field) => ({
    path: field.path || `input.${field.id}`,
    label: workflowFriendlyVariableLabel({ path: field.path || `input.${field.id}` }),
    type: field.type || 'any',
    group: 'Input',
  }));
  const upstreamIds = workflowUpstreamNodeIds(workflow, selectedNodeId);
  const nodeFields = (workflow?.nodes || [])
    .filter((node) => node?.id && node.id !== selectedNodeId && upstreamIds.has(node.id) && node.type !== 'output')
    .flatMap((node) => workflowOutputFields(node).map((field) => ({
      path: `nodes.${node.id}.${field.id}`,
      label: workflowFriendlyVariableLabel({
        path: `nodes.${node.id}.${field.id}`,
        nodeLabel: node.label || typeLabelForWorkflowNode(node.type),
        fieldId: field.id,
        fieldLabel: field.label,
      }),
      type: field.type || 'any',
      group: typeLabelForWorkflowNode(node.type),
      nodeLabel: node.label || typeLabelForWorkflowNode(node.type),
      fieldId: field.id,
      description: field.description || '',
    })));
  return [...inputFields, ...nodeFields];
}
