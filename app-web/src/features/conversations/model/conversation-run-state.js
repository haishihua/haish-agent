// 「这个会话还在跑吗」只有这一处判据。侧边栏的状态灯和消息面板的 streaming / 活动文案
// 都读它，两个地方不可能再各说各话。
//
// 判据只用两样事实：
//   1. 任务自身状态（`isTaskLive`）：running / queued 且没有落地终态标记 => 在跑；
//   2. 后端实时快照（approvalStore 推来的未回答提问 / 未决审批）=> 在等人（黄灯）。
//
// 除此之外没有任何「辅助来源」：
//   - 不看任务快照里的 workflowRun.status：它是轮询回来的旧值，用户答完提问之后还会停在
//     waiting_input，行会一直亮黄灯、恢复后回不到蓝灯；
//   - 不看在飞的工具卡（ask_user 还在时间线上）：那是渲染出来的东西，不是状态。
// 任务一旦落地终态（done/failed/cancelled 或 completedAt / serverFinished）就不再亮灯，
// 结论在任务自己的那份拷贝里就能算出来，不需要额外兜底。
//
// 等人快照是唯一例外：它按 conversation_id / task_id 匹配，命中且该任务没有收工 =>
// 在等人。任务未知（列表里还没有这份任务）时信快照——后端说 agent 正等人，那就是在等人。

import { isTaskLive, isTaskSettled } from './conversation-status.js';

export const RUN_STATE_IDLE = 'idle';
export const RUN_STATE_RUNNING = 'running';
export const RUN_STATE_WAITING_INPUT = 'waiting_input';
export const RUN_STATE_APPROVAL = 'approval';

const EMPTY_RESULT = Object.freeze({ state: RUN_STATE_IDLE, taskId: '' });

export function taskIdOf(task) {
  return String(task?.taskId || task?.task_id || task?.id || '');
}

/** 这个状态是不是「在等用户动手」（黄灯）。 */
export function isRunStateWaiting(state) {
  return state === RUN_STATE_WAITING_INPUT || state === RUN_STATE_APPROVAL;
}

/** 灯要亮着吗（在跑或在等人都算「还没结束」）。 */
export function isRunStateLive(state) {
  return state === RUN_STATE_RUNNING || isRunStateWaiting(state);
}

/**
 * 全部任务拷贝里已经落地的 taskId 集合。
 * 面板渲染同一轮对话时会同时拿到运行时拷贝和服务端列表拷贝，任何一份说「收工了」，
 * 这一轮就算收工——否则过期的本地拷贝能让气泡一直转下去。
 * 落地判据就是 `isTaskSettled` 这一份，不在这里再列一遍状态串。
 */
export function settledTaskIds(taskCopies) {
  const settled = new Set();
  for (const task of Array.isArray(taskCopies) ? taskCopies : []) {
    const taskId = taskIdOf(task);
    if (!taskId) continue;
    if (isTaskSettled(task)) settled.add(taskId);
  }
  return settled;
}

function matchesWaitItem(item, conversationId, tasksById) {
  if (String(item?.conversation_id || '') !== conversationId) return false;
  const taskId = String(item?.task_id || '');
  const task = taskId ? tasksById.get(taskId) : null;
  // 快照说「在等」，可它指的任务已经收工 => 这条是旧账，不亮灯。
  if (task && !isTaskLive(task)) return false;
  return true;
}

function waitStateFrom({ conversationId, tasksById, items, state }) {
  for (const item of Array.isArray(items) ? items : []) {
    if (!matchesWaitItem(item, conversationId, tasksById)) continue;
    return { state, taskId: String(item?.task_id || '') };
  }
  return null;
}

/**
 * 等人状态（唯一来源 = 后端实时快照）。
 * 未回答的提问优先于未决审批。
 */
export function resolveConversationWaitState({
  conversationId,
  tasks = [],
  pendingInputs = [],
  pendingApprovals = [],
}) {
  const target = String(conversationId || '');
  if (!target) return EMPTY_RESULT;
  const tasksById = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const taskId = taskIdOf(task);
    if (taskId && !tasksById.has(taskId)) tasksById.set(taskId, task);
  }
  const input = waitStateFrom({
    conversationId: target,
    tasksById,
    items: pendingInputs,
    state: RUN_STATE_WAITING_INPUT,
  });
  if (input) return input;
  const approval = waitStateFrom({
    conversationId: target,
    tasksById,
    items: pendingApprovals,
    state: RUN_STATE_APPROVAL,
  });
  return approval || EMPTY_RESULT;
}

/**
 * 会话当前状态：`idle` / `running`（蓝灯）/ `waiting_input`（黄灯·等你回答）/
 * `approval`（黄灯·等你审批）。`taskId` 是让这个会话处于该状态的任务（可能是空串）。
 */
export function resolveConversationRunState({
  conversationId,
  tasks = [],
  pendingInputs = [],
  pendingApprovals = [],
}) {
  if (!String(conversationId || '')) return EMPTY_RESULT;
  const wait = resolveConversationWaitState({ conversationId, tasks, pendingInputs, pendingApprovals });
  if (wait.state !== RUN_STATE_IDLE) return wait;
  const list = Array.isArray(tasks) ? tasks : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const task = list[index];
    if (!isTaskLive(task)) continue;
    return { state: RUN_STATE_RUNNING, taskId: taskIdOf(task) };
  }
  return EMPTY_RESULT;
}
