// 节点卡片的呈现派生：类型色、标题/无障碍文案、卡片类名。
// 全是「入参 → 值」的纯函数（不碰 React、不碰 DOM），放在 model 里 node --test 能直接锁行为。

// 类型色只有一份（app-shell.css 里 .workflow-canvas 上的 --workflow-accent-*）：节点的描边/图标色
// 与连线的渐变都从这里取色，JS 里不再抄一份十六进制颜色。
const WORKFLOW_ACCENT_VARS = {
  start: 'var(--workflow-accent-start)',
  agent: 'var(--workflow-accent-agent)',
  llm: 'var(--workflow-accent-llm)',
  tool: 'var(--workflow-accent-tool)',
  condition: 'var(--workflow-accent-condition)',
  human_approval: 'var(--workflow-accent-human_approval)',
  loop: 'var(--workflow-accent-loop)',
  output: 'var(--workflow-accent-output)',
};

export function workflowNodeAccent(nodeType) {
  return WORKFLOW_ACCENT_VARS[nodeType] || WORKFLOW_ACCENT_VARS.agent;
}

// 卡片上的文案：标题按「运行态覆盖名 → 定义里的 label → 类型名」退让（运行页只覆盖名字，不重建卡片）；
// 带运行状态时后面接状态词——有本地化就用本地化的，没有就用原始状态词。title 与 aria-label 共用它。
export function workflowNodeCardText(data) {
  const node = data?.workflowNode || {};
  const nodeType = node.type || 'agent';
  const runtimeStatus = String(data?.runtimeStatus || '');
  const nodeTitle = data?.runtimeAgentName || node.label || nodeType;
  return {
    nodeType,
    runtimeStatus,
    nodeTitle,
    nodeLabel: `${nodeTitle}${runtimeStatus ? ` · ${data.runtimeStatusLabel || runtimeStatus}` : ''}`,
  };
}

// 卡片类名是 CSS 的契约（配置页与运行页共用同一套选择器），拼法只写这一份：类型名恒在，
// 其余按状态追加。串在中间的单个空格就是选择器分隔符，挪一位就等于换了皮肤。
export function workflowNodeCardClassName({
  nodeType, selected, data, runtimeStatus, runtimeDetailAvailable,
} = {}) {
  return `workflow-flow-node ${nodeType} ${selected ? 'active' : ''}${data?.dropPreview ? ' is-drop-preview' : ''}${runtimeStatus ? ` is-runtime status-${runtimeStatus}` : ''}${runtimeDetailAvailable ? ' has-runtime-detail' : ''}${data?.reconnectType ? ' is-reconnecting' : ''}`;
}
