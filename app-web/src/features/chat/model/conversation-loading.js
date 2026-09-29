/**
 * 「整段会话还在加载」——会话详情的整块占位判据。
 *
 * 打开会话分两步：先用工作区快照把时间线搭出来（见 conversations/hooks/
 * createConversationActivationHandlers.js 的 `activateConversationShell`：快照只有标题和
 * 状态），再拉会话详情 + 任务运行记录把正文补齐。两步之间那段时间线里既没有用户原文也
 * 没有助手正文，逐行渲染出来就是「用户气泡都显示了，助手那一轮各自还空着」。
 *
 * 正文还没到是会话级的一次加载，所以整段会话交给会话面板在正中间用一颗 Loader 占位
 * （见 chat/components/ChatPanel.jsx 的 `loading`）：加载期间一行都不渲染，正文到了一次性
 * 铺开。四个条件缺一不可：
 *
 * - `shellSeeded`（调用方给）= 现在这份时间线是快照搭的。运行记录已经到位的会话永远不占位。
 * - `rowCount > 0` = 这份快照里确实有轮次要显示。空会话（服务端刚建出来还没说话的那种）没有
 *   正文可等，照旧显示空态，别拿加载动画把它盖住。
 * - `draft` = 本地草稿：服务端还没有这条会话，没有详情可以拉。
 * - `error` = 拉详情失败了。错误提示已经弹出来，不能再盖一颗会一直转下去的 Loader。
 */
export function conversationContentLoading({ shellSeeded = false, rowCount = 0, draft = false, error = '' } = {}) {
  if (!shellSeeded || draft || error) return false;
  return Number(rowCount) > 0;
}
