import React from 'react';
import { workflowControlEvents } from '../model/workflow-control-events.js';
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
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
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import {
  WorkflowCanvasEdge,
  WorkflowFlowNode,
  workflowEdgeAppearance,
  workflowFeedbackTargetIds,
  workflowNodePorts,
} from './WorkflowFlowNode.jsx';

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
  running: 'Running',
  waiting_input: 'Waiting for input',
  waiting_approval: 'Awaiting approval',
  approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  done: 'Completed',
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
      fitView({ padding: 0.12, minZoom: 0.45, maxZoom: 1.15, duration: 220 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [detailOpen, fitView, layoutKey, workflowKey]);
  return null;
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

function NodeConversation({ node, task, attempt, result, status, running, showApproval, onRetry, agentName = '' }) {
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
    </>
  );
}

function NodeDetail({ node, task, run, status, onClose, onResize, onResizeBy, onRetry, agentName = '' }) {
  const detailBodyRef = React.useRef(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
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
        />
      </section>
    );
  };

  return (
    <aside className="workflow-detail-panel" aria-label={`${node.label || node.id} execution details`}>
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
          <AppIcon name={NODE_ICON[node.type] || 'box'} size={20} />
        </span>
        <span className="workflow-detail-heading">
          <strong>{node.label || typeLabelForWorkflowNode(node.type)}</strong>
          <span>{typeLabelForWorkflowNode(node.type)} · {STATUS_COPY[status] || status}</span>
        </span>
        <button type="button" className="workflow-detail-close" onClick={onClose} aria-label="Close node details">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </header>

      <div className="workflow-detail-scroll-region">
        <div ref={detailBodyRef} className="workflow-detail-body chat-message-list" aria-live="polite">
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
          {latestAttempt ? renderAttempt(latestAttempt, visibleAttempts.length - 1, true) : null}
        </div>
        <ScrollToBottomButton
          scrollRef={detailBodyRef}
          autoFollow
          resetKey={`${node.id}:${latestAttempt?.id || ''}`}
        />
      </div>

    </aside>
  );
}

function WorkflowCanvas({ workflow, task, composer, onRetry, agentOptions = [], onOpenConfig = null }) {
  const controlEvents = workflowControlEvents(task?.eventLog);
  const [selectedNodeId, setSelectedNodeId] = React.useState('');
  const previousSelectionRef = React.useRef({ nodeId: '', status: 'pending' });
  const followApprovalBranchRef = React.useRef('');
  const [detailWidth, setDetailWidth] = React.useState(460);
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
  const arrangement = React.useMemo(() => workflowArrangementPositions(workflow), [workflow]);
  const layoutKey = `${layout.columns}:${layout.rowCount}:${canvasWidth}`;
  const executedNodeIds = React.useMemo(() => new Set([
    ...Object.keys(run?.nodes || {}),
    ...controlEvents
      .filter((event) => event.type === 'workflow_node_started')
      .map((event) => eventNodeId(event))
      .filter(Boolean),
  ]), [run?.nodes, controlEvents]);
  const canOpenNodeDetail = React.useCallback((node) => (
    Boolean(node)
    && DETAIL_NODE_TYPES.has(node.type)
    && executedNodeIds.has(String(node.id))
  ), [executedNodeIds]);
  // 回环端口（次级→主链那条边的落点）只有一份判断，和配置页调同一个函数。
  const feedbackTargetIds = React.useMemo(
    () => workflowFeedbackTargetIds(workflow?.edges, layout.meta),
    [layout, workflow?.edges],
  );

  React.useEffect(() => setSelectedNodeId(''), [workflowKey]);

  const layoutNodes = React.useMemo(() => (workflow?.nodes || []).map((node) => {
    const status = nodeStatus(node, run, task?.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds);
    const id = String(node.id);
    const layoutMeta = layout.meta.get(id);
    const runtimeDetailAvailable = canOpenNodeDetail(node);
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
        feedbackTarget: feedbackTargetIds.has(id),
        // 端口（含 loop 的 retry 出口）只有一份来源：两页都从 workflowNodePorts 取。
        ...workflowNodePorts(node, layoutMeta),
      },
      connectable: false,
    };
  }), [activeEventNodeIds, agentOptions, arrangement, canOpenNodeDetail, eventNodeOutcomes, feedbackTargetIds, layout, run, task?.status, traversedLoopNodeIds, workflow?.nodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  React.useEffect(() => { setNodes(layoutNodes); }, [layoutNodes, setNodes]);
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
    });
    return {
      id: `${source}-${target}-${edge.branch || index}`,
      source,
      target,
      ...appearance,
    };
  }), [latestTransition, layout, statusById, traversedEdgeKeys, workflow?.edges]);
  const selectedNodeCandidate = selectedNodeId ? nodeById.get(selectedNodeId) || null : null;
  const selectedNode = canOpenNodeDetail(selectedNodeCandidate) ? selectedNodeCandidate : null;
  // 节点详情的回复按节点配置的 agent 署名（catalog 与节点图标同一份）。
  const selectedNodeAgentName = selectedNode
    ? workflowNodeAgentName(selectedNode, agentOptions)
    : '';
  const selectedStatus = selectedNode
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
      style={selectedNode ? { '--workflow-detail-width': `${detailWidth}px` } : undefined}
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
          nodes={nodes}
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
          onNodeClick={(_, flowNode) => {
            const node = nodeById.get(flowNode.id);
            setSelectedNodeId(canOpenNodeDetail(node) ? flowNode.id : '');
          }}
          onPaneClick={() => setSelectedNodeId('')}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1.2} color="rgba(176, 206, 255, 0.07)" />
          <Controls showInteractive={false} position="top-right" />
          <FitWorkflow workflowKey={workflowKey} detailOpen={Boolean(selectedNode)} layoutKey={layoutKey} />
        </ReactFlow>
        <div className="workflow-composer-dock">{composer}</div>
      </main>
      {selectedNode ? (
        <NodeDetail
          node={selectedNode}
          task={task}
          run={run}
          status={selectedStatus}
          onClose={() => setSelectedNodeId('')}
          onResize={resizeDetail}
          onResizeBy={resizeDetailBy}
          onRetry={task ? onRetry : null}
          agentName={selectedNodeAgentName}
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
