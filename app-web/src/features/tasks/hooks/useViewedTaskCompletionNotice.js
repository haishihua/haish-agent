import React from 'react';
import { clearTaskCompletionNotice, taskCompletionNoticeKey, terminalTaskNoticeStatus } from '../model/task-completion-notices.js';

// Selecting a task is not the only acknowledgement point: a receipt can arrive
// later, or the window can regain focus while the same task stays selected.
export function useViewedTaskCompletionNotice({ task, conversationId, visible, windowFocused, notices, setNotices }) {
  const taskId = task?.taskId || task?.task_id || task?.id;
  const status = terminalTaskNoticeStatus(task);
  const key = taskCompletionNoticeKey(conversationId, taskId);
  const notice = notices?.[key];
  React.useEffect(() => {
    if (!visible || !windowFocused || !status || !notice) return;
    setNotices((current) => clearTaskCompletionNotice(current, conversationId, taskId));
  }, [conversationId, key, notice, setNotices, status, taskId, visible, windowFocused]);
}
