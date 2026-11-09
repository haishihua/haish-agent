// 一次节点尝试的对话投影：输入气泡 + 回复气泡（或审批卡）。
import React from 'react';
import { AskUserInlineForm } from '../../../chat/components/AskUserInlineForm.jsx';
import { ChatMessageRow } from '../../../chat/components/ChatMessageRow.jsx';
import { buildChatTimeline } from '../../../../core/chat-timeline.js';
import { workflowApprovalInput } from '../../../../core/workflow-approval-markdown.js';
import { workflowInputDisplayText } from '../../../../core/workflow-catalog.js';
import { WorkflowApprovalInline } from '../../../approvals/components/ApprovalOverlay.jsx';
import { taskFirstStreamTimestamp } from '../../../../core/task-runtime.js';
import { isTerminalTaskStatus, normalizeTaskStatus } from '../../../../core/run-status.js';
import {
  attemptTask,
  detailText,
  goalJudgeInput,
  nodeConversationInputValue,
  timestampMs,
} from '../../../../core/node-attempts.js';

export function NodeConversation({ node, task, attempt, result, status, running, showApproval, onRetry, agentName = '', pendingInput = null }) {
  const scopedTask = React.useMemo(() => attemptTask(task, attempt, result), [attempt, result, task]);
  const timelineStatus = running ? 'running' : normalizeTaskStatus(isTerminalTaskStatus(result?.status) ? result.status : status);
  const timeline = React.useMemo(
    () => buildChatTimeline(scopedTask, timelineStatus),
    [scopedTask, timelineStatus],
  );
  const timelineItems = React.useMemo(
    () => (Array.isArray(timeline?.items) ? timeline.items : []),
    [timeline?.items],
  );
  const resultText = detailText(result?.error || result?.summary || result?.text || result?.output);
  const inputValue = React.useMemo(
    () => nodeConversationInputValue(node, attempt, result),
    [attempt, node, result],
  );
  const judgeInput = React.useMemo(() => goalJudgeInput(node, task, inputValue), [node, task, inputValue]);
  const inputText = React.useMemo(() => workflowInputDisplayText(inputValue), [inputValue]);
  const createdAt = timestampMs(attempt?.startedAt || result?.started_at || task?.createdAt);
  const completedAt = running
    ? null
    : timestampMs(attempt?.finishedAt || result?.finished_at || task?.completedAt) || null;
  const inputMessage = React.useMemo(() => ({
    id: `${node.id}-${attempt?.id || 'pending'}-user`,
    role: 'user',
    text: inputText,
    markdown: true,
    status: timelineStatus,
    createdAt,
    completedAt,
  }), [attempt?.id, completedAt, createdAt, inputText, node.id, timelineStatus]);
  const assistantMessage = React.useMemo(() => ({
    id: `${node.id}-${attempt?.id || 'pending'}-agent`,
    taskId: task?.taskId || '',
    conversationId: task?.conversationId || '',
    role: 'agent',
    agentName,
    agentId: node.type === 'agent' ? (node.agent_id || '') : '',
    text: running ? '' : resultText,
    traceTimeline: timelineItems,
    traceLatestTodos: timeline?.latestTodos || null,
    status: timelineStatus,
    streaming: running,
    createdAt,
    completedAt,
    firstTokenAt: taskFirstStreamTimestamp(scopedTask),
  }), [agentName, attempt?.id, completedAt, createdAt, node.agent_id, node.id, node.type, resultText, running, scopedTask, task?.conversationId, task?.taskId, timeline?.latestTodos, timelineItems, timelineStatus]);
  const hasAskUser = (items) => items.some((item) => (
    String(item.toolName || '').toLowerCase() === 'ask_user'
    || hasAskUser(item.children || item.tools || [])
  ));
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
      {judgeInput ? (
        <div className="workflow-judge-input" role="note">
          <strong>Evaluation input</strong>
          {judgeInput.goal ? <p>Goal: {judgeInput.goal}</p> : null}
          <p>When called, Judge evaluates the Agent’s conversation snapshot, including available history, tool evidence and its latest answer, with separate review instructions. The snapshot is not shown here.</p>
        </div>
      ) : inputText ? <ChatMessageRow message={inputMessage} /> : null}
      {showAssistant ? <ChatMessageRow message={assistantMessage} onRetry={onRetry} /> : null}
      {pendingInput && !hasAskUser(timelineItems) ? <AskUserInlineForm taskId={task?.taskId} conversationId={task?.conversationId} toolCallId={pendingInput.tool_call_id || ''} active /> : null}
    </>
  );
}
