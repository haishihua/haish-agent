// 「这个会话的 agent 还能不能改」只有这一处判据。
//
// 产品规则和后端规则是同一条：首个 chat turn 被接受时后端才写 agent 绑定
// （haish-agent-core 的 `set_agent_profile`），之后换 agent 一定 400。所以只要
// 这个会话发过消息，选择器就该锁上。
//
// 传文件 / 解析文档不算发消息：那时后端只把会话落成实体并追加一条导入记录，
// 一个字都还没写，用户必须还能换 agent——锁早了就是把「传个文件」当成「已经开聊」。
// 同理，还没被服务端接下的那一笔（本地 pending：排队 / 失败 / 取消）也不算：
// 它只在本机，服务端没绑任何东西。所以判据的输入由调用方按这条线裁好——见
// sentTaskSummaries（会话行上的乐观写入）与 AppShell 里 unaccepted 的 pending 行。
//
// 判据只用两样事实：
//   1. 会话自己的任务记录（服务端列表或本地运行时都算）：有任务就是发过；
//   2. 时间线上已经有这一轮的用户消息行：按发送按钮那一刻就锁，不必等服务端回话。
// 不读 conversation.agentId：发送时乐观写进去的值还没被服务端确认，不能当绑定用
// （发送失败、会话已被删掉时它会留下一个假的「已绑定」）。
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
