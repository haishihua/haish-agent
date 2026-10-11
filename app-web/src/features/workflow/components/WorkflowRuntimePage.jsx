import React from 'react';
import { WorkflowRuntimeConfig } from './WorkflowRuntimeConfig.jsx';
import { workflowNodeRuntimeConfig } from '../model/node-runtime-config.js';
import { approvalStore } from '../../approvals/model/approval-store.js';
import { AskUserInlineForm } from '../../chat/components/AskUserInlineForm.jsx';
import { workflowAttentionRequest } from '../model/workflow-attention.js';
import { agentIconNameForAgentId } from '../../agents/model/agent-settings.js';
import { workflowControlEvents } from '../model/workflow-control-events.js';
import { reconcileRuntimeFlowNodes } from '../model/runtime-flow-nodes.js';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  useStore,
} from '@xyflow/react';
import { WorkflowApprovalInline } from '../../approvals/components/ApprovalOverlay.jsx';
import { buildChatTimeline } from '../../chat/model/chat-timeline.js';
import { workflowNodeAgentName } from '../../chat/model/assistant-name.js';
import { normalizeTaskStatus, taskFirstStreamTimestamp } from '../../tasks/model/task-runtime.js';
import { workflowApprovalInput } from '../model/workflow-approval-markdown.js';
import {
  layoutRuntimeWorkflow,
  mergeWorkflowNodeAttempts,
  workflowApprovalDecisionStatus,
  workflowArrangementPositions,
  workflowNodeOutcomesFromEvents,
  workflowResultForAttempt,
  workflowToolCallsForAttempt,
  workflowTraversedLoopNodeIds,
} from '../model/runtime-workflow-layout.js';
import { useWorkflowCanvasWidth } from '../hooks/useWorkflowCanvasWidth.js';
import {
  typeLabelForWorkflowNode,
  workflowArgumentsText,
  workflowInputDisplayText,
} from '../model/workflow-catalog.js';
import { ChatMessageRow } from '../../chat/components/ChatMessageRow.jsx';
import { ChatTimelineChevron } from '../../chat/components/ChatTimelineNodes.jsx';
import { ScrollToBottomButton } from '../../../shared/ui/ScrollToBottomButton.jsx';
import { workflowRouteHandles, workflowUsedSideHandles } from '../model/workflow-canvas-editing.js';
import { useWorkflowCanvasPreferences } from '../hooks/useWorkflowCanvasPreferences.js';
import { workflowFitOptions, saveWorkflowCanvasPreferences } from '../model/workflow-canvas-preferences.js';
import { WorkflowCanvasControls } from './WorkflowCanvasControls.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import {
  WorkflowCanvasEdge,
  WorkflowFlowNode,
  WORKFLOW_FIT_OPTIONS,
  workflowEdgeAppearance,
  workflowFeedbackTargetIds,
  workflowNodePorts,
  workflowNodeAccent,
} from './WorkflowFlowNode.jsx';

const EMPTY_OPTIONS = [];

const NODE_ICON = {
  start: 'play',
  agent: 'workflow-agent',
  llm: 'workflow-llm',
  tool: 'workflow-tool',
  condition: 'workflow-condition',
  human_approval: 'workflow-approval',
  loop: 'workflow-loop',
  output: 'circle-check',
};

const STATUS_COPY = {
  pending: 'Waiting',
  queued: 'Waiting',
  running: 'Running',
  waiting_input: 'Waiting for input',
  waiting_approval: 'Awaiting approval',
  approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  done: 'Completed',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const DETAIL_NODE_TYPES = new Set(['agent', 'llm', 'tool', 'human_approval']);

function workflowIdentity(workflow) {
  return String(workflow?.workflow_id || workflow?.id || '').trim();
}

function nodeStatus(
  node,
  run,
  taskStatus = '',
  activeEventNodeIds = new Set(),
  eventNodeOutcomes = new Map(),
  traversedLoopNodeIds = new Set(),
) {
  const result = run?.nodes?.[node.id];
  const approvalDecision = workflowApprovalDecisionStatus(node, result);
  const normalized = normalizeTaskStatus(result?.status || '');
  const runStatus = normalizeTaskStatus(run?.status || '');
  const normalizedTaskStatus = normalizeTaskStatus(taskStatus);
  const activeFromEvents = activeEventNodeIds.has(String(node.id));
  const eventOutcome = eventNodeOutcomes.get(String(node.id));
  if (normalizedTaskStatus === 'cancelled' && run?.current_node_id === node.id) {
    return 'cancelled';
  }
  if (run?.current_node_id === node.id && normalizeTaskStatus(run?.status || '') === 'waiting_input') {
    return 'waiting_input';
  }
  if (
    run?.current_node_id === node.id
    && node.type === 'human_approval'
    && (runStatus === 'waiting_approval' || runStatus === 'approval')
  ) {
    return 'approval';
  }
  // The event stream reaches the UI before workflow_run.current_node_id is
  // always persisted. An unfinished node attempt is the live source of truth.
  if (activeFromEvents) {
    if (runStatus === 'waiting_input' || normalizedTaskStatus === 'waiting_input') return 'waiting_input';
    if (node.type === 'human_approval' && (runStatus === 'approval' || runStatus === 'waiting_approval')) return 'approval';
    if ((run?.status && ['running', 'queued'].includes(runStatus)) || ['running', 'queued'].includes(normalizedTaskStatus)) return 'running';
  }
  if (approvalDecision) return approvalDecision;
  if (eventOutcome && eventOutcome !== 'running') return eventOutcome;
  if (normalized === 'cancelled') return 'cancelled';
  if (runStatus === 'cancelled' && run?.current_node_id === node.id) {
    return 'cancelled';
  }
  if (normalized === 'waiting_input') return 'waiting_input';
  if (result?.success === false || normalized === 'failed') return 'failed';
  if (run?.current_node_id === node.id && (!result || normalized === 'running' || normalized === 'queued')) {
    return node.type === 'human_approval' ? 'approval' : 'running';
  }
  if (result) return normalized === 'cancelled' ? 'cancelled' : 'done';
  if (node.type === 'loop' && traversedLoopNodeIds.has(String(node.id))) return 'done';
  return 'pending';
}

const NODE_TYPES = { workflowNode: WorkflowFlowNode };
const EDGE_TYPES = { workflowEdge: WorkflowCanvasEdge };

function FitWorkflow({ workflowKey, detailOpen, layoutKey }) {
  const { fitView } = useReactFlow();
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ ...workflowFitOptions(workflowKey.split(':')[0], WORKFLOW_FIT_OPTIONS), duration: 220 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [detailOpen, fitView, layoutKey, workflowKey]);
  return null;
}

// Screen-space link follows pan/zoom and the measured node, without changing graph topology.
function RuntimeSelectionLink({ nodeId }) {
  const node = useStore((state) => state.nodeLookup.get(nodeId));
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const uid = React.useId().replace(/:/g, '');
  if (!node?.measured?.width || !width) return null;
  const [tx, ty, zoom] = transform;
  const position = node.internals.positionAbsolute;
  const x = (position.x + node.measured.width) * zoom + tx;
  const y = (position.y + (node.measured.height || 64) / 2) * zoom + ty;
  if (x < 0 || x > width || y < 0 || y > height) return null;
  const endY = 64;
  const bend = x + (width - x) * 0.55;
  return (
    <svg className="workflow-selection-link" width="100%" height="100%" aria-hidden="true">
      <defs><linearGradient id={uid} x1="0" x2="1"><stop stopColor="var(--workflow-detail-accent)" stopOpacity="0.12" /><stop offset="1" stopColor="var(--workflow-detail-accent)" stopOpacity="0.38" /></linearGradient></defs>
      <path d={`M ${x} ${y} C ${bend} ${y}, ${width - 40} ${endY + 20}, ${width} ${endY - 16} L ${width} ${endY + 16} C ${width - 40} ${endY + 36}, ${bend} ${y + 8}, ${x} ${y} Z`} fill={`url(#${uid})`} />
      <path d={`M ${x} ${y} C ${bend} ${y}, ${width - 40} ${endY + 20}, ${width} ${endY}`} fill="none" stroke="var(--workflow-detail-accent)" strokeOpacity="0.65" />
    </svg>
  );
}

function eventNodeId(event) {
  return String(event?.workflowNodeId || event?.workflow_node_id || event?.nodeId || event?.node_id || '');
}

function activeNodeIdsFromEvents(eventLog) {
  const active = new Set();
  for (const event of Array.isArray(eventLog) ? eventLog : []) {
    if (event.type === 'workflow_edge_selected') {
      active.delete(String(event.fromNodeId || event.from_node_id || ''));
    }
    const nodeId = eventNodeId(event);
    if (!nodeId) continue;
    if (event.type === 'workflow_node_started') active.add(nodeId);
    if (event.type === 'workflow_node_finished') active.delete(nodeId);
  }
  return active;
}

function nodeAttempts(task, nodeId) {
  const attempts = [];
  let active = null;
  for (const event of Array.isArray(task?.eventLog) ? task.eventLog : []) {
    const directNodeId = eventNodeId(event);
    if (event.type === 'workflow_node_started' && directNodeId === nodeId) {
      active = {
        id: `${nodeId}-${attempts.length + 1}`,
        events: [event],
        startedAt: event.timestamp || null,
        finishedAt: null,
      };
      attempts.push(active);
      continue;
    }
    if (!active) continue;
    if (directNodeId && directNodeId !== nodeId) continue;
    active.events.push(event);
    if (event.type === 'workflow_node_finished' && directNodeId === nodeId) {
      active.finishedAt = event.timestamp || null;
      active = null;
    }
  }
  const result = task?.workflowRun?.nodes?.[nodeId] || null;
  const persisted = Array.isArray(task?.workflowRun?.node_attempts?.[nodeId])
    ? task.workflowRun.node_attempts[nodeId]
    : [];
  const merged = mergeWorkflowNodeAttempts(persisted, attempts, nodeId);
  if (!merged.length && result) {
    merged.push({ id: `${nodeId}-1`, events: [], result, startedAt: result.started_at || null, finishedAt: result.finished_at || null });
  }
  return merged;
}

function attemptTask(task, attempt, result) {
  const events = attempt?.events || [];
  return {
    ...task,
    eventLog: events.filter((event) => !event.type?.startsWith('workflow_')),
    toolCalls: workflowToolCallsForAttempt(task?.toolCalls, events),
    answerText: result?.summary || '',
  };
}

function detailText(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  return workflowArgumentsText(value);
}

function nodeConversationInputValue(node, attempt, result) {
  const startedEvent = attempt?.events?.find((event) => event.type === 'workflow_node_started');
  const inputEvent = node.type === 'tool'
    ? attempt?.events?.find((event) => (
      event?.toolInput != null
      || event?.inputSummary
      || event?.value != null
      || event?.json != null
    )) || startedEvent
    : startedEvent;
  return inputEvent?.nodeInput
    ?? inputEvent?.toolInput
    ?? inputEvent?.inputSummary
    ?? inputEvent?.value
    ?? inputEvent?.json
    ?? inputEvent?.message
    ?? result?.input
    ?? result?.prompt
    ?? (result?.arguments != null ? { tool_name: result?.tool_name || node.tool_name, arguments: result.arguments } : null)
    ?? result?.reviewed_input
    ?? '';
}

function timestampMs(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function NodeConversation({ node, task, attempt, result, status, running, showApproval, onRetry, agentName = '', pendingInput = null }) {
  const scopedTask = React.useMemo(() => attemptTask(task, attempt, result), [attempt, result, task]);
  const timelineStatus = running ? 'running' : normalizeTaskStatus(result?.status || status);
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
    // 回复气泡署名节点配置里的 agent；非 agent 节点没名字，气泡显示 "Assistant"。
    agentName,
    text: running ? '' : resultText,
    traceTimeline: timelineItems,
    traceLatestTodos: timeline?.latestTodos || null,
    status: timelineStatus,
    streaming: running,
    createdAt,
    completedAt,
    firstTokenAt: taskFirstStreamTimestamp(scopedTask),
  }), [agentName, attempt?.id, completedAt, createdAt, node.id, resultText, running, scopedTask, task?.conversationId, task?.taskId, timeline?.latestTodos, timelineItems, timelineStatus]);
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
      {inputText ? <ChatMessageRow message={inputMessage} /> : null}
      {showAssistant ? <ChatMessageRow message={assistantMessage} onRetry={onRetry} /> : null}
      {pendingInput && !hasAskUser(timelineItems) ? <AskUserInlineForm taskId={task?.taskId} conversationId={task?.conversationId} toolCallId={pendingInput.tool_call_id || ''} active /> : null}
    </>
  );
}

function NodeDetail({ node, task, run, status, attention = null, onClose, onResize, onResizeBy, onRetry, agentName = '', agentOptions = [], providerOptions = [], runtimeConfig = {}, onRuntimeConfigChange, configReadOnly = false }) {
  const detailBodyRef = React.useRef(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const live = ['running', 'waiting_input', 'approval'].includes(status);
  const [detailTab, setDetailTab] = React.useState(() => live ? 'result' : 'config');
  const wasLiveRef = React.useRef(live);
  React.useEffect(() => {
    // Follow the transition into execution once, without overriding a user's
    // explicit tab choice on every streamed update.
    if (live && !wasLiveRef.current) setDetailTab('result');
    wasLiveRef.current = live;
  }, [live]);
  const attentionKey = attention?.key || '';
  React.useEffect(() => {
    if (attentionKey) setDetailTab('result');
  }, [attentionKey]);
  React.useEffect(() => {
    if (!attentionKey || !detailBodyRef.current) return undefined;
    const body = detailBodyRef.current;
    const reveal = () => {
      const latest = body.querySelector('.workflow-detail-attempt.is-latest') || body;
      const card = latest.querySelector('.haish-user-input-card, .haish-approval-card');
      if (!card) return;
      card.scrollIntoView({ block: 'nearest' });
      observer.disconnect();
    };
    const observer = new MutationObserver(reveal);
    observer.observe(body, { childList: true, subtree: true });
    reveal();
    return () => observer.disconnect();
  }, [attentionKey]);
  const isAgent = node.type === 'agent';
  const showResult = !isAgent || detailTab === 'result';
  const tabId = React.useId();
  const selectTab = (tab) => {
    setDetailTab(tab);
    if (detailBodyRef.current) detailBodyRef.current.scrollTop = 0;
  };
  const attempts = React.useMemo(() => nodeAttempts(task, node.id), [node.id, task]);
  const latestResult = run?.nodes?.[node.id] || null;
  const visibleAttempts = attempts.length > 0
    ? attempts
    : (latestResult ? [{
        id: `${node.id}-persisted`,
        startedAt: latestResult.started_at,
        finishedAt: latestResult.finished_at,
        events: [],
      }] : []);
  const historicalAttempts = visibleAttempts.slice(0, -1);
  const latestAttempt = visibleAttempts.at(-1) || null;
  const canRetry = onRetry
    && ['done', 'failed', 'cancelled'].includes(normalizeTaskStatus(task?.status))
    && visibleAttempts.length > 0
    && ['agent', 'llm', 'tool', 'human_approval'].includes(node.type);
  const retryLatest = React.useCallback(() => onRetry?.(node.id), [node.id, onRetry]);

  const renderAttempt = (attempt, index, isLatestAttempt) => {
    const attemptNumber = attempt?.result?.attempt || index + 1;
    return (
      <section className={`workflow-detail-attempt${isLatestAttempt ? ' is-latest' : ''}`} key={attempt?.id || `${node.id}-${index}`}>
        {!isLatestAttempt ? (
          <div className="workflow-detail-attempt-label">
            Attempt #{attemptNumber}
          </div>
        ) : null}
        {attempt?.result?.runtime_config ? <p className="workflow-runtime-actual-config">Executed with {attempt.result.runtime_config.model_id || 'provider default'} · thinking {attempt.result.runtime_config.reasoning_effort || 'Unspecified'}</p> : null}
        <NodeConversation
          node={node}
          task={task}
          attempt={attempt}
          result={workflowResultForAttempt(attempt, latestResult, isLatestAttempt, attemptNumber)}
          status={status}
          running={isLatestAttempt && (status === 'running' || status === 'waiting_input' || status === 'approval')}
          showApproval={isLatestAttempt}
          onRetry={isLatestAttempt && canRetry ? retryLatest : null}
          agentName={agentName}
          pendingInput={isLatestAttempt && attention?.status === 'waiting_input' ? attention.request : null}
        />
      </section>
    );
  };

  return (
    <aside className={`workflow-detail-panel is-${status}${isAgent ? ' has-runtime-tabs' : ''}`} data-node-id={node.id} aria-label={`${node.label || node.id} execution details`}>
      <div
        className="workflow-detail-resizer"
        role="separator"
        aria-label="Resize node execution details"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          onResize?.(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) onResize?.(event.clientX);
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          onResizeBy?.(event.key === 'ArrowLeft' ? 24 : -24);
        }}
      />
      <header className="workflow-detail-head">
        <span className="workflow-detail-icon" aria-hidden="true">
          <AppIcon name={node.type === 'agent' ? agentIconNameForAgentId(node.agent_id, agentOptions) : NODE_ICON[node.type] || 'box'} size={26} />
        </span>
        <span className="workflow-detail-heading">
          <span className="workflow-detail-name"><strong>{node.label || typeLabelForWorkflowNode(node.type)}</strong></span>
          <span className="workflow-detail-subtitle"><i className={`workflow-detail-status-dot is-${status}`} aria-hidden="true" />{typeLabelForWorkflowNode(node.type)} · {isAgent && status === 'pending' ? 'Ready' : STATUS_COPY[status] || status}</span>
        </span>
        <button type="button" className="workflow-detail-close" onClick={onClose} aria-label="Close node details">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      {isAgent ? <div className="workflow-detail-tabs" role="tablist" aria-label="Node details">
        {['config', 'result'].map((tab) => <button key={tab} type="button" role="tab" id={`${tabId}-${tab}-tab`} aria-controls={`${tabId}-panel`} aria-selected={detailTab === tab} tabIndex={detailTab === tab ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 'config' : event.key === 'End' ? 'result' : tab === 'config' ? 'result' : 'config';
            selectTab(next);
            document.getElementById(`${tabId}-${next}-tab`)?.focus();
          }
        }}>{tab === 'config' ? 'Runtime Config' : 'Run Result'}</button>)}
      </div> : null}
      <div className="workflow-detail-scroll-region">
        <div ref={detailBodyRef} className={`workflow-detail-body chat-message-list${showResult ? '' : ' is-config'}`} aria-live="polite" role={isAgent ? 'tabpanel' : undefined} id={isAgent ? `${tabId}-panel` : undefined} aria-labelledby={isAgent ? `${tabId}-${detailTab}-tab` : undefined}>
          {isAgent && !showResult ? <WorkflowRuntimeConfig value={runtimeConfig} providerOptions={providerOptions} readOnly={configReadOnly} onChange={onRuntimeConfigChange} /> : null}
          {showResult ? <>
          {status === 'waiting_input' ? (
            <div className="workflow-detail-waiting" role="status">
              <AppIcon name="message" size={18} />
              <span><strong>Waiting for your input</strong><small>Answer the question below to continue this node.</small></span>
            </div>
          ) : null}
          {historicalAttempts.length ? (
            <details
              className="workflow-detail-history"
              open={historyOpen}
              onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
            >
              <summary className="workflow-detail-attempt-label workflow-detail-history-summary">
                <span className="workflow-detail-history-trigger">
                  <span>Previous attempts ({historicalAttempts.length})</span>
                  <ChatTimelineChevron open={historyOpen} />
                </span>
              </summary>
              {historicalAttempts.map((attempt, index) => renderAttempt(attempt, index, false))}
            </details>
          ) : null}
          {latestAttempt ? renderAttempt(latestAttempt, visibleAttempts.length - 1, true) : attention ? (
            <NodeConversation node={node} task={task} status={status} running showApproval agentName={agentName} pendingInput={attention.status === 'waiting_input' ? attention.request : null} />
          ) : (
            <div className="workflow-detail-empty" role="status">{status === 'running' ? 'Waiting for this node’s first event…' : 'No execution content recorded for this node.'}</div>
          )}
          </> : null}
        </div>
        {showResult ? <ScrollToBottomButton
          scrollRef={detailBodyRef}
          autoFollow
          resetKey={`${node.id}:${latestAttempt?.id || ''}`}
        /> : null}
      </div>

    </aside>
  );
}

function WorkflowCanvas({ workflow, task, composer, onRetry, agentOptions = EMPTY_OPTIONS, onOpenConfig = null, providerOptions = [], nodeRuntimeConfigs = {}, onNodeRuntimeConfigChange, configReadOnly = false }) {
  const controlEvents = workflowControlEvents(task?.eventLog);
  const [pendingInputs, setPendingInputs] = React.useState([]);
  const [pendingApprovals, setPendingApprovals] = React.useState([]);
  React.useEffect(() => approvalStore.subscribeInputs(setPendingInputs), []);
  React.useEffect(() => approvalStore.subscribe(setPendingApprovals), []);
  const attention = workflowAttentionRequest(workflow, task, pendingInputs, pendingApprovals);
  const attentionNodeId = attention?.nodeId || '';
  const attentionStatus = attention?.status || '';
  const attentionKey = attention?.key || '';
  const previousAttentionRef = React.useRef('');
  const [selectedNodeId, setSelectedNodeId] = React.useState('');
  const previousSelectionRef = React.useRef({ nodeId: '', status: 'pending' });
  const followApprovalBranchRef = React.useRef('');
  const [detailWidth, setDetailWidth] = React.useState(520);
  const layoutRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const canvasWidth = useWorkflowCanvasWidth(canvasRef);
  const displayWorkflowId = workflowIdentity(workflow);
  const taskWorkflowId = workflowIdentity(task?.workflowSnapshot);
  const run = taskWorkflowId && displayWorkflowId && taskWorkflowId === displayWorkflowId
    ? task?.workflowRun
    : null;
  const activeEventNodeIds = React.useMemo(
    () => activeNodeIdsFromEvents(controlEvents),
    [controlEvents],
  );
  const eventNodeOutcomes = React.useMemo(
    () => workflowNodeOutcomesFromEvents(controlEvents),
    [controlEvents],
  );
  const traversedLoopNodeIds = React.useMemo(
    () => workflowTraversedLoopNodeIds(workflow, run),
    [run, workflow],
  );
  const workflowKey = `${displayWorkflowId}:${workflow?.version || ''}`;
  // 排布与画布宽度无关（列数是常数）：同一张图在配置页和运行页永远排出同一个形状。
  const layout = React.useMemo(
    () => layoutRuntimeWorkflow(workflow?.nodes, workflow?.edges),
    [workflow?.edges, workflow?.nodes],
  );
  // 排布只从配置页保存的位置来（见 workflowArrangementPositions）；这里是只读视图，
  // 节点不可拖：改图一律在配置页做，运行页只负责显示。
  const canvasPreferences = useWorkflowCanvasPreferences(workflow?.workflow_id || workflow?.id);
  const routes = React.useMemo(() => canvasPreferences.routes || {}, [canvasPreferences.routes]);
  const arrangement = React.useMemo(() => workflowArrangementPositions(workflow), [workflow]);
  const layoutKey = `${layout.columns}:${layout.rowCount}:${canvasWidth}`;
  const executedNodeIds = React.useMemo(() => new Set([
    ...Object.keys(run?.nodes || {}),
    ...(run?.current_node_id ? [String(run.current_node_id)] : []),
    ...controlEvents
      .filter((event) => event.type === 'workflow_node_started')
      .map((event) => eventNodeId(event))
      .filter(Boolean),
  ]), [run?.nodes, run?.current_node_id, controlEvents]);
  const canOpenNodeDetail = React.useCallback((node) => (
    Boolean(node)
    && DETAIL_NODE_TYPES.has(node.type)
    && (node.type === 'agent' || executedNodeIds.has(String(node.id)) || String(node.id) === attentionNodeId)
  ), [attentionNodeId, executedNodeIds]);
  // 回环端口（次级→主链那条边的落点）只有一份判断，和配置页调同一个函数。
  const feedbackTargetIds = React.useMemo(
    () => workflowFeedbackTargetIds(workflow?.edges, layout.meta),
    [layout, workflow?.edges],
  );

  React.useEffect(() => {
    setSelectedNodeId('');
    followApprovalBranchRef.current = '';
    previousSelectionRef.current = { nodeId: '', status: 'pending' };
    previousAttentionRef.current = '';
  }, [workflowKey, task?.taskId]);
  React.useEffect(() => {
    if (attentionKey && attentionKey !== previousAttentionRef.current) {
      followApprovalBranchRef.current = '';
      setSelectedNodeId(attentionNodeId);
    }
    previousAttentionRef.current = attentionKey;
  }, [attentionKey, attentionNodeId, workflowKey, task?.taskId]);

  const nodeConfigKey = JSON.stringify(nodeRuntimeConfigs);
  const providerCatalogKey = JSON.stringify(providerOptions.map((item) => ({ selector: item.requestProvider || item.provider || item.id, provider: item.provider })));
  const layoutNodes = React.useMemo(() => {
    const configs = JSON.parse(nodeConfigKey);
    const providers = JSON.parse(providerCatalogKey);
    return (workflow?.nodes || []).map((node) => {
    const status = String(node.id) === attentionNodeId ? attentionStatus : nodeStatus(node, run, task?.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds);
    const id = String(node.id);
    const layoutMeta = layout.meta.get(id);
    const runtimeDetailAvailable = canOpenNodeDetail(node);
    const config = workflowNodeRuntimeConfig(node, task, configs, configReadOnly);
    const provider = providers.find((item) => item.selector === config.provider)?.provider;
    return {
      // ponytail: reuse the editor node renderer; runtime only supplies status/config data.
      id,
      type: 'workflowNode',
      position: arrangement.get(id) || layout.positions.get(id) || { x: 0, y: 0 },
      data: {
        workflowNode: node,
        agentOptions,
        runtimeStatus: status,
        runtimeStatusLabel: STATUS_COPY[status],
        runtimeDetailAvailable,
        ...(node.type === 'agent' ? { runtimeModelId: config.model_id, runtimeProvider: provider || config.provider } : {}),
        feedbackTarget: feedbackTargetIds.has(id),
        usedSideHandles: workflowUsedSideHandles(id, workflow?.edges, routes),
        // 端口（含 loop 的 retry 出口）只有一份来源：两页都从 workflowNodePorts 取。
        ...workflowNodePorts(node, layoutMeta),
      },
      connectable: false,
    };
    });
  }, [attentionNodeId, attentionStatus, activeEventNodeIds, agentOptions, arrangement, canOpenNodeDetail, eventNodeOutcomes, feedbackTargetIds, layout, run, task, configReadOnly, traversedLoopNodeIds, workflow?.nodes, workflow?.edges, routes, nodeConfigKey, providerCatalogKey]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  React.useEffect(() => { setNodes((current) => reconcileRuntimeFlowNodes(current, layoutNodes)); }, [layoutNodes, setNodes]);
  const nodeById = React.useMemo(() => new Map((workflow?.nodes || []).map((node) => [String(node.id), node])), [workflow?.nodes]);
  const statusById = React.useMemo(
    () => new Map((workflow?.nodes || []).map((node) => [String(node.id), nodeStatus(node, run, task?.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds)])),
    [activeEventNodeIds, eventNodeOutcomes, run, task?.status, traversedLoopNodeIds, workflow?.nodes],
  );
  const selectedTransitions = React.useMemo(() => controlEvents
    .filter((event) => event.type === 'workflow_edge_selected')
    .map((event) => ({
      from: String(event.fromNodeId || event.from_node_id || ''),
      to: String(event.toNodeId || event.to_node_id || ''),
    }))
    .filter((event) => event.from && event.to), [controlEvents]);
  const traversedEdgeKeys = React.useMemo(
    () => new Set(selectedTransitions.map((edge) => `${edge.from}->${edge.to}`)),
    [selectedTransitions],
  );
  const latestTransition = selectedTransitions.at(-1) || null;
  const edges = React.useMemo(() => (workflow?.edges || []).map((edge, index) => {
    const source = String(edge.from || edge.source || '');
    const target = String(edge.to || edge.target || '');
    const targetStatus = statusById.get(target);
    const latestSelected = latestTransition?.from === source && latestTransition?.to === target;
    // A running target can have several inbound branches (for example Retry).
    // Animate only the transition the runtime actually selected.
    const active = latestSelected
      && targetStatus !== 'done'
      && targetStatus !== 'approved'
      && targetStatus !== 'rejected'
      && targetStatus !== 'failed'
      && targetStatus !== 'cancelled';
    const traversed = traversedEdgeKeys.has(`${source}->${target}`);
    const appearance = workflowEdgeAppearance(edge, {
      active,
      traversed,
      sourceLayout: layout.meta.get(source),
      targetLayout: layout.meta.get(target),
      // 两端的类型都要传：角色（进 output 那条走「收尾」）看目标类型，
      // 颜色渐变看源类型色 → 目标类型色。
      sourceType: nodeById.get(source)?.type || '',
      sourceNode: nodeById.get(source),
      targetType: nodeById.get(target)?.type || '',
    });
    return {
      id: `${source}-${target}-${edge.branch || index}`,
      source,
      target,
      ...appearance,
      ...workflowRouteHandles(edge, routes),
    };
  }), [routes, latestTransition, layout, nodeById, statusById, traversedEdgeKeys, workflow?.edges]);
  // React Flow's transient selection must not diverge from the detail panel on stream updates/close.
  const displayNodes = React.useMemo(() => nodes.map((node) => ({
    ...node,
    selected: node.id === selectedNodeId && node.data.runtimeDetailAvailable,
  })), [nodes, selectedNodeId]);
  const selectedNodeCandidate = selectedNodeId ? nodeById.get(selectedNodeId) || null : null;
  const selectedNode = canOpenNodeDetail(selectedNodeCandidate) ? selectedNodeCandidate : null;
  // 节点详情的回复按节点配置的 agent 署名（catalog 与节点图标同一份）。
  const selectedNodeAgentName = selectedNode
    ? workflowNodeAgentName(selectedNode, agentOptions)
    : '';
  const selectedStatus = selectedNodeId === attentionNodeId && attentionStatus ? attentionStatus : selectedNode
    ? nodeStatus(selectedNode, run, task?.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds)
    : 'pending';
  React.useEffect(() => {
    const previous = previousSelectionRef.current;
    if (
      selectedNode?.type === 'human_approval'
      && previous.nodeId === selectedNodeId
      && previous.status === 'approval'
      && ['approved', 'rejected'].includes(selectedStatus)
    ) {
      followApprovalBranchRef.current = selectedNodeId;
    }
    previousSelectionRef.current = { nodeId: selectedNodeId, status: selectedStatus };
  }, [selectedNode?.type, selectedNodeId, selectedStatus]);
  React.useEffect(() => {
    const approvalNodeId = followApprovalBranchRef.current;
    if (!approvalNodeId) return;
    const events = task?.eventLog || [];
    const finishedIndex = events.findLastIndex((event) => (
      event.type === 'workflow_node_finished' && eventNodeId(event) === approvalNodeId
    ));
    const branchIndex = events.findLastIndex((event) => (
      event.type === 'workflow_edge_selected'
      && String(event.fromNodeId || event.from_node_id || '') === approvalNodeId
    ));
    const approvalFinishedIndex = finishedIndex >= 0 ? finishedIndex : branchIndex;
    if (approvalFinishedIndex < 0) return;
    const nextEvent = events.slice(approvalFinishedIndex + 1).find((event) => {
      if (event.type !== 'workflow_node_started') return false;
      const nodeId = eventNodeId(event);
      return nodeId !== approvalNodeId && canOpenNodeDetail(nodeById.get(nodeId));
    });
    const nextNodeId = eventNodeId(nextEvent);
    if (!nextNodeId) return;
    followApprovalBranchRef.current = '';
    setSelectedNodeId(nextNodeId);
  }, [canOpenNodeDetail, nodeById, selectedNodeId, task?.eventLog]);
  const displayRunStatus = normalizeTaskStatus(task?.status) === 'cancelled'
    ? 'cancelled'
    : normalizeTaskStatus(run?.status);
  const clampDetailWidth = React.useCallback((width) => {
    const availableWidth = layoutRef.current?.getBoundingClientRect().width || window.innerWidth;
    return Math.round(Math.max(360, Math.min(width, availableWidth - 360)));
  }, []);
  const resizeDetail = React.useCallback((clientX) => {
    const bounds = layoutRef.current?.getBoundingClientRect();
    if (bounds) setDetailWidth(clampDetailWidth(bounds.right - clientX));
  }, [clampDetailWidth]);
  const resizeDetailBy = React.useCallback((delta) => {
    setDetailWidth((width) => clampDetailWidth(width + delta));
  }, [clampDetailWidth]);

  if (!workflow?.nodes?.length) {
    return (
      <div className="workflow-run-empty">
        <AppIcon name="git-branch" size={28} />
        <strong>Select a Workflow</strong>
        <span>Pick a Workflow below to preview and run it.</span>
        <div className="workflow-composer-dock">{composer}</div>
      </div>
    );
  }

  // 标题区（工作流名 + 运行状态）。运行页是只读的——想改图就回配置页——所以整块是一个按钮：
  // 点了把这个工作流的 id 交给上层（AppShell 打开设置页里同一个编辑器）。没有 handler 时是纯文本。
  const titleLabel = workflow.display_name || displayWorkflowId || 'Workflow';
  const runStatusCopy = run
    ? (STATUS_COPY[displayRunStatus] || run.status || displayRunStatus)
    : 'Ready to run';
  const titleBody = (
    <>
      <strong className={displayRunStatus === 'running' ? 'is-running' : ''}>{titleLabel}</strong>
      <span className={`workflow-run-status is-${displayRunStatus || 'idle'}`}>{runStatusCopy}</span>
    </>
  );

  return (
    <div
      ref={layoutRef}
      className={`workflow-run-layout ${selectedNode ? 'has-detail' : ''}`}
      style={selectedNode ? {
        '--workflow-detail-width': `${detailWidth}px`,
        '--workflow-detail-accent': workflowNodeAccent(selectedNode.type),
      } : undefined}
    >
      <main ref={canvasRef} className="workflow-run-canvas workflow-canvas" aria-label="Workflow execution graph">
        {onOpenConfig ? (
          <button
            type="button"
            className="workflow-run-title is-interactive"
            onClick={() => onOpenConfig(displayWorkflowId)}
            title="Open workflow settings"
            aria-label={`${titleLabel} · ${runStatusCopy} · Open workflow settings`}
          >
            {titleBody}
          </button>
        ) : (
          <div className="workflow-run-title">{titleBody}</div>
        )}
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          minZoom={0.3}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={workflowFitOptions(workflow?.workflow_id || workflow?.id, WORKFLOW_FIT_OPTIONS)}
          onMoveEnd={(event, viewport) => {
            if (event) saveWorkflowCanvasPreferences(workflow?.workflow_id || workflow?.id, { zoom: viewport.zoom });
          }}
          onNodeClick={(_, flowNode) => {
            const node = nodeById.get(flowNode.id);
            setSelectedNodeId(canOpenNodeDetail(node) ? flowNode.id : '');
          }}
          onPaneClick={() => setSelectedNodeId('')}
          proOptions={{ hideAttribution: true }}
        >
          {selectedNode ? <RuntimeSelectionLink nodeId={selectedNodeId} /> : null}
          <Background gap={30} size={1.2} color="rgba(150, 184, 240, 0.07)" />
          <WorkflowCanvasControls workflowId={workflow?.workflow_id || workflow?.id} />
          <FitWorkflow workflowKey={workflowKey} detailOpen={Boolean(selectedNode)} layoutKey={layoutKey} />
        </ReactFlow>
        <div className="workflow-composer-dock">{composer}</div>
      </main>
      {selectedNode ? (
        <NodeDetail
          key={`${task?.taskId || ''}:${selectedNode.id}`}
          node={selectedNode}
          task={task}
          run={run}
          status={selectedStatus}
          attention={selectedNodeId === attentionNodeId ? attention : null}
          onClose={() => setSelectedNodeId('')}
          onResize={resizeDetail}
          onResizeBy={resizeDetailBy}
          onRetry={task ? onRetry : null}
          agentName={selectedNodeAgentName}
          agentOptions={agentOptions}
          providerOptions={providerOptions}
          runtimeConfig={workflowNodeRuntimeConfig(selectedNode, task, nodeRuntimeConfigs, configReadOnly)}
          onRuntimeConfigChange={(config) => onNodeRuntimeConfigChange?.(selectedNode.id, config)}
          configReadOnly={configReadOnly || !onNodeRuntimeConfigChange}
        />
      ) : null}
    </div>
  );
}

export function WorkflowRuntimePage(props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvas {...props} />
    </ReactFlowProvider>
  );
}
