/**
 * 侧栏那两个「新建」入口共用一份文案与选中判据：会话面板是 New Conversation，
 * 任务面板是 New Task——同一只按钮、同一套高亮规则，只是词跟着模式走。
 * 组件里只留 JSX；判据放 model 是为了能在 node 测试里直接跑（测试没有 JSX 转译）。
 */
export function newEntryLabel(mode) {
  return mode === 'bot' ? 'New Task' : 'New Conversation';
}

/**
 * 空白草稿不进侧栏列表（首条消息发出前没有列表项），只能用「新建」按钮自己的
 * 选中态说明用户正停在它上面。草稿记着自己的执行模式，切到另一边时那条按钮不该亮。
 */
export function isDraftEntrySelected(draft, conversationId, mode) {
  if (!draft?.id || !conversationId || draft.id !== conversationId) return false;
  // 没记模式的草稿按当前面板算：它只可能由当前模式这条入口开出来。
  return (draft.executionMode || mode) === mode;
}
