// 纯数据表：节点类型图标与标签、变量字段标签。这里只放表，不放行为。
// 画布节点和运行详情面板都从这里取，两份表会立刻漂移成「方块 vs 勾圈」。
const WORKFLOW_NODE_ICONS = {
  start: 'play',
  agent: 'workflow-agent',
  llm: 'workflow-llm',
  tool: 'workflow-tool',
  condition: 'workflow-condition',
  human_approval: 'workflow-approval',
  loop: 'workflow-loop',
  output: 'workflow-output',
};

const WORKFLOW_NODE_TYPE_LABELS = {
  start: 'Start',
  output: 'End',
  agent: 'Agent',
  llm: 'LLM',
  tool: 'Tool',
  condition: 'Condition',
  human_approval: 'Approval',
  loop: 'Loop',
};


export function typeLabelForWorkflowNode(type) {
  return WORKFLOW_NODE_TYPE_LABELS[type] || type || 'Node';
}

export function workflowNodeIcon(type) {
  return WORKFLOW_NODE_ICONS[type] || 'box';
}

export function workflowFriendlyVariableLabel(item) {
  if (!item) return 'Value';
  if (item.path === 'input.message') return 'User message';
  if (item.path === 'input.attachments') return 'Files';
  if (item.path === 'input.image_attachments') return 'Images';
  if (item.path === 'input.conversation_id') return 'Conversation';
  if (item.path === 'input.workspace') return 'Workspace';
  const nodeLabel = String(item.nodeLabel || item.group || 'Node').trim() || 'Node';
  const fieldLabel = String(
    item.fieldLabel
    || item.fieldId
    || 'value',
  ).trim() || 'value';
  return `${nodeLabel}.${fieldLabel}`;
}
