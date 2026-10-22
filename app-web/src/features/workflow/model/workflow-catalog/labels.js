// 纯数据表：节点类型标签与变量字段标签。这里只放表，不放行为。
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

// 变量选择器里 field id → 人话。
const WORKFLOW_FIELD_LABELS = {
  status: 'status',
  success: 'success',
  summary: 'summary',
  error: 'error',
  metadata: 'metadata',
  messages: 'messages',
  artifacts: 'artifacts',
  structured: 'structured',
  citations: 'citations',
  trace: 'trace',
  text: 'text',
  json: 'json',
  usage: 'usage',
  finish_reason: 'finish_reason',
  raw: 'raw',
  matched_case: 'matched_case',
  selected_target: 'selected_target',
  decision: 'decision',
  feedback: 'feedback',
  reviewed_input: 'reviewed_input',
  attempt: 'attempt',
  value: 'value',
};

export function typeLabelForWorkflowNode(type) {
  return WORKFLOW_NODE_TYPE_LABELS[type] || type || 'Node';
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
    || WORKFLOW_FIELD_LABELS[item.fieldId]
    || item.fieldId
    || 'value',
  ).trim() || 'value';
  return `${nodeLabel}.${fieldLabel}`;
}
