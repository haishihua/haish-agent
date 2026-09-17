import { isTerminalTaskStatus } from './task-runtime.js';
import { isTaskSettled } from '../../conversations/model/conversation-status.js';

/**
 * Opening a conversation hydrates only the newest slice of task runtimes.
 * Older tasks keep the summary the conversation detail already carries
 * (title / answer / status), so the timeline renders immediately, and their
 * execution records are fetched in pages once the user scrolls up to them.
 * This keeps the up-front cost proportional to what is actually on screen
 * instead of replaying every task event log in the conversation.
 */

// Newest tasks hydrated as soon as a conversation opens: the slice of turns a
// tall timeline can show at once.
export const INITIAL_TASK_RUNTIME_RESTORE_COUNT = 3;
// Older tasks hydrated per upward scroll.
export const EARLIER_TASK_RUNTIME_PAGE_SIZE = 3;
// Stale copies rebuilt per pass: one round of requests at a time. The rest
// waits for the next runtime-state change instead of firing all at once.
export const STALE_TASK_RUNTIME_REBUILD_LIMIT = 3;

/**
 * Split a newest-first restore order into "hydrate now" and "hydrate later".
 * Deferred ids need no bookkeeping: a task still holding summary-only runtime
 * state is exactly the one that has not been hydrated yet.
 */
export function splitTaskRuntimeRestoreOrder(
  restoreOrder,
  { initialCount = INITIAL_TASK_RUNTIME_RESTORE_COUNT } = {},
) {
  const ordered = [...new Set((Array.isArray(restoreOrder) ? restoreOrder : []).filter(Boolean))];
  const size = Math.max(1, Math.trunc(initialCount) || 1);
  return {
    initialIds: ordered.slice(0, size),
    deferredIds: ordered.slice(size),
  };
}

/**
 * Tasks still holding summary-only state, oldest first. A live task is skipped
 * on purpose: its runtime state is built from the event stream, so there is
 * nothing to hydrate. `runtimeHydrated === false` is the marker
 * `taskSummaryToRuntimeTask` leaves behind for "summary only".
 */
export function pendingTaskRuntimeIds(taskOrder, tasksById) {
  return (Array.isArray(taskOrder) ? taskOrder : []).filter((taskId) => {
    const task = tasksById?.[taskId];
    if (!task || task.runtimeHydrated !== false) return false;
    return isTerminalTaskStatus(task.status);
  });
}

/**
 * 这一轮在别处（服务端列表拷贝）已经落地、本地这份拷贝却还停在半路：它的正文和终态
 * 都不会再更新——所有轮询路径都只盯「列表说还活着」的任务，列表一说收工就没人再
 * 回头管它。这类拷贝要丢掉游标整份重建（和「切走再切回」同一条恢复路径），否则界面上
 * 会留下一条「已收工、却没有正文」的空气泡。
 *
 * 「本地这份没收工」用的是共享判据 `isTaskSettled`：本地写着 done 就不重建（列表只是
 * 还没轮询到），本地写着不认识的中间态就重建——宁可多问一次服务端，也别拿一份半路
 * 拷贝当终态。
 *
 * `attemptedIds` 是调用方记下的「已经重建过、还没对上」的那些（比如服务端说它还在跑）：
 * 先跳过它们，再取最新的一页（`limit` 个）。顺序不能反——对不上的拷贝一直占着名额的话，
 * 更早的那些半路拷贝就永远排不到，界面上会一直留着它们的空气泡。
 */
export function staleTaskRuntimeIds(
  taskOrder,
  tasksById,
  settledIds,
  { attemptedIds = null, limit = STALE_TASK_RUNTIME_REBUILD_LIMIT } = {},
) {
  const settled = settledIds instanceof Set ? settledIds : new Set(settledIds || []);
  const attempted = attemptedIds instanceof Set ? attemptedIds : new Set(attemptedIds || []);
  const size = Math.max(1, Math.trunc(limit) || 1);
  const stale = (Array.isArray(taskOrder) ? taskOrder : []).filter((taskId) => {
    const task = tasksById?.[taskId];
    return Boolean(task) && settled.has(taskId) && !isTaskSettled(task) && !attempted.has(taskId);
  });
  return stale.slice(-size);
}

/**
 * The next page to hydrate: the oldest end of the un-hydrated tasks is loaded
 * last, so taking the tail walks upwards from the already-loaded window.
 */
export function nextEarlierTaskRuntimeIds(
  taskOrder,
  tasksById,
  { pageSize = EARLIER_TASK_RUNTIME_PAGE_SIZE } = {},
) {
  const pending = pendingTaskRuntimeIds(taskOrder, tasksById);
  const size = Math.max(1, Math.trunc(pageSize) || 1);
  return pending.slice(-size);
}
