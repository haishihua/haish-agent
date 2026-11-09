/**
 * 「这个会话 id 还是本地草稿」只在这里判，上传链路不要再各写一遍前缀比较。
 *
 * 注意它和 conversations 领域的 isDraftConversationId 不是同一个问题，两者不能互换：
 * - isDraftConversationId 比的是「id 是不是当前那条草稿会话记录」（身份），而那条记录
 *   在 materialize 之后 id 已经变成服务端真会话 id（见 draft-materialize.js），此时
 *   它对真会话返回 true —— 拿它当「本地 id」用会直接把已经落地的会话的上传挡掉。
 * - 前缀认的是「这条 id 从来只是本地空壳」。旧草稿的 id 在切走、草稿记录清空之后
 *   仍会留在 conversationIdRef 里，那时只有形态认得出它，放过去就会往一个不存在的
 *   会话上传。
 * 所以「本地草稿」只能用形态判断，并且形态一旦变化，改这一处就够。
 */
export function isLocalDraftConversationId(conversationIdValue) {
  if (!conversationIdValue) return false;
  return String(conversationIdValue).startsWith('draft-');
}
