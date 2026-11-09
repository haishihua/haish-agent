/**
 * 「这一笔现在算不算在跑」的判据与排序，停止和发送都要用同一份：
 * activeTaskId 缺失时（窗口重开、事件乱序）只能从 tasksById 反推，若两处各写一份，
 * 停止就会停到一条已经收工的任务，而发送又会以为没人在跑。判据本身由调用方注入，
 * 侧栏、面板和这里读的是同一个函数。
 */
export function latestActiveTaskRecord(taskRuntimeState, { isTaskActuallyActive, taskUpdatedTimestamp }) {
  const candidates = Object.values(taskRuntimeState?.tasksById || {})
    .filter((task) => isTaskActuallyActive(task));
  candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
  return candidates[0] || null;
}

/** 这一轮所有算在跑的任务键：停止要把它们逐个标记，晚到的 SSE 才认不出这些任务。 */
export function activeTaskKeys(taskRuntimeState, isTaskActuallyActive) {
  return Object.values(taskRuntimeState?.tasksById || {})
    .filter((task) => isTaskActuallyActive(task))
    .map((task) => task?.taskId || task?.task_id || task?.id)
    .filter(Boolean);
}
