import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';
import { useEffect } from 'react';
import {
  loadTaskCompletionNotices,
  saveTaskCompletionNotices,
} from '../../../core/task-completion-notices.js';
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
    // Reconcile only explicit 404s; offline/server failures must retain notices.
    let cancelled = false;
    void Promise.all(Object.entries(loaded).map(async ([key, notice]) => {
      try {
        const response = await apiFetch(`${API_BASE}/api/tasks/${encodeURIComponent(notice.taskId)}?event_view=runtime&max_events=1`);
        return response.status === 404 ? [key, notice] : null;
      } catch { return null; }
    })).then((missing) => {
      if (cancelled) return;
      setNotices(current => {
        const next = { ...current };
        for (const item of missing) {
          if (item && current[item[0]] === item[1]) delete next[item[0]];
        }
        return next;
      });
    });
    window.haish?.setTaskCompletionBadgeCount?.(Object.keys(loaded).length)
      .catch(() => undefined);
    return () => { cancelled = true; };
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
