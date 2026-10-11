// Accepted-turn detection controls the Agent-switch impact notice, not the picker lock.
// Runtime busy state is owned by conversation-run-state.js.
export function conversationHasSentMessage({ tasks = [], hasUserTurn = false } = {}) {
  if (hasUserTurn) return true;
  return (Array.isArray(tasks) ? tasks : []).length > 0;
}

/**
 * 会话行上的任务摘要里，服务端真正接过的那一份。
 *
 * 发送（尤其首条）时前端会先把本地 pending 那一笔乐观写进会话行，服务端接受前它
 * 就挂在那里；它没发出去，不能当成「发过消息」。pendingKey 是本机那一笔的 key
 * （`pendingTask.taskId || pendingTask.id`），命中的摘要就是它。
 */
export function sentTaskSummaries(tasks = [], pendingTask = null) {
  const list = Array.isArray(tasks) ? tasks : [];
  const pendingKey = pendingTask ? (pendingTask.taskId || pendingTask.id || null) : null;
  if (!pendingKey) return list;
  return list.filter((task) => (
    (task?.taskId || task?.task_id || task?.id || null) !== pendingKey
  ));
}
