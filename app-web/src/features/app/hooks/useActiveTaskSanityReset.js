import { useEffect } from 'react';
import { isTaskActuallyActive } from '../../conversations/model/workspace-state.js';

/**
 * 运行态自检：`activeTaskId` 指着的那条任务其实已经不活跃了（服务端落地 / 别处清掉了），
 * 本地 busy、fetchController 却还挂着——把这份残留的「在跑」清掉。
 * 只对当前显示的那份运行态生效（taskRuntimeState 是显示态的镜像）。
 * 注意方向：另一条「busy 但没有任何活跃任务」的自检仍留在 AppShell。
 */
export function useActiveTaskSanityReset({
  busy,
  currentConversationActive,
  runtimeCurrentTask,
  activeTaskId,
  runtimeApiRef,
}) {
  useEffect(() => {
    if (!activeTaskId || !runtimeCurrentTask) return;
    if (isTaskActuallyActive(runtimeCurrentTask)) return;
    if (!busy && !currentConversationActive) return;
    runtimeApiRef.current.setRuntimeBusy?.(false);
    runtimeApiRef.current.setRuntimeActiveTaskId?.(null);
    runtimeApiRef.current.setRuntimeFetchController?.(null);
    runtimeApiRef.current.updateTaskRuntimeState?.((state) => (
      state.activeTaskId === activeTaskId
        ? { ...state, activeTaskId: null }
        : state
    ));
  }, [busy, currentConversationActive, runtimeCurrentTask, activeTaskId, runtimeApiRef]);
}
