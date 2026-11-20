// 一次节点尝试的对话投影：输入气泡 + 回复气泡（或审批卡）。
import React from 'react';
import { AskUserInlineForm } from '../../../chat/components/AskUserInlineForm.jsx';
import { ChatMessageRow } from '../../../chat/components/ChatMessageRow.jsx';
import { buildChatTimeline } from '../../../../core/chat-timeline.js';
import { normalizeToolName, TOOL_AWAITS_USER_NAMES } from '../../../../core/tool-names.js';
import { workflowApprovalInput } from '../../../../core/workflow-approval-markdown.js';
import { workflowInputDisplayText } from '../../../../core/workflow-catalog.js';
import { WorkflowApprovalInline } from '../../../approvals/components/ApprovalOverlay.jsx';
import { taskFirstStreamTimestamp } from '../../../../core/task-runtime.js';
import { isTerminalTaskStatus, normalizeTaskStatus } from '../../../../core/run-status.js';
import {
  attemptTask,
  detailText,
  judgeReasonText,
  nodeConversationInputValue,
  timestampMs,
} from '../../../../core/node-attempts.js';

export function NodeConversation({ node, task, attempt, result, status, running, showApproval, onRetry, agentName = '', runtimeConfig = {}, pendingInput = null, annotationAttempt = 0 }) {
  const scopedTask = React.useMemo(() => attemptTask(task, attempt, result), [attempt, result, task]);
  const timelineStatus = running ? 'running' : normalizeTaskStatus(isTerminalTaskStatus(result?.status) ? result.status : status);
  const timeline = React.useMemo(
    () => buildChatTimeline(scopedTask, timelineStatus),
    [scopedTask, timelineStatus],
  );
  const isGoalJudge = node.type === 'llm' && node.id === 'judge'
    && (task?.workflowSnapshot?.id || task?.workflowSnapshot?.workflow_id || task?.requestedWorkflowId) === 'workflow.goal-loop';
  const resultText = isGoalJudge ? judgeReasonText(result)
    : detailText(result?.error || result?.summary || result?.text || result?.output);
  const rawInputValue = React.useMemo(
    () => nodeConversationInputValue(node, attempt, result),
    [attempt, node, result],
  );
  // Goal's workflow input contains internal instructions. The user bubble is
  // the actual request, not the engine's rendered prompt.
  const workflowId = task?.workflowSnapshot?.id || task?.workflowSnapshot?.workflow_id || task?.requestedWorkflowId;
  const feedback = rawInputValue && typeof rawInputValue === 'object'
    ? String(rawInputValue.evaluation_feedback || '').trim() : '';
  // Mirror AgentExecutor's default input mapping, not node array order.
  const definition = task?.workflowSnapshot?.nodes?.find(candidate => candidate.id === node.id) || node;
  const data = definition.data || definition;
  const mapping = data.input_mapping;
  const messageTemplate = data.input ?? (mapping && typeof mapping === 'object' ? mapping.message : '{{input.message}}');
  const usesUserInput = node.type === 'agent' && (messageTemplate === '{{input.message}}'
    || (workflowId === 'workflow.goal-loop' && node.id === 'agent'));
  const inputValue = usesUserInput
    ? (feedback || (task?.displayText ?? task?.requestText ?? (task?.annotations?.length ? '' : task?.title)) || '') : rawInputValue;
  const inputText = React.useMemo(() => workflowInputDisplayText(inputValue), [inputValue]);
  // Keep the normal input bubble above the response. Goal retry feedback may
  // also be recorded as runtime input; hide only that duplicate inside the trace.
  const timelineItems = React.useMemo(() => {
    const items = Array.isArray(timeline?.items) ? timeline.items : [];
    if (workflowId !== 'workflow.goal-loop' || node.id !== 'agent' || !feedback) return items;
    return items.filter((item) => !(item.kind === 'user_input'
      && String(item.text || '').trim() === feedback));
  }, [timeline?.items, workflowId, node.id, feedback]);
  const createdAt = timestampMs(attempt?.startedAt || result?.started_at || task?.createdAt);
  const completedAt = running
    ? null
    : timestampMs(attempt?.finishedAt || result?.finished_at || task?.completedAt) || null;
  const inputMessage = React.useMemo(() => ({
    id: `${node.id}-${attempt?.id || 'pending'}-user`,
    role: 'user',
    text: inputText,
    annotations: !feedback && usesUserInput ? (task?.annotations || []) : [],
    images: !feedback && usesUserInput && Array.isArray(task?.imageAttachments) ? task.imageAttachments : [],
    taskId: task?.taskId || '',
    conversationId: task?.conversationId || '',
    messageId: task?.userMessageId,
    markdown: true,
    status: timelineStatus,
    createdAt,
    completedAt,
  }), [usesUserInput, task?.imageAttachments, task?.taskId, task?.conversationId, task?.userMessageId, task?.annotations, feedback, attempt?.id, completedAt, createdAt, inputText, node.id, timelineStatus]);
  const modelId = result?.runtime_config?.model_id || runtimeConfig.model_id || '';
  const modelProvider = result?.runtime_config?.provider || runtimeConfig.provider || runtimeConfig.llm_config_id || '';
  const assistantMessage = React.useMemo(() => ({
    id: `${node.id}-${attempt?.id || 'pending'}-agent`,
    taskId: task?.taskId || '',
    conversationId: task?.conversationId || '',
    messageId: node.type === 'agent' && annotationAttempt && task?.taskId
      ? `workflow:${task.taskId}:${node.id}:${annotationAttempt}` : undefined,
    role: 'agent',
    agentName: node.type === 'llm' ? (modelId || 'LLM') : agentName,
    modelId: node.type === 'llm' ? modelId : '',
    modelProvider,
    agentId: node.type === 'agent' ? (node.agent_id || '') : '',
    text: running ? '' : resultText,
    traceTimeline: timelineItems,
    traceLatestTodos: timeline?.latestTodos || null,
    status: timelineStatus,
    streaming: running,
    createdAt,
    completedAt,
    firstTokenAt: taskFirstStreamTimestamp(scopedTask),
  }), [modelId, modelProvider, agentName, annotationAttempt, attempt?.id, completedAt, createdAt, node.agent_id, node.id, node.type, resultText, running, scopedTask, task?.conversationId, task?.taskId, timeline?.latestTodos, timelineItems, timelineStatus]);
  const hasAskUser = (items) => items.some((item) => (
    TOOL_AWAITS_USER_NAMES.has(normalizeToolName(item?.toolName))
    || hasAskUser(item.children || item.tools || [])
  ));
  const needsFallback = pendingInput && !hasAskUser(timelineItems);
  const showAssistant = node.type !== 'human_approval'
    ? running || Boolean(resultText) || timelineItems.length > 0
    : Boolean(resultText) || timelineItems.length > 0;

  if (node.type === 'human_approval') {
    const reviewedInput = workflowApprovalInput(inputValue);
    const resolvedRequest = status === 'approval' && showApproval ? null : {
      request_id: `${task?.taskId || 'task'}-${node.id}-${attempt?.id || 'attempt'}`,
      title: reviewedInput?.title || node.label || 'Approval required',
      summaryText: reviewedInput?.summaryText || inputText || resultText,
      attempt: result?.attempt || result?.structured?.attempt || 1,
      decision: result?.decision || result?.structured?.decision || 'cancelled',
      feedback: result?.feedback || result?.structured?.feedback || '',
    };
    return (
      <WorkflowApprovalInline
        nodeId={node.id}
        taskId={task?.taskId || ''}
        conversationId={task?.conversationId || ''}
        allowLiveRequest={showApproval}
        resolvedRequest={resolvedRequest}
        onRetry={onRetry}
        createdAt={createdAt}
        completedAt={completedAt}
      />
    );
  }

  return (
    <>
      {!isGoalJudge && (inputText || inputMessage.annotations.length || inputMessage.images.length) ? <ChatMessageRow message={inputMessage} /> : null}
      {showAssistant ? <ChatMessageRow message={assistantMessage} onRetry={onRetry} mcpUserInput={!needsFallback} /> : null}
      {needsFallback ? <AskUserInlineForm taskId={task?.taskId} conversationId={task?.conversationId} toolCallId={pendingInput.tool_call_id || ''} active /> : null}
    </>
  );
}
