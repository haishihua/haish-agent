/**
 * 「现在能不能发」只有这一份判据。
 *
 * 以前它散成三份：ChatComposer 里的 sendBlockedReason（提示文案）、SendControls 里
 * 两个提交按钮各自的 disabled 长表达式。加一个阻塞条件要三处同改，漏一处就会出现
 * 「按钮可点、提交立刻 return」，或者反过来「按钮灰着、回车其实能发」。
 *
 * 主发送（runtimeInput = false）和运行中纠偏（runtimeInput = true）的条件确实不同，
 * 但那是语义差异、不是 UI 差异，所以也收在这里，而不是留给调用方各写一遍：
 * - 主发送会新建一次 run config：要等配置同步完成（configReady）、Agent 必须可用
 *   （selectionDisabled）、模型路由必须可执行（modelConfigError）。
 * - 运行中纠偏复用已经在跑的那条任务，不写配置也不换 Agent，上面三条不参与；
 *   它多出来的是「上一笔纠偏还在飞」（runtimeInputPending）。
 * 组件层只保留界面差异（图标、aria 文案、tooltip 的挂载）。
 */
const AGENT_DISABLED_REASON = 'This Agent is disabled. Select an enabled Agent before starting.';

export function resolveSendGate({
  disabled = false,
  waitingForSend = false,
  goalPending = false,
  canSubmitPayload = false,
  configReady = true,
  selectionDisabled = false,
  modelConfigError = '',
  goal = null,
  runtimeInput = false,
  runtimeInputPending = false,
} = {}) {
  // 只敲了 /goal、还没写任务描述时不会真的调模型，所以这一下不校验模型路由。
  const needsModelRoute = !goal || goal.prompt;
  const blockedReason = (needsModelRoute && modelConfigError)
    || (selectionDisabled ? AGENT_DISABLED_REASON : '');
  // blockedReason 已经含「Agent 不可用」和「模型路由不可执行」两个门槛，
  // 主发送的禁用态直接复用它：文案和禁用同源，才不会一边有提示一边还能点。
  const blocked = disabled || waitingForSend || goalPending || !canSubmitPayload
    || (runtimeInput ? runtimeInputPending : (!configReady || Boolean(blockedReason)));
  return { canSend: !blocked, blockedReason };
}
