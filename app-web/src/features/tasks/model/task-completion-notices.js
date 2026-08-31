
function normalizedTerminalStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'done' || value === 'completed' || value === 'success') return 'done';
  if (value === 'failed' || value === 'error') return 'failed';
  if (value === 'cancelled' || value === 'canceled' || value === 'aborted') return 'cancelled';
  return '';
}

export function terminalTaskNoticeStatus(taskOrStatus) {
  if (typeof taskOrStatus === 'string') return normalizedTerminalStatus(taskOrStatus);
  return normalizedTerminalStatus(taskOrStatus?.status)
    || normalizedTerminalStatus(taskOrStatus?.workflowRun?.status);
}

export function taskCompletionNoticeKey(conversationId, taskId) {
  return conversationId && taskId ? `${conversationId}:${taskId}` : '';
}

export function addTaskCompletionNotice(notices, { conversationId, taskId, status }) {
  const key = taskCompletionNoticeKey(conversationId, taskId);
  const normalizedStatus = terminalTaskNoticeStatus(status);
  if (!key || !normalizedStatus || notices[key]) return notices;
  return {
    ...notices,
    [key]: {
      conversationId,
      taskId,
      status: normalizedStatus,
    },
  };
}

export function clearConversationCompletionNotices(notices, conversationId) {
  if (!conversationId) return notices;
  let changed = false;
  const next = {};
  Object.entries(notices || {}).forEach(([key, notice]) => {
    if (notice?.conversationId === conversationId) {
      changed = true;
      return;
    }
    next[key] = notice;
  });
  return changed ? next : notices;
}

export function clearTaskCompletionNotice(notices, conversationId, taskId) {
  const key = taskCompletionNoticeKey(conversationId, taskId);
  if (!key || !notices?.[key]) return notices;
  const next = { ...notices };
  delete next[key];
  return next;
}

export function conversationNoticesFromTasks(notices) {
  const byConversation = {};
  Object.values(notices || {}).forEach((notice) => {
    if (!notice?.conversationId || !notice.status) return;
    byConversation[notice.conversationId] = notice.status;
  });
  return byConversation;
}

export function taskNoticesByTaskId(notices) {
  const byTaskId = {};
  Object.values(notices || {}).forEach((notice) => {
    if (!notice?.taskId || !notice.status) return;
    byTaskId[notice.taskId] = notice.status;
  });
  return byTaskId;
}

export function loadTaskCompletionNotices(storage, storageKey) {
  if (!storage || !storageKey) return {};
  try {
    const value = JSON.parse(storage.getItem(storageKey) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function saveTaskCompletionNotices(storage, storageKey, notices) {
  if (!storage || !storageKey) return;
  try {
    storage.setItem(storageKey, JSON.stringify(notices || {}));
  } catch {
    // Ignore unavailable or full storage; the in-memory notice state still works.
  }
}
