// 任务控制与清理：排队指令、取消任务、删除会话前先把这一轮停下来。
export function createTaskControlHandlers(ctx) {
  const {
    API_BASE,
    apiFetch,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    getRuntime,
    isTaskActuallyActive,
    mutateRuntime,
    runtimesRef,
    taskUpdatedTimestamp,
    updateTaskRuntimeState,
    userCancelledTaskIdsRef,
  } = ctx;

  async function cancelActiveTask(taskId) {
    return apiFetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  }

  async function queueTaskInput(taskId, message, imageAttachments = [], displayMessage = message, ownerConversationId) {
    if (!ownerConversationId) throw new Error('task input requires a conversation owner');
    const images = Array.isArray(imageAttachments) ? imageAttachments : [];
    const response = await apiFetch(`${API_BASE}/api/tasks/${taskId}/inputs`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        message,
        image_attachments: images.map((image) => ({
          image_id: image.image_id,
          path: image.path,
          mime: image.mime || null,
        })),
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || `Failed to queue instruction (${response.status})`);
    }
    const payload = await response.json();
    // The SSE stream only emits `task_input_applied` once the agent loop picks
    // the steering message up; `task_input_queued` is persisted server-side but
    // never streamed back. Append it to the running task's event log right away
    // so the user's instruction appears in the chat as soon as it enters the
    // queue, while the trace above keeps showing the in-flight tool calls.
    // The later `task_input_applied` stream event then flips it to "applied".
    const queuedEvent = payload?.event;
    if (queuedEvent?.conversation_id && queuedEvent.conversation_id !== ownerConversationId) {
      throw new Error('task input response returned a different conversation owner');
    }
    const queuedPayload = queuedEvent?.payload || {};
    if (queuedEvent && taskId) {
      const queuedMessage = String(displayMessage || queuedPayload.message || message || '').trim();
      const queuedInputId = queuedPayload.input_id || payload?.input_id || null;
      const queuedImages = images.length > 0 ? images : (queuedPayload.image_attachments || []);
      updateTaskRuntimeState((state) => {
        const task = state?.tasksById?.[taskId];
        if (!task) return state;
        const eventLog = Array.isArray(task.eventLog) ? task.eventLog : [];
        // Polling or the applied SSE can beat the POST response. Input identity,
        // not message text, decides whether the optimistic echo already exists.
        if (eventLog.some((event) => (
          (queuedEvent.event_id && (event.eventId || event.event_id) === queuedEvent.event_id)
          || (queuedInputId && (
            (event.type === 'task_input_queued' && (event.inputId || event.input_id) === queuedInputId)
            || (event.type === 'task_input_applied' && (event.inputs || []).some(
              (input) => (input.inputId || input.input_id) === queuedInputId,
            ))
          ))
        ))) return state;
        return {
          ...state,
          tasksById: {
            ...state.tasksById,
            [taskId]: {
              ...task,
              updatedAt: Date.now(),
              eventLog: [
                ...eventLog,
                {
                  type: 'task_input_queued',
                  eventId: queuedEvent.event_id || null,
                  timestamp: queuedEvent.created_at || new Date().toISOString(),
                  inputId: queuedInputId,
                  message: queuedMessage,
                  imageAttachments: queuedImages,
                  status: 'pending',
                  taskId,
                  conversationId: ownerConversationId,
                },
              ],
            },
          },
        };
      }, ownerConversationId);
    }
    return payload;
  }

  async function cancelActiveConversationTask(nextConversationId) {
    if (!nextConversationId) return null;
    return apiFetch(`${API_BASE}/api/conversations/${nextConversationId}/tasks/cancel`, {
      method: 'POST',
    });
  }

  function activeTaskIdFromConversationSnapshot(conversation) {
    const candidates = (conversation?.tasks || []).filter((task) => isTaskActuallyActive(task));
    candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
    const task = candidates[0];
    return task?.taskId || task?.task_id || task?.id || null;
  }

  async function stopConversationRuntimeBeforeDelete(nextConversationId, conversationSnapshot = null) {
    if (!nextConversationId) return;
    const targetRuntime = getRuntime(nextConversationId);
    targetRuntime?.pendingRetry?.controller.abort();
    const taskState = targetRuntime?.taskRuntimeState || null;
    const taskId = targetRuntime?.activeTaskId
      || taskState?.activeTaskId
      || activeTaskIdFromConversationSnapshot(conversationSnapshot);
    const runId = targetRuntime?.activeRunId || null;
    if (runId && targetRuntime) targetRuntime.cancelledRunIds.add(runId);
    if (taskId) {
      userCancelledTaskIdsRef.current.add(taskId);
      chatFinalizedTaskIdsRef.current.add(taskId);
    }
    targetRuntime?.fetchController?.abort?.();
    if (targetRuntime) {
      mutateRuntime(nextConversationId, (rt) => {
        rt.taskRuntimeState = {
          ...rt.taskRuntimeState,
          activeTaskId: null,
          pendingTask: null,
        };
        rt.activeTaskId = null;
        rt.activeRunId = null;
        rt.fetchController = null;
        rt.busy = false;
      });
    }
    try {
      if (taskId) {
        await cancelActiveTask(taskId);
      } else {
        await cancelActiveConversationTask(nextConversationId);
      }
    } catch (error) {
      console.warn('conversation cleanup before delete skipped:', error);
    }
    runtimesRef.current.delete(nextConversationId);
  }

  return {
    cancelActiveTask,
    queueTaskInput,
    cancelActiveConversationTask,
    stopConversationRuntimeBeforeDelete,
  };
}
