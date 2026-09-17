// Pure helpers for conversation / task running state (no React).
// Keep running detection in `isTaskLive` only: streaming writes partial answerText
// while status stays running/queued, so answer presence must NOT hide the sidebar
// spinner mid-run, and a landed terminal marker must always win.
//
// 状态串的「落地终态」别名只有这一份。tasks/model/task-runtime.js 的
// `isTerminalTaskStatus` 是 normalize 之后的窄判据（流式事件/分页用），不要和这里
// 的原始状态串清单混用，也别在组件里另抄一份。
const TERMINAL_STATUSES = new Set([
  'done', 'completed', 'success', 'failed', 'error', 'cancelled', 'canceled', 'aborted',
]);

/** 这个状态串是不是「已经收工」（大小写不敏感，容错空值）。 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase());
}

export function workflowTaskDisplayStatus(task) {
  const taskStatus = String(task?.status || '').toLowerCase();
  if (isTerminalStatus(taskStatus)) return taskStatus;
  const workflowStatus = String(task?.workflowRun?.status || '').toLowerCase();
  if (workflowStatus === 'waiting_approval' || workflowStatus === 'approval') return 'approval';
  if (workflowStatus === 'waiting_input') return 'waiting_input';
  if (isTerminalStatus(workflowStatus)) return workflowStatus;
  return taskStatus;
}

/** 已落地的完成标记：比 status 更可信，凡是「还在跑 / 还在等」的判断都要先过这一关。 */
export function taskHasFinishedMarker(task) {
  return Boolean(task?.completedAt || task?.completed_at || task?.serverFinished === true);
}

/**
 * 这份任务拷贝自己算不算「已经收工」：落地标记或终态状态串。
 *
 * 面板判「这一轮收工了没」、分页判「这份拷贝停在半路」、侧边栏判排序锚点，全都用它；
 * 不在别处另列一份状态串清单。注意它只看「有没有落地」：`running` 但没有落地标记
 * 仍然算没收工（流式写入期间不会误判）。
 */
export function isTaskSettled(task) {
  return taskHasFinishedMarker(task) || isTerminalStatus(task?.status);
}

/**
 * 任务级唯一判据：这个任务现在还活着吗（在跑 / 在排队）。
 *
 * 会话状态灯、面板的 streaming、轮询开关全部只认这一个函数——它只看两件事：
 * 原始 status 是否 running/queued，以及有没有落地终态标记。解析出来的
 * answerText / 进行中的工具卡 / workflowRun 快照都不参与，避免同一份任务在两处
 * 得出不同结论。
 */
export function isTaskLive(task) {
  const status = String(task?.status || '').toLowerCase();
  if (status !== 'running' && status !== 'queued') return false;
  return !taskHasFinishedMarker(task);
}
