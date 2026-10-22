import { eventDeltaText } from '../../../chat/model/chat-text.js';
import { compactStreamEvents } from '../../../chat/model/stream-events.js';
import { fetchCoalescedTaskRuntimeBatch } from '../../model/task-runtime-requests.js';
import { conversationRuntimeHasLiveTurn, createTaskRuntimeRestoreGuard } from '../../model/runtime-restore-guard.js';

// 任务执行记录的回拉：单任务、批量、以及「翻更早步骤」的恢复入口。
export function createTaskRuntimeRestoreHandlers(ctx) {
  const {
    API_BASE,
    apiFetch,
    applyContextUsage,
    buildApiHeaders,
    getRuntime,
    isTaskActuallyActive,
    latestContextUsageFromTasks,
    normalizeRuntimeEvents,
    taskDetailToRuntimeTask,
    taskRuntimeEventCacheRef,
    taskRuntimeFetchesRef,
    updateTaskRuntimeState,
  } = ctx;

  async function fetchTaskRuntimeDetail(taskId, targetConversationId = null, signal) {
    if (!taskId) return null;
    const fetchSingle = (joinBatch) => fetchCoalescedTaskRuntimeBatch(
      taskRuntimeFetchesRef.current,
      targetConversationId,
      [taskId],
      async (_ids, sharedSignal) => [await requestTaskRuntimeDetail(taskId, targetConversationId, sharedSignal)],
      signal,
      { requestKind: 'single', joinBatch },
    );
    let details;
    try {
      details = await fetchSingle(true);
    } catch (error) {
      // Backend batches are all-or-nothing: ANY missing id (or conversation)
      // returns 404 for the group. It says nothing about this joined task.
      // Confirm with a GET, bypassing other batches but still sharing GET leases.
      if (error?.status !== 404 || error.runtimeRequestKind !== 'batch') throw error;
      details = await fetchSingle(false);
    }
    const { normalizedTask } = details[0];
    if (targetConversationId && normalizedTask.conversation_id !== targetConversationId) {
      throw new Error(`task ${taskId} does not belong to conversation ${targetConversationId}`);
    }
    return details[0];
  }

  async function requestTaskRuntimeDetail(taskId, targetConversationId, signal) {
    const cached = taskRuntimeEventCacheRef.current.get(taskId) || null;
    const cursorQuery = cached?.lastEventId
      ? `&after_event_id=${encodeURIComponent(cached.lastEventId)}`
      : '';
    const response = await apiFetch(`${API_BASE}/api/tasks/${taskId}?event_view=runtime${cursorQuery}`, {
      method: 'GET',
      signal,
    }, { json: false });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload?.detail || `task restore failed: ${response.status}`);
      error.status = response.status;
      error.taskId = taskId;
      throw error;
    }
    const task = await response.json();
    if (signal.aborted) throw new DOMException('Task runtime loading was cancelled', 'AbortError');
    if (task.task_id !== taskId) throw new Error('task runtime response returned a different task');
    if (targetConversationId && task.conversation_id !== targetConversationId) {
      throw new Error(`task ${taskId} does not belong to conversation ${targetConversationId}`);
    }
    return normalizeFetchedTaskRuntime(task);
  }

  function normalizeFetchedTaskRuntime(task) {
    const taskId = task?.task_id;
    if (!taskId) throw new Error('task runtime response is missing task_id');
    const cached = taskRuntimeEventCacheRef.current.get(taskId) || null;
    const incomingEvents = normalizeRuntimeEvents(task.events);
    // 服务端可能只给最近的 N 条（游标太旧 / 缓冲被截断）：truncated 或
    // 「非增量 + next_cursor」都表示这一份不是增量，只能整份替换。若把它当追加，
    // 被丢掉的旧历史会被拼回新一页前面，时间线上会出现重复的解释或半截工具调用。
    const truncated = task?.truncated === true
      || (task?.events_delta === false && Boolean(task?.next_cursor));
    if (truncated) {
      // 不做 compact：这一页就是新的缓存本体（旧数组一律不参与），投影侧读取时
      // 会自己压平相邻增量。游标优先用服务端给的 next_cursor——它指向这一页之后，
      // 比「最后一条事件的 event_id」更权威（页里可能以被省略的事件结尾）。
      const lastEventId = task?.next_cursor
        || incomingEvents[incomingEvents.length - 1]?.event_id
        || null;
      taskRuntimeEventCacheRef.current.set(taskId, { lastEventId, events: incomingEvents });
      return { normalizedTask: { ...task, events: incomingEvents, events_delta: false }, events: incomingEvents };
    }
    const appendToCache = Boolean(task.events_delta && cached);
    const events = compactStreamEvents(
      appendToCache ? [...cached.events, ...incomingEvents] : incomingEvents,
      eventDeltaText,
    );
    const lastEventId = incomingEvents[incomingEvents.length - 1]?.event_id
      || cached?.lastEventId
      || null;
    taskRuntimeEventCacheRef.current.set(taskId, { lastEventId, events });
    return { normalizedTask: { ...task, events, events_delta: false }, events };
  }

  async function fetchTaskRuntimeBatch(targetConversationId, taskIds, signal) {
    if (!targetConversationId || !taskIds.length) return [];
    const details = await fetchCoalescedTaskRuntimeBatch(
      taskRuntimeFetchesRef.current,
      targetConversationId,
      taskIds,
      (ids, sharedSignal) => requestTaskRuntimeBatch(targetConversationId, ids, sharedSignal),
      signal,
    );
    // A joined unscoped GET still has to satisfy this batch caller's owner.
    if (details.some(({ normalizedTask }) => normalizedTask.conversation_id !== targetConversationId)) {
      throw new Error(`task batch does not belong to conversation ${targetConversationId}`);
    }
    return details;
  }

  async function requestTaskRuntimeBatch(targetConversationId, taskIds, signal) {
    const response = await apiFetch(
      `${API_BASE}/api/conversations/${encodeURIComponent(targetConversationId)}/tasks/runtime`,
      {
        method: 'POST',
        headers: buildApiHeaders(),
        signal,
        body: JSON.stringify({
          tasks: taskIds.map((taskId) => ({
            task_id: taskId,
            after_event_id: taskRuntimeEventCacheRef.current.get(taskId)?.lastEventId || null,
          })),
        }),
      },
      { json: false },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload?.detail || `task batch restore failed: ${response.status}`);
      error.status = response.status;
      error.runtimeRequestKind = 'batch';
      throw error;
    }
    const payload = await response.json();
    if (signal.aborted) throw new DOMException('Task runtime loading was cancelled', 'AbortError');
    if (!Array.isArray(payload) || payload.length !== taskIds.length) {
      throw new Error('task batch restore returned an incomplete response');
    }
    if (new Set(payload.map((task) => task.task_id)).size !== taskIds.length
      || payload.some((task) => !taskIds.includes(task.task_id) || task.conversation_id !== targetConversationId)) {
      throw new Error(`task batch does not belong to conversation ${targetConversationId}`);
    }
    const details = payload.map(normalizeFetchedTaskRuntime);
    for (const { normalizedTask } of details) {
      if (normalizedTask.conversation_id !== targetConversationId) {
        throw new Error(`task ${normalizedTask.task_id} does not belong to conversation ${targetConversationId}`);
      }
    }
    return details;
  }

  async function restoreTaskRuntimes(taskIds, {
    targetConversationId,
    isCurrentActivation,
    signal,
  }) {
    if (!targetConversationId) throw new Error('task restore requires a target conversation');
    if (typeof isCurrentActivation !== 'function') throw new Error('task restore requires an activation guard');
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !isCurrentActivation()) return [];
    const canRestore = createTaskRuntimeRestoreGuard(getRuntime, targetConversationId);
    const restorableIds = taskIds.filter(canRestore);
    if (!restorableIds.length) return [];
    const fetchedDetails = await fetchTaskRuntimeBatch(targetConversationId, restorableIds, signal);
    if (signal?.aborted || !isCurrentActivation()) return [];
    const details = fetchedDetails.filter(({ normalizedTask }) => canRestore(normalizedTask.task_id));
    if (!details.length) return [];
    updateTaskRuntimeState((state) => {
      const tasksById = { ...state.tasksById };
      let activeTaskId = state.activeTaskId;
      for (const { normalizedTask } of details) {
        const taskId = normalizedTask.task_id;
        const nextTask = taskDetailToRuntimeTask(normalizedTask, tasksById[taskId] || null);
        tasksById[taskId] = nextTask;
        if (!conversationRuntimeHasLiveTurn(getRuntime?.(targetConversationId))) {
          if (isTaskActuallyActive(nextTask)) activeTaskId = taskId;
          else if (activeTaskId === taskId) activeTaskId = null;
        }
      }
      return { ...state, activeTaskId, tasksById };
    }, targetConversationId, { taskHydration: true });
    // 表盘：恢复路径拿回来的任务快照就是服务端权威读数（值 + 采样时刻），直接喂给
    // 唯一写入入口——当前会话改表盘、后台会话只落盘，切回去时用的是同一份。
    applyContextUsage(
      latestContextUsageFromTasks(
        details.map((detail) => detail.normalizedTask),
        targetConversationId,
      ),
      { ownerConversationId: targetConversationId },
    );
    return details.map(({ normalizedTask }) => normalizedTask);
  }

  async function restoreTaskRuntime(taskId, {
    targetConversationId,
    isCurrentActivation,
    signal,
  }) {
    if (!targetConversationId) throw new Error('task restore requires a target conversation');
    if (typeof isCurrentActivation !== 'function') throw new Error('task restore requires an activation guard');
    if (!isCurrentActivation()) return;
    const canRestore = createTaskRuntimeRestoreGuard(getRuntime, targetConversationId);
    if (!canRestore(taskId)) return;
    let detail;
    try {
      detail = await fetchTaskRuntimeDetail(taskId, targetConversationId, signal);
    } catch (error) {
      if (!isCurrentActivation() || !canRestore(taskId)) return;
      throw error;
    }
    if (signal?.aborted || !detail || !isCurrentActivation() || !canRestore(taskId)) return;
    const { normalizedTask } = detail;
    if (normalizedTask.conversation_id !== targetConversationId) {
      throw new Error(`task ${taskId} does not belong to conversation ${targetConversationId}`);
    }
    updateTaskRuntimeState((state) => {
      const nextTask = taskDetailToRuntimeTask(normalizedTask, state.tasksById[taskId] || null);
      const taskOrder = state.taskOrder.includes(taskId) ? state.taskOrder : [...state.taskOrder, taskId];
      return {
        ...state,
        activeTaskId: conversationRuntimeHasLiveTurn(getRuntime?.(targetConversationId))
          ? state.activeTaskId
          : (isTaskActuallyActive(nextTask)
            ? taskId
            : (state.activeTaskId === taskId ? null : state.activeTaskId)),
        taskOrder,
        tasksById: {
          ...state.tasksById,
          [taskId]: nextTask,
        },
      };
    }, targetConversationId, { taskHydration: true });
    // 同上：任务轮询/单任务恢复也把实测快照喂给表盘（没有读数时不会覆盖现有值）。
    applyContextUsage(
      latestContextUsageFromTasks([normalizedTask], targetConversationId),
      { ownerConversationId: targetConversationId },
    );
    return normalizedTask;
  }

  async function restoreLatestTaskRuntime(taskId, { targetConversationId, isCurrentActivation, signal }) {
    if (!targetConversationId) throw new Error('latest task restore requires a target conversation');
    if (typeof isCurrentActivation !== 'function') throw new Error('latest task restore requires an activation guard');
    if (!taskId) {
      return;
    }
    return restoreTaskRuntime(taskId, {
      targetConversationId,
      isCurrentActivation,
      signal,
    });
  }

  return {
    fetchTaskRuntimeDetail,
    fetchTaskRuntimeBatch,
    restoreTaskRuntimes,
    restoreLatestTaskRuntime,
  };
}
