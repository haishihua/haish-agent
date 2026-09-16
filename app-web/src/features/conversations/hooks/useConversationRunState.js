import React from 'react';
import { approvalStore } from '../../approvals/model/approval-store.js';
import {
  resolveConversationRunState,
  resolveConversationWaitState,
} from '../model/conversation-run-state.js';

const NO_TASKS = [];

/**
 * 订阅后端推来的「等人」实时快照（未回答提问 / 未决审批）。
 * 订阅时 store 会立刻推一次当前快照，所以挂载即得到正确状态，重载后同样由快照恢复。
 */
function usePendingSnapshots(enabled) {
  const [snapshot, setSnapshot] = React.useState(() => ({ inputs: [], approvals: [] }));
  React.useEffect(() => {
    if (!enabled) return undefined;
    let inputs = [];
    let approvals = [];
    const publish = () => setSnapshot((current) => (
      current.inputs === inputs && current.approvals === approvals
        ? current
        : { inputs, approvals }
    ));
    const unsubscribeInputs = approvalStore.subscribeInputs((next) => {
      inputs = next;
      publish();
    });
    const unsubscribeApprovals = approvalStore.subscribe((next) => {
      approvals = next;
      publish();
    });
    return () => {
      unsubscribeInputs();
      unsubscribeApprovals();
    };
  }, [enabled]);
  return snapshot;
}

/**
 * 会话运行状态（唯一判据，见 model/conversation-run-state.js）：
 * `''` 不可能出现；`idle` = 熄灯、`running` = 蓝灯、`waiting_input` / `approval` = 黄灯。
 *
 * 任务列表由调用方传入——侧边栏传会话自己的任务，面板传「服务端列表 + 本地运行时」
 * 合并后的任务，两边读同一个判据。不新增任何请求。
 */
export function useConversationRunState({ conversationId, tasks }) {
  const target = String(conversationId || '');
  const taskList = Array.isArray(tasks) ? tasks : NO_TASKS;
  const snapshot = usePendingSnapshots(Boolean(target));
  return React.useMemo(() => resolveConversationRunState({
    conversationId: target,
    tasks: taskList,
    pendingInputs: snapshot.inputs,
    pendingApprovals: snapshot.approvals,
  }), [target, taskList, snapshot]);
}

/**
 * 只关心「是不是在等人」时的入口（面板活动文案用）。任务列表未知，因此快照命中即算等人。
 */
export function useConversationWaitState(conversationId) {
  const target = String(conversationId || '');
  const snapshot = usePendingSnapshots(Boolean(target));
  return React.useMemo(() => resolveConversationWaitState({
    conversationId: target,
    pendingInputs: snapshot.inputs,
    pendingApprovals: snapshot.approvals,
  }), [target, snapshot]);
}
