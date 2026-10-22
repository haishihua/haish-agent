import React from 'react';
import { WorkflowRuntimeConfig } from './WorkflowRuntimeConfig.jsx';
import { workflowNodeRuntimeConfig } from '../model/node-runtime-config.js';
import { approvalStore } from '../../approvals/model/approval-store.js';
import { workflowAttentionRequest } from '../model/workflow-attention.js';
import { workflowControlEvents } from '../model/workflow-control-events.js';
import { reconcileRuntimeFlowNodes } from '../model/runtime-flow-nodes.js';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
} from '@xyflow/react';
import { workflowNodeAgentName } from '../../chat/model/assistant-name.js';
import { normalizeTaskStatus } from '../../tasks/model/task-runtime.js';
import { workflowRuntimeDisplayStatus, workflowRuntimeNodeStatus } from '../model/runtime-status.js';
import {
  layoutRuntimeWorkflow,
  workflowArrangementPositions,
  workflowNodeOutcomesFromEvents,
  workflowTraversedLoopNodeIds,
} from '../model/runtime-workflow-layout.js';
import { useWorkflowCanvasWidth } from '../hooks/useWorkflowCanvasWidth.js';
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
import { nodeAttempts, visibleNodeAttempts } from './runtime/node-attempts.js';
import { WorkflowNodeDetailHead } from './runtime/WorkflowNodeDetailHead.jsx';
import { WorkflowNodeAttempts } from './runtime/WorkflowNodeAttempts.jsx';
import { WorkflowDetailResizer } from './runtime/WorkflowDetailResizer.jsx';
import { FitWorkflow, RuntimeSelectionLink } from './runtime/WorkflowCanvasOverlays.jsx';

const EMPTY_OPTIONS = [];

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

const NODE_TYPES = { workflowNode: WorkflowFlowNode };
const EDGE_TYPES = { workflowEdge: WorkflowCanvasEdge };

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

// 面板 = 头部（WorkflowNodeDetailHead）+ 执行列表（WorkflowNodeAttempts）+ 拖拽条
// （WorkflowDetailResizer）。这里只留页签/折叠/滚动这些必须跨子组件存活的状态。
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
  const visibleAttempts = visibleNodeAttempts(attempts, latestResult, node.id);
  const latestAttempt = visibleAttempts.at(-1) || null;
  const canRetry = onRetry
    && ['done', 'failed', 'cancelled'].includes(normalizeTaskStatus(task?.status))
    && visibleAttempts.length > 0
    && ['agent', 'llm', 'tool', 'human_approval'].includes(node.type);
  const retryLatest = React.useCallback(() => onRetry?.(node.id), [node.id, onRetry]);

  return (
    <aside className={`workflow-detail-panel is-${status}${isAgent ? ' has-runtime-tabs' : ''}`} data-node-id={node.id} aria-label={`${node.label || node.id} execution details`}>
      <WorkflowDetailResizer onResize={onResize} onResizeBy={onResizeBy} />
      <WorkflowNodeDetailHead
        node={node}
        status={status}
        statusCopy={STATUS_COPY[status] || status}
        isAgent={isAgent}
        agentOptions={agentOptions}
        detailTab={detailTab}
        tabId={tabId}
        selectTab={selectTab}
        onClose={onClose}
      />
      <div className="workflow-detail-scroll-region">
        <div ref={detailBodyRef} className={`workflow-detail-body chat-message-list${showResult ? '' : ' is-config'}`} aria-live="polite" role={isAgent ? 'tabpanel' : undefined} id={isAgent ? `${tabId}-panel` : undefined} aria-labelledby={isAgent ? `${tabId}-${detailTab}-tab` : undefined}>
          {isAgent && !showResult ? <WorkflowRuntimeConfig value={runtimeConfig} providerOptions={providerOptions} readOnly={configReadOnly} onChange={onRuntimeConfigChange} /> : null}
          {showResult ? (
            <WorkflowNodeAttempts
              node={node}
              task={task}
              attempts={attempts}
              latestResult={latestResult}
              status={status}
              attention={attention}
              agentName={agentName}
              canRetry={canRetry}
              retryLatest={retryLatest}
              historyOpen={historyOpen}
              onHistoryToggle={setHistoryOpen}
            />
          ) : null}
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
  const providerCatalogKey = JSON.stringify(providerOptions.map((item) => ({ id: item.id, provider: item.provider, legacySelectors: item.legacySelectors })));
  const layoutNodes = React.useMemo(() => {
    const configs = JSON.parse(nodeConfigKey);
    const providers = JSON.parse(providerCatalogKey);
    return (workflow?.nodes || []).map((node) => {
    const status = String(node.id) === attentionNodeId ? attentionStatus : workflowRuntimeNodeStatus(node, run, task, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds);
    const id = String(node.id);
    const layoutMeta = layout.meta.get(id);
    const runtimeDetailAvailable = canOpenNodeDetail(node);
    const config = workflowNodeRuntimeConfig(node, task, configs, configReadOnly, providers);
    const provider = providers.find((item) => item.id === config.llm_config_id)?.provider;
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
        ...(node.type === 'agent' ? { runtimeModelId: config.model_id, runtimeProvider: provider || config.llm_config_id || config.provider } : {}),
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
    () => new Map((workflow?.nodes || []).map((node) => [String(node.id), workflowRuntimeNodeStatus(node, run, task, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds)])),
    [activeEventNodeIds, eventNodeOutcomes, run, task, traversedLoopNodeIds, workflow?.nodes],
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
    ? workflowRuntimeNodeStatus(selectedNode, run, task, activeEventNodeIds, eventNodeOutcomes, traversedLoopNodeIds)
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
  const displayRunStatus = run ? workflowRuntimeDisplayStatus(task) : '';
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
          runtimeConfig={workflowNodeRuntimeConfig(selectedNode, task, nodeRuntimeConfigs, configReadOnly, providerOptions)}
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
