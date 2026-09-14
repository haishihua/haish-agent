import { isTerminalTaskStatus } from './task-runtime.js';

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
