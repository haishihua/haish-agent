import { useEffect } from 'react';
import {
  loadTaskCompletionNotices,
  saveTaskCompletionNotices,
} from '../../tasks/model/task-completion-notices.js';
import { buildOwnerScopedStorageKey } from '../../../shared/api/client.js';

const TASK_COMPLETION_NOTICES_STORAGE_KEY = 'haish.task-completion-notices.v1';

/**
 * 任务完成通知的落盘：按 owner 分开存，换 owner 时重读并把角标数量同步给主进程。
 * 只在「当前 owner 就是这份通知的 owner」时回写，避免把上一个 owner 的通知写到新 owner 名下。
 */
export function useTaskCompletionNoticeStorage({
  ownerId,
  notices,
  noticesOwner,
  setNotices,
  setNoticesOwner,
  reportedTaskIdsRef,
}) {
  useEffect(() => {
    if (!ownerId) return;
    reportedTaskIdsRef.current.clear();
    const loaded = loadTaskCompletionNotices(
      window.localStorage,
      buildOwnerScopedStorageKey(TASK_COMPLETION_NOTICES_STORAGE_KEY, ownerId),
    );
    setNotices(loaded);
    setNoticesOwner(ownerId);
    window.haish?.setTaskCompletionBadgeCount?.(Object.keys(loaded).length)
      .catch(() => undefined);
  }, [ownerId, reportedTaskIdsRef, setNotices, setNoticesOwner]);

  useEffect(() => {
    const storageKey = buildOwnerScopedStorageKey(TASK_COMPLETION_NOTICES_STORAGE_KEY, ownerId);
    if (!storageKey || noticesOwner !== ownerId) return;
    saveTaskCompletionNotices(
      window.localStorage,
      storageKey,
      notices,
    );
    window.haish?.setTaskCompletionBadgeCount?.(Object.keys(notices).length)
      .catch(() => undefined);
  }, [ownerId, notices, noticesOwner]);
}
