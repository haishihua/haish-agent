// Pure helpers for conversation / task running state (no React).
// Keep running detection in `isTaskLive` only: streaming writes partial answerText
// while status stays running/queued, so answer presence must NOT hide the sidebar
// spinner mid-run, and a landed terminal marker must always win.

export function workflowTaskDisplayStatus(task) {
  const taskStatus = String(task?.status || '').toLowerCase();
  if (['done', 'completed', 'success', 'failed', 'error', 'cancelled', 'canceled', 'aborted'].includes(taskStatus)) {
    return taskStatus;
  }
  const workflowStatus = String(task?.workflowRun?.status || '').toLowerCase();
  if (workflowStatus === 'waiting_approval' || workflowStatus === 'approval') return 'approval';
  if (workflowStatus === 'waiting_input') return 'waiting_input';
  if (['done', 'completed', 'success', 'failed', 'error', 'cancelled', 'canceled', 'aborted'].includes(workflowStatus)) {
    return workflowStatus;
  }
  return taskStatus;
}

/** 已落地的完成标记：比 status 更可信，凡是「还在跑 / 还在等」的判断都要先过这一关。 */
export function taskHasFinishedMarker(task) {
  return Boolean(task?.completedAt || task?.completed_at || task?.serverFinished === true);
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
