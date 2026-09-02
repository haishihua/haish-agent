import React from 'react';
import {
  Background,
  Controls,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import { WorkflowApprovalInline } from '../../approvals/components/ApprovalOverlay.jsx';
import { buildChatTimeline } from '../../chat/model/chat-timeline.js';
import { normalizeTaskStatus, taskFirstStreamTimestamp } from '../../tasks/model/task-runtime.js';
import { workflowApprovalInput } from '../model/workflow-approval-markdown.js';
import {
  layoutRuntimeWorkflow,
  mergeWorkflowNodeAttempts,
  workflowApprovalDecisionStatus,
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
  WorkflowFlowNode,
  workflowEdgeAppearance,
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

function NodeConversation({ node, task, attempt, result, status, running, showApproval, onRetry }) {
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
    text: running ? '' : resultText,
    traceTimeline: timelineItems,
    traceLatestTodos: timeline?.latestTodos || null,
    status: timelineStatus,
    streaming: running,
    createdAt,
    completedAt,
    firstTokenAt: taskFirstStreamTimestamp(scopedTask),
  }), [attempt?.id, completedAt, createdAt, node.id, resultText, running, scopedTask, task?.conversationId, task?.taskId, timeline?.latestTodos, timelineItems, timelineStatus]);
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

function NodeDetail({ node, task, run, status, onClose, onResize, onResizeBy, onRetry }) {
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
        {visibleAttempts.length > 1 ? (
          <div className="workflow-detail-attempt-label">
            {isLatestAttempt ? 'latest Attempt' : 'attempt'} #{attemptNumber}
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
                <span>previous Attempts ({historicalAttempts.length})</span>
                <ChatTimelineChevron open={historyOpen} />
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

function WorkflowCanvas({ workflow, task, composer, onRetry, agentOptions = [] }) {
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
    () => activeNodeIdsFromEvents(task?.eventLog),
    [task?.eventLog],
  );
  const eventNodeOutcomes = React.useMemo(
    () => workflowNodeOutcomesFromEvents(task?.eventLog),
    [task?.eventLog],
  );
  const traversedLoopNodeIds = React.useMemo(
    () => workflowTraversedLoopNodeIds(workflow, run),
    [run, workflow],
  );
  const workflowKey = `${displayWorkflowId}:${workflow?.version || ''}`;
  const layout = React.useMemo(
    () => layoutRuntimeWorkflow(workflow?.nodes, workflow?.edges, canvasWidth),
    [canvasWidth, workflow?.edges, workflow?.nodes],
  );
  const layoutKey = `${layout.columns}:${layout.rowCount}:${canvasWidth}`;
  const executedNodeIds = React.useMemo(() => new Set([
    ...Object.keys(run?.nodes || {}),
    ...(task?.eventLog || [])
      .filter((event) => event.type === 'workflow_node_started')
      .map((event) => eventNodeId(event))
      .filter(Boolean),
  ]), [run?.nodes, task?.eventLog]);
  const canOpenNodeDetail = React.useCallback((node) => (
    Boolean(node)
    && DETAIL_NODE_TYPES.has(node.type)
    && executedNodeIds.has(String(node.id))
  ), [executedNodeIds]);
  const feedbackTargetIds = React.useMemo(() => new Set(
    (workflow?.edges || []).flatMap((edge) => {
      const source = String(edge.from || edge.source || '');
      const target = String(edge.to || edge.target || '');
      return layout.meta.get(source)?.kind === 'secondary' && layout.meta.get(target)?.kind === 'primary'
        ? [target]
        : [];
    }),
  ), [layout, workflow?.edges]);

  React.useEffect(() => setSelectedNodeId(''), [workflowKey]);

  const layoutNodes = React.useMemo(() => (workflow?.nodes || []).map((node) => {
    const status = nodeStatus(node, run, task?.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds);
    const id = String(node.id);
    const layoutMeta = layout.meta.get(id);
    const direction = layoutMeta?.direction || 'right';
    const secondary = layoutMeta?.kind === 'secondary';
    const runtimeDetailAvailable = canOpenNodeDetail(node);
    return {
      // ponytail: reuse the editor node renderer; runtime only supplies status/config data.
      id,
      type: 'workflowNode',
      position: layout.positions.get(id) || node.position || { x: 0, y: 0 },
      data: {
        workflowNode: node,
        agentOptions,
        runtimeStatus: status,
        runtimeStatusLabel: STATUS_COPY[status],
        runtimeDetailAvailable,
        sourcePosition: secondary
          ? (direction === 'right' ? Position.Left : Position.Right)
          : (direction === 'right' ? Position.Right : Position.Left),
        targetPosition: secondary
          ? Position.Top
          : (direction === 'right' ? Position.Left : Position.Right),
        feedbackTarget: feedbackTargetIds.has(id),
        branchSourcePositions: secondary && node.type === 'loop' ? { retry: Position.Top } : undefined,
      },
      draggable: true,
      connectable: false,
    };
  }), [activeEventNodeIds, agentOptions, canOpenNodeDetail, eventNodeOutcomes, feedbackTargetIds, layout, run, task?.status, traversedLoopNodeIds, workflow?.nodes]);
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const isNodeDraggingRef = React.useRef(false);
  const draggedNodePositionsRef = React.useRef(new Map());
  const previousWorkflowKeyRef = React.useRef(workflowKey);
  React.useEffect(() => {
    const resetPositions = previousWorkflowKeyRef.current !== workflowKey;
    if (resetPositions) draggedNodePositionsRef.current.clear();
    previousWorkflowKeyRef.current = workflowKey;
    if (isNodeDraggingRef.current) return;
    setNodes(layoutNodes.map((node) => {
      const draggedPosition = draggedNodePositionsRef.current.get(node.id);
      return draggedPosition ? { ...node, position: draggedPosition } : node;
    }));
  }, [layoutNodes, setNodes, workflowKey]);
  const nodeById = React.useMemo(() => new Map((workflow?.nodes || []).map((node) => [String(node.id), node])), [workflow?.nodes]);
  const statusById = React.useMemo(
    () => new Map((workflow?.nodes || []).map((node) => [String(node.id), nodeStatus(node, run, task?.status, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds)])),
    [activeEventNodeIds, eventNodeOutcomes, run, task?.status, traversedLoopNodeIds, workflow?.nodes],
  );
  const selectedTransitions = React.useMemo(() => (task?.eventLog || [])
    .filter((event) => event.type === 'workflow_edge_selected')
    .map((event) => ({
      from: String(event.fromNodeId || event.from_node_id || ''),
      to: String(event.toNodeId || event.to_node_id || ''),
    }))
    .filter((event) => event.from && event.to), [task?.eventLog]);
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
    const sourceLayout = layout.meta.get(source);
    const targetLayout = layout.meta.get(target);
    const curved = sourceLayout?.row !== targetLayout?.row
      || sourceLayout?.kind === 'secondary'
      || targetLayout?.kind === 'secondary';
    const reworkEdge = sourceLayout?.kind !== targetLayout?.kind;
    const feedback = sourceLayout?.kind === 'secondary' && targetLayout?.kind === 'primary';
    const appearance = workflowEdgeAppearance(edge, { active });
    return {
      id: `${source}-${target}-${edge.branch || index}`,
      source,
      target,
      ...appearance,
      targetHandle: feedback ? 'runtime-feedback' : undefined,
      type: curved ? 'smoothstep' : appearance.type,
      pathOptions: curved
        ? { borderRadius: 18, offset: reworkEdge ? 0 : 28 }
        : appearance.pathOptions,
      zIndex: 0,
      animated: active,
      className: active ? 'is-flowing' : (traversed ? 'is-traversed' : ''),
    };
  }), [latestTransition, layout, statusById, traversedEdgeKeys, workflow?.edges]);
  const selectedNodeCandidate = selectedNodeId ? nodeById.get(selectedNodeId) || null : null;
  const selectedNode = canOpenNodeDetail(selectedNodeCandidate) ? selectedNodeCandidate : null;
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
        <span>Choose a Workflow in Task Delegation to preview and run it.</span>
        {composer}
      </div>
    );
  }

  return (
    <div
      ref={layoutRef}
      className={`workflow-run-layout ${selectedNode ? 'has-detail' : ''}`}
      style={selectedNode ? { '--workflow-detail-width': `${detailWidth}px` } : undefined}
    >
      <main ref={canvasRef} className="workflow-run-canvas workflow-canvas" aria-label="Workflow execution graph">
        <div className="workflow-run-title">
          <strong className={displayRunStatus === 'running' ? 'is-running' : ''}>
            {workflow.display_name || displayWorkflowId || 'Workflow'}
          </strong>
          {displayRunStatus !== 'running' ? (
            <span>{run ? (STATUS_COPY[displayRunStatus] || run.status) : 'Ready to run'}</span>
          ) : null}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStart={() => { isNodeDraggingRef.current = true; }}
          onNodeDragStop={(_, node) => {
            draggedNodePositionsRef.current.set(node.id, node.position);
            isNodeDraggingRef.current = false;
          }}
          minZoom={0.3}
          maxZoom={1.4}
          nodesDraggable
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
          <Controls showInteractive={false} position="bottom-left" />
          <FitWorkflow workflowKey={workflowKey} detailOpen={Boolean(selectedNode)} layoutKey={layoutKey} />
        </ReactFlow>
        {composer}
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
