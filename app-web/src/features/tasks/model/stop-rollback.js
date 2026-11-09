/**
 * 停止之后要还给输入框什么：只有「这一轮还没上时间线」时才回填。
 * 已经落地的任务留在时间线上，重发走那一行的编辑，所以 restoreText 只是候选文案。
 * hasLocalBookkeeping 只决定这一窗要不要回滚自己记的东西，绝不决定停止请求本身发不发。
 */
export function resolveStopRollback({
  activeTask,
  pendingTask,
  pendingRun,
  queuedRequest,
  taskId,
  runtimeBusy,
  controllerToAbort,
  hadQueuedDeploy,
}) {
  const restoreText = String(
    activeTask?.title
    || pendingTask?.title
    || queuedRequest?.text
    || ''
  ).trim();
  const hasLocalBookkeeping = runtimeBusy
    || taskId
    || pendingTask
    || controllerToAbort
    || hadQueuedDeploy;
  const turnStaysVisible = Boolean(taskId)
    || Boolean(pendingTask && pendingRun && !pendingRun.taskId);
  return { restoreText, hasLocalBookkeeping, turnStaysVisible };
}

/**
 * 停止后的运行时快照一次写全：晚到的事件看到半截状态就会把这一轮重新物化。
 * abortRequested 要留到下一次 executeQuest 起跑才清。
 */
export function resetRuntimeAfterStop(runtime, runId) {
  runtime.abortRequested = true;
  if (runId) runtime.cancelledRunIds.add(runId);
  runtime.activeTaskId = null;
  runtime.activeRunId = null;
  runtime.fetchController = null;
  runtime.answerBuffer = '';
  runtime.busy = false;
}
