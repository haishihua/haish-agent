import React from 'react';
import { clearTaskCompletionNotice, taskCompletionNoticeKey, terminalTaskNoticeStatus } from '../../../core/task-completion-notices.js';

// Acknowledge on navigation/focus, not on receipt arrival. A task staying
// selected must not consume a delayed/background completion notification.
export function useViewedTaskCompletionNotice({ task, conversationId, visible, windowFocused, notices, setNotices }) {
  const taskId = task?.taskId || task?.task_id || task?.id;
  const status = terminalTaskNoticeStatus(task);
  const key = taskCompletionNoticeKey(conversationId, taskId);
  const notice = notices?.[key];
  const receiptRef = React.useRef(null);
  receiptRef.current = { status, notice };
  React.useEffect(() => {
    const receipt = receiptRef.current;
    if (!visible || !windowFocused || !receipt.status || !receipt.notice) return;
    setNotices((current) => clearTaskCompletionNotice(current, conversationId, taskId));
  }, [conversationId, key, setNotices, taskId, visible, windowFocused]);
}
