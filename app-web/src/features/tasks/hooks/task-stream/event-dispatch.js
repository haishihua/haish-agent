// 直播事件的分流与守卫：谁有资格进入任务投影（会话归属、Stop 之后的迟到事件、
// 用户已取消 / 已收尾的任务），以及事件类型到具体事件域 handler 的路由。
// 这里只做判定与路由，真正的写入在各事件域模块里；所有状态都从参数进来。
import { handleAnswerDelta, handleFinalAnswer, handleThinkingCompleted, handleThinkingStarted } from './text-block.js';
import { handleToolCallCompleted, handleToolCallStarted, handleToolOutputDelta } from './tool-events.js';
import {
  handleProviderSelected,
  handleWorkflowFinished,
  handleWorkflowNodeConfigured,
  handleWorkflowNodeFinished,
  handleWorkflowNodeStarted,
  handleWorkflowResumed,
  handleWorkflowRunResumed,
  handleWorkflowRunWaiting,
  handleWorkflowStarted,
} from './workflow-events.js';
import { handleRunFinished, handleRunStarted } from './run-events.js';
import {
  handleContextCompactionStarted,
  handleContextCompactionSettled,
  handleLlmRetry,
  handleSubAgentProgress,
  handleTodoUpdated,
} from './task-events.js';

/**
 * 事件准入：返回这条事件要写进哪条任务，`null` 表示丢弃（不是错误）。
 * 判定顺序与副作用顺序都是契约的一部分：abortRequested 会顺手把任务记成
 * 已取消/已收尾，其余分支只补 finalized 标记或清掉活跃任务。
 */
export function admitRuntimeEvent(event, {
  eventConversationId,
  ownerConvId,
  ownerRuntime,
  ensureTaskForEvent,
  userCancelledTaskIdsRef,
  chatFinalizedTaskIdsRef,
  chatFinalFollowUpEventTypes,
  updateTaskRuntimeState,
}) {
  if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
    return null;
  }
  // Stop-before-visualization: drop every late event for the aborted run,
  // including run_finished, which would otherwise rehydrate empty shells.
  if (ownerRuntime?.abortRequested) {
    if (event.task_id) {
      userCancelledTaskIdsRef.current.add(event.task_id);
      chatFinalizedTaskIdsRef.current.add(event.task_id);
    }
    return null;
  }
  if (event.task_id && userCancelledTaskIdsRef.current.has(event.task_id)) {
    chatFinalizedTaskIdsRef.current.add(event.task_id);
    return null;
  }
  const taskId = ensureTaskForEvent(event, ownerConvId);
  if (!taskId) return null;
  if (userCancelledTaskIdsRef.current.has(taskId)) {
    chatFinalizedTaskIdsRef.current.add(taskId);
    return null;
  }
  if (
    chatFinalizedTaskIdsRef.current.has(taskId)
    && !chatFinalFollowUpEventTypes.has(event.type)
  ) {
    updateTaskRuntimeState((state) => (
      state.activeTaskId === taskId ? { ...state, activeTaskId: null } : state
    ), ownerConvId);
    return null;
  }
  return taskId;
}

/** 事件类型 → 事件域 handler。未知类型什么也不做（和原来的 default: break 一致）。 */
export function dispatchRuntimeEvent(event, scope) {
  switch (event.type) {
    case 'workflow_started':
      return handleWorkflowStarted(scope, event);
    case 'workflow_resumed':
      return handleWorkflowResumed(scope, event);
    case 'workflow_node_started':
      return handleWorkflowNodeStarted(scope, event);
    case 'workflow_node_configured':
      return handleWorkflowNodeConfigured(scope, event);
    case 'workflow_run_waiting':
      return handleWorkflowRunWaiting(scope, event);
    case 'workflow_run_resumed':
      return handleWorkflowRunResumed(scope, event);
    case 'workflow_node_finished':
      return handleWorkflowNodeFinished(scope, event);
    case 'workflow_finished':
    case 'workflow_failed':
      return handleWorkflowFinished(scope, event);
    case 'run_started':
      return handleRunStarted(scope, event);
    case 'provider_selected':
      return handleProviderSelected(scope, event);
    case 'context_compaction_started':
      return handleContextCompactionStarted(scope, event);
    case 'context_compaction_completed':
    case 'context_compaction_failed':
      return handleContextCompactionSettled(scope, event);
    case 'llm_thinking_started':
    case 'llm_thinking_delta':
    case 'agent_progress_delta':
      return handleThinkingStarted(scope, event);
    case 'llm_thinking_completed':
      return handleThinkingCompleted(scope, event);
    case 'tool_call_started':
      return handleToolCallStarted(scope, event);
    case 'tool_call_completed':
      return handleToolCallCompleted(scope, event);
    case 'todo_updated':
      return handleTodoUpdated(scope, event);
    case 'tool_output_delta':
      return handleToolOutputDelta(scope, event);
    case 'sub_agent_progress_delta':
    case 'sub_agent_answer_delta':
    case 'sub_agent_tool_call_started':
    case 'sub_agent_tool_call_completed':
    case 'sub_agent_started':
    case 'sub_agent_finished':
      return handleSubAgentProgress(scope, event);
    case 'llm_answer_delta':
      return handleAnswerDelta(scope, event);
    case 'llm_retry':
      return handleLlmRetry(scope, event);
    case 'final_answer':
      return handleFinalAnswer(scope, event);
    case 'run_finished':
      return handleRunFinished(scope, event);
    default:
      return undefined;
  }
}
