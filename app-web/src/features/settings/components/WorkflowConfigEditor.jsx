import React from 'react';
import {
  ReactFlow,
  Background,
  Position,
  ReactFlowProvider,
  applyEdgeChanges,
  useReactFlow,
} from '@xyflow/react';
import {
  normalizeWorkflowNode,
  normalizeWorkflowRow,
  normalizeWorkflowSettings,
  workflowById,
  typeLabelForWorkflowNode,
  workflowVariableCatalog,
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  placeAddedWorkflowNode,
  placeDroppedWorkflowNode,
} from '../../workflow/model/workflow-catalog.js';
import {
  agentCatalogFromSettings,
  agentIconNameForAgentId,
  workflowToolOptionsFromAgentSettings,
} from '../../agents/model/agent-settings.js';
import {
  layoutRuntimeWorkflow,
  workflowArrangementPositions,
} from '../../workflow/model/runtime-workflow-layout.js';
import {
  clearWorkflowLayout,
  saveWorkflowLayout,
  savedWorkflowLayout,
} from '../../workflow/model/workflow-layout-store.js';
import { workflowRouteHandles, workflowRouteKey, workflowReconnectRoute, workflowUsedSideHandles } from '../../workflow/model/workflow-canvas-editing.js';
import { useWorkflowCanvasPreferences } from '../../workflow/hooks/useWorkflowCanvasPreferences.js';
import { saveWorkflowCanvasPreferences, workflowFitOptions } from '../../workflow/model/workflow-canvas-preferences.js';
import { WorkflowCanvasControls } from '../../workflow/components/WorkflowCanvasControls.jsx';
import { useWorkflowCanvasWidth } from '../../workflow/hooks/useWorkflowCanvasWidth.js';
import { EditorToolbar } from './workflow-editor/EditorToolbar.jsx';
import { NodeFields } from './workflow-editor/NodeFields.jsx';
import { NodeInspector } from './workflow-editor/NodeInspector.jsx';
import {
  addWorkflowEdge,
  canConnectWorkflowNodes,
  workflowEdgeId,
} from './workflow-editor/shared.js';
import { WorkflowDropCanvas } from './workflow-editor/WorkflowDropCanvas.jsx';
import {
  WORKFLOW_FIT_OPTIONS,
  WORKFLOW_BRANCHES,
  WorkflowCanvasEdge,
  WorkflowFlowNode,
  workflowEdgeAppearance,
  workflowFeedbackTargetIds,
  workflowNodePorts,
} from '../../workflow/components/WorkflowFlowNode.jsx';

const { useState, useEffect, useRef } = React;
const ReactFlowNS = {
  ReactFlow,
  Background,
  Position,
  ReactFlowProvider,
  applyEdgeChanges,
  useReactFlow,
};

function WorkflowCanvasFitView({ workflowKey, workflowId }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ ...workflowFitOptions(workflowId, WORKFLOW_FIT_OPTIONS), duration: 220 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [fitView, workflowKey, workflowId]);
  return null;
}

const WORKFLOW_REACT_FLOW_NODE_TYPES = { workflowNode: WorkflowFlowNode };
const WORKFLOW_REACT_FLOW_EDGE_TYPES = { workflowEdge: WorkflowCanvasEdge };

export function WorkflowConfigEditor({
  selectedId,
  settings,
  onSettingsChange,
  agentSettings,
  readOnly = false,
  onSave,
  canSave = false,
}) {
  const normalized = normalizeWorkflowSettings(settings);
  const agentOptions = agentCatalogFromSettings(agentSettings).options;
  const toolOptions = workflowToolOptionsFromAgentSettings(agentSettings);
  const workflow = workflowById(normalized, selectedId);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [nodePanelWidth, setNodePanelWidth] = useState(340);
  const [draggedNodeType, setDraggedNodeType] = useState('');
  const [isCanvasDropTarget, setIsCanvasDropTarget] = useState(false);
  // 系统预设拖出来的排布存在本机（workflow-layout-store）：revision 变了就让画布重读一遍，
  // savedPulse 只负责那句会自己消失的「Layout saved」。
  const [layoutRevision, setLayoutRevision] = useState(0);
  const canvasPreferences = useWorkflowCanvasPreferences(selectedId);
  const routes = canvasPreferences.routes || {};
  const [reconnecting, setReconnecting] = useState(null);
  const reconnectingRef = useRef(null);
  const [layoutSavedPulse, setLayoutSavedPulse] = useState(0);
  const canvasRef = useRef(null);
  const canvasNodesRef = useRef([]);
  const nodePanelResizeRef = useRef(null);
  const canvasWidth = useWorkflowCanvasWidth(canvasRef, selectedId);
  const hasWorkflow = Boolean(workflow);
  const workflowNodeIds = workflow?.nodes.map((node) => node.id).join('\n') || '';
  const workflowId = String(workflow?.workflow_id || '').trim();
  // 直接读本机那一份：开销就是一次小 JSON 解析，拖动的重渲染走的是画布自己的内部状态，不经过这里。
  const savedLayout = savedWorkflowLayout(workflowId);

  useEffect(() => {
    if (!layoutSavedPulse) return undefined;
    const timer = window.setTimeout(() => setLayoutSavedPulse(0), 1800);
    return () => window.clearTimeout(timer);
  }, [layoutSavedPulse]);

  useEffect(() => {
    if (!hasWorkflow) {
      setSelectedNodeId('');
      setSelectedEdgeId('');
      return;
    }
    setSelectedNodeId((current) => (
      workflowNodeIds.split('\n').includes(current) ? current : ''
    ));
    setSelectedEdgeId('');
  }, [hasWorkflow, selectedId, workflowNodeIds]);

  useEffect(() => () => {
    if (nodePanelResizeRef.current?.cleanup) nodePanelResizeRef.current.cleanup();
  }, []);

  if (!workflow) return <div className="settings-empty">Select a workflow.</div>;

  const isEditable = !readOnly && workflow.custom;
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = edges.find((edge) => workflowEdgeId(edge) === selectedEdgeId) || null;
  const availableVariables = workflowVariableCatalog(workflow, selectedNodeId);

  const updateWorkflow = (patch) => {
    if (!isEditable) return;
    onSettingsChange((prev) => {
      const next = normalizeWorkflowSettings(prev);
      return {
        ...next,
        custom: next.custom.map((item) => (
          item.workflow_id === workflow.workflow_id ? normalizeWorkflowRow({ ...item, ...patch }, item) : item
        )),
      };
    });
  };
  const flow = ReactFlowNS;
  const ReactFlowCanvas = flow.ReactFlow;
  const Background = flow.Background;
  const layout = layoutRuntimeWorkflow(nodes, edges);
  // 排布的唯一来源：本机存的排布（系统预设走这里，见 onCanvasNodeDragStop）+ 定义里保存的位置
  // （可编辑工作流走这里，见 arrangedNodes）。
  const arrangement = workflowArrangementPositions(workflow);
  // 系统预设：内容不能改（isEditable 为 false），但排布可以自由拖——工具条只给它留「说明 +
  // 已保存 + 重置排布」，没有保存按钮：放手即存，运行页读的就是这一份。
  const showLayoutTools = !readOnly && !workflow.custom;
  // 节点端口（含 loop 的 retry 出口）与回环端口都只有一份判断：两页都从这两个函数取，
  // 不再各写一套（过去配置页把 retry 画在节点顶部、运行页画在左侧，同一条边两页形状不同）。
  const feedbackTargetIds = workflowFeedbackTargetIds(edges, layout.meta);
  const reactNodes = nodes.map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: arrangement.get(String(node.id)) || layout.positions.get(String(node.id)) || { x: 0, y: 0 },
    data: {
      workflowNode: node,
      agentOptions,
      agentIconName: node.type === 'agent'
        ? agentIconNameForAgentId(node.agent_id, agentOptions)
        : undefined,
      feedbackTarget: feedbackTargetIds.has(String(node.id)),
      usedSideHandles: workflowUsedSideHandles(node.id, edges, routes),
      reconnectType: reconnecting?.nodeId === node.id ? reconnecting.type : '',
      ...workflowNodePorts(node, layout.meta.get(String(node.id))),
    },
    selected: node.id === selectedNodeId,
    // 配置页里永远能拖（拖动 = 改图）：可编辑工作流把整张排布写回定义（保存后同步到运行页）；
    // 系统预设的内容不能改，但排布拖完就存在本机（workflow-layout-store），运行页读同一份。
    draggable: true,
  }));
  // 边要按「两边是什么节点」选角色与颜色：角色看目标类型（收尾那条走源类型色 → End 紫的渐变），
  // 颜色是源类型色 → 目标类型色的渐变，所以两端的类型都跟着传进去。
  const nodeTypeById = new Map(nodes.map((node) => [String(node.id), node.type || '']));
  const reactEdges = edges.map((edge) => {
    const edgeId = workflowEdgeId(edge);
    const isSelected = edgeId === selectedEdgeId;
    const appearance = workflowEdgeAppearance(edge, {
      active: isSelected,
      sourceLayout: layout.meta.get(String(edge.from)),
      targetLayout: layout.meta.get(String(edge.to)),
      sourceType: nodeTypeById.get(String(edge.from)) || '',
      sourceNode: nodes.find((node) => String(node.id) === String(edge.from)),
      targetType: nodeTypeById.get(String(edge.to)) || '',
    });
    return {
      id: edgeId,
      source: edge.from,
      target: edge.to,
      ...appearance,
      ...workflowRouteHandles(edge, routes),
      data: { ...appearance.data, routeKey: workflowRouteKey(edge) },
      reconnectable: !readOnly,
      selected: isSelected,
    };
  });
  /**
   * 把画布上当前看到的排布写进工作流定义：拖动节点、新增节点后调用，保存后运行页读的就是
   * 这份位置（workflowArrangementPositions）。overrides 是新拖出的位置（优先于画布上旧的）。
   */
  const arrangedNodes = (overrides = new Map()) => {
    const displayed = new Map(
      (canvasNodesRef.current || []).map((node) => [String(node.id), node.position]),
    );
    return nodes.map((node) => {
      const id = String(node.id);
      const candidate = [overrides.get(id), displayed.get(id), arrangement.get(id)]
        .find((value) => Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y)));
      if (!candidate) return node;
      const position = { x: Math.round(Number(candidate.x)), y: Math.round(Number(candidate.y)) };
      if (node.position?.x === position.x && node.position?.y === position.y) return node;
      return { ...node, position };
    });
  };
  // 存排布时取整张画布（不是只存拖过的那一个节点）：画布上看到什么样，运行页就读到什么。
  const capturedLayoutPositions = (overrides = new Map()) => {
    const displayed = new Map(
      (canvasNodesRef.current || []).map((node) => [String(node.id), node.position]),
    );
    const positions = {};
    for (const node of nodes) {
      const id = String(node.id);
      const candidate = [overrides.get(id), displayed.get(id), arrangement.get(id), layout.positions.get(id)]
        .find((value) => Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y)));
      if (!candidate) continue;
      positions[id] = { x: Math.round(Number(candidate.x)), y: Math.round(Number(candidate.y)) };
    }
    return positions;
  };
  const onCanvasNodeDragStop = (_, node, draggedNodes) => {
    const overrides = new Map(
      [node, ...(draggedNodes || [])].map((item) => [String(item.id), item.position]),
    );
    if (isEditable) {
      const nextNodes = arrangedNodes(overrides);
      if (nextNodes.some((item, index) => item !== nodes[index])) updateWorkflow({ nodes: nextNodes });
      return;
    }
    if (readOnly || workflow.custom) return;
    // 系统预设：拖完就存（本机就是这样一份），不需要第二个「保存」动作。
    const stored = saveWorkflowLayout(workflow.workflow_id, capturedLayoutPositions(overrides));
    setLayoutRevision((value) => value + 1);
    // 存不下（隐私模式等）就不报「已保存」：宁可不说话，也不说假话。
    if (stored) setLayoutSavedPulse((value) => value + 1);
  };
  const reconnectRoute = (edge, connection) => workflowReconnectRoute(edge, connection, reconnectingRef.current?.type, routes[edge?.data?.routeKey]);
  const onReconnect = (edge, connection) => {
    if (readOnly) return;
    const route = reconnectRoute(edge, connection);
    if (!route) return;
    const stored = saveWorkflowCanvasPreferences(workflow.workflow_id, { routes: { ...routes, [edge.data.routeKey]: route } });
    if (stored) setLayoutSavedPulse((value) => value + 1);
  };
  const resetWorkflowLayout = () => {
    if (!workflowId) return;
    clearWorkflowLayout(workflowId);
    saveWorkflowCanvasPreferences(workflowId, { routes: {} });
    setLayoutRevision((value) => value + 1);
  };
  const onReactFlowNodesChange = (changes) => {
    if (!isEditable) return;
    const removeIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
    if (!removeIds.size) return;
    const removableIds = new Set(nodes.filter((node) => removeIds.has(node.id) && !['start', 'output'].includes(node.type)).map((node) => node.id));
    if (!removableIds.size) return;
    updateWorkflow({
      nodes: nodes.filter((node) => !removableIds.has(node.id)),
      edges: edges.filter((edge) => !removableIds.has(edge.from) && !removableIds.has(edge.to)),
    });
    if (removableIds.has(selectedNodeId)) setSelectedNodeId('');
    setSelectedEdgeId('');
  };
  const onReactFlowEdgesChange = (changes) => {
    if (!isEditable || !flow.applyEdgeChanges) return;
    if (!changes.some((change) => change.type !== 'select')) return;
    const updated = flow.applyEdgeChanges(changes, reactEdges);
    if (selectedEdgeId && !updated.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId('');
    updateWorkflow({
      // Visual handle ids are not execution branches. Preserve original definitions on removal.
      edges: edges.filter((edge) => updated.some((item) => item.id === workflowEdgeId(edge))),
    });
  };
  const onReactFlowConnect = (connection) => {
    if (connection?.sourceHandle?.startsWith('visual-') || connection?.targetHandle?.startsWith('visual-')) return;
    if (!isEditable || !connection?.source || !connection?.target || connection.source === connection.target) return;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!canConnectWorkflowNodes(source, target)) return;
    const allowedBranches = WORKFLOW_BRANCHES[source.type] || [];
    const branch = allowedBranches.length ? connection.sourceHandle : '';
    if (allowedBranches.length && !allowedBranches.includes(branch)) return;
    if (source.type === 'loop' && branch === 'retry' && ['start', 'output', 'loop'].includes(target.type)) return;
    if (source.type === 'loop' && branch === 'exhausted' && target.type !== 'output') return;
    updateWorkflow({ edges: addWorkflowEdge(edges, connection.source, connection.target, branch) });
  };
  const updateNode = (nodeId, patch) => {
    updateWorkflow({
      nodes: nodes.map((node) => (
        node.id === nodeId ? normalizeWorkflowNode({ ...node, ...patch }, node) : node
      )),
    });
  };
  const addNode = (type, dropPosition = null) => {
    const baseType = type || 'agent';
    let count = nodes.filter((node) => node.type === baseType).length + 1;
    while (nodes.some((node) => node.id === `${baseType}_${count}`)) count += 1;
    const id = `${baseType}_${count}`;
    const newNode = {
      id,
      type: baseType,
      label: typeLabelForWorkflowNode(baseType),
      ...(baseType === 'agent' ? {
        agent_id: agentOptions[0]?.id || 'preset.general',
        prompt: '',
        input: '{{input.message}}',
        input_mapping: {
          message: '{{input.message}}',
          attachments: '{{input.attachments}}',
          image_attachments: '{{input.image_attachments}}',
        },
      } : {}),
      ...(baseType === 'llm' ? { prompt: '{{input.message}}', response_format: 'text' } : {}),
      ...(baseType === 'tool' ? { tool_name: toolOptions[0]?.id || '', arguments: { query: '{{input.message}}' } } : {}),
      ...(baseType === 'condition' ? { expression: '{{nodes.agent_1.success}} == true' } : {}),
      ...(baseType === 'human_approval' ? {
        input: {
          title: 'Approval required',
          summaryText: '{{input.message}}',
          payload: '{{input.message}}',
        },
      } : {}),
      ...(baseType === 'loop' ? { max_loops: 3 } : {}),
      ...(baseType === 'output' ? {
        output_mode: 'json_object',
        output: '{{input.message}}',
        output_mapping: DEFAULT_WORKFLOW_OUTPUT_MAPPING,
        output_schema: DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
      } : {}),
    };
    const placed = dropPosition
      ? placeDroppedWorkflowNode(nodes, newNode, dropPosition)
      : placeAddedWorkflowNode(nodes, newNode);
    // 新节点落在算好的位置；其余节点连现有排布一起写进定义（否则运行页只认得新节点那一个）。
    const placedPositions = new Map(
      placed.nodes.map((item) => [String(item.id), item.position]),
    );
    const placedNode = placed.nodes.find((item) => String(item.id) === id) || { ...newNode, position: placed.position };
    updateWorkflow({ nodes: [...arrangedNodes(placedPositions), placedNode] });
    setSelectedNodeId(id);
    setSelectedEdgeId('');
  };
  const deleteNode = (nodeId) => {
    const target = nodes.find((node) => node.id === nodeId);
    if (!target || target.type === 'start' || target.type === 'output') return;
    updateWorkflow({
      nodes: nodes.filter((node) => node.id !== nodeId),
      edges: edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    });
    setSelectedNodeId('');
    setSelectedEdgeId('');
  };
  const deleteEdge = (edgeId) => {
    if (!edgeId) return;
    updateWorkflow({ edges: edges.filter((edge) => workflowEdgeId(edge) !== edgeId) });
    setSelectedEdgeId('');
  };

  const showNodePanel = Boolean(selectedNode);
  const clampedNodePanelWidth = Math.max(280, Math.min(720, Math.round(nodePanelWidth || 340)));

  const startNodePanelResize = (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    if (nodePanelResizeRef.current?.cleanup) nodePanelResizeRef.current.cleanup();

    const startX = event.clientX;
    const startWidth = clampedNodePanelWidth;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMove = (moveEvent) => {
      const nextWidth = startWidth + (startX - moveEvent.clientX);
      setNodePanelWidth(Math.max(280, Math.min(720, Math.round(nextWidth))));
    };
    const onUp = () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      nodePanelResizeRef.current = null;
    };

    nodePanelResizeRef.current = { cleanup: onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div
      className={`settings-editor-form settings-workflow-form${showNodePanel ? ' has-node-panel' : ''}`}
      style={showNodePanel ? { '--workflow-node-panel-width': `${clampedNodePanelWidth}px` } : undefined}
    >
      <div className="workflow-builder">
        <EditorToolbar
          isEditable={isEditable}
          canSave={canSave}
          nodeTypes={normalized.node_types}
          draggedNodeType={draggedNodeType}
          hasSelectedEdge={Boolean(selectedEdge)}
          onNodeDragStart={setDraggedNodeType}
          onNodeDragEnd={() => {
            setDraggedNodeType('');
            setIsCanvasDropTarget(false);
          }}
          onAddNode={addNode}
          onDeleteEdge={() => deleteEdge(selectedEdgeId)}
          onSave={onSave}
        />
        <div ref={canvasRef} className={`workflow-canvas${isCanvasDropTarget ? ' is-node-drag-over' : ''}`}>
          {ReactFlowCanvas ? (
            <ReactFlowProvider>
              <WorkflowDropCanvas
                workflowKey={`${workflow.workflow_id}:${workflow.version || ''}`}
                layoutRevision={layoutRevision}
                nodes={reactNodes}
                edges={reactEdges}
                nodeTypes={WORKFLOW_REACT_FLOW_NODE_TYPES}
                edgeTypes={WORKFLOW_REACT_FLOW_EDGE_TYPES}
                canvasNodesRef={canvasNodesRef}
                draggedNodeType={draggedNodeType}
                onDropNode={addNode}
                onDropTargetChange={setIsCanvasDropTarget}
                onNodeDragStop={onCanvasNodeDragStop}
                onNodeClick={(_, node) => {
                  setSelectedNodeId(node.id);
                  setSelectedEdgeId('');
                }}
                onEdgeClick={(_, edge) => {
                  setSelectedEdgeId(edge.id);
                  setSelectedNodeId('');
                }}
                onPaneClick={() => {
                  setSelectedNodeId('');
                  setSelectedEdgeId('');
                }}
                onNodesChange={onReactFlowNodesChange}
                onEdgesChange={onReactFlowEdgesChange}
                onConnect={onReactFlowConnect}
                onReconnectStart={(_, edge, anchoredType) => {
                  const type = anchoredType === 'source' ? 'target' : 'source';
                  reconnectingRef.current = { edge, type, nodeId: edge[type] };
                  setReconnecting(reconnectingRef.current);
                }}
                onReconnect={onReconnect}
                onReconnectEnd={() => { reconnectingRef.current = null; setReconnecting(null); }}
                isValidConnection={(connection) => reconnecting ? Boolean(reconnectRoute(reconnecting.edge, connection))
                  : isEditable && !connection.sourceHandle?.startsWith('visual-') && !connection.targetHandle?.startsWith('visual-')}
                edgesReconnectable={!readOnly}
                reconnectRadius={14}
                nodesDraggable
                nodesConnectable={isEditable || Boolean(reconnecting)}
                edgesFocusable={isEditable}
                elementsSelectable
                deleteKeyCode={null}
                connectionRadius={46}
                fitView
                fitViewOptions={workflowFitOptions(workflow.workflow_id, WORKFLOW_FIT_OPTIONS)}
                onMoveEnd={(event, viewport) => {
                  if (event) saveWorkflowCanvasPreferences(workflow.workflow_id, { zoom: viewport.zoom });
                }}
                minZoom={0.3}
                maxZoom={1.4}
                snapToGrid={false}
                connectionLineType="straight"
                defaultEdgeOptions={{
                  type: 'straight',
                  style: { strokeWidth: 2 },
                }}
                proOptions={{ hideAttribution: true }}
              >
                {Background ? <Background gap={30} size={1.2} color="rgba(150, 184, 240, 0.07)" /> : null}
                <WorkflowCanvasControls workflowId={workflow.workflow_id}
                  onResetLayout={showLayoutTools ? resetWorkflowLayout : undefined}
                  resetLayoutDisabled={!savedLayout.size && !Object.keys(routes).length} />
                <WorkflowCanvasFitView workflowId={workflow.workflow_id} workflowKey={`${workflow.workflow_id}:${layout.columns}:${layout.rowCount}:${canvasWidth}`} />
              </WorkflowDropCanvas>
            </ReactFlowProvider>
          ) : (
            <div className="settings-empty">React Flow failed to load.</div>
          )}
          {/* 排布存下来了：拖完在画布右上角闪一下（缩放控件左边），不吃指针。 */}
          {showLayoutTools ? (
            <span className={`workflow-layout-status${layoutSavedPulse ? ' is-visible' : ''}`} role="status">
              {layoutSavedPulse ? 'Layout saved' : ''}
            </span>
          ) : null}
        </div>
      </div>
      {showNodePanel ? (
        <NodeInspector
          selectedNode={selectedNode}
          agentOptions={agentOptions}
          isEditable={isEditable}
          panelWidth={clampedNodePanelWidth}
          onResizeStart={startNodePanelResize}
          onDelete={() => deleteNode(selectedNode.id)}
        >
          <NodeFields selectedNode={selectedNode} workflowInputSchema={workflow.input_schema}
            agentOptions={agentOptions} toolOptions={toolOptions}
            availableVariables={availableVariables} isEditable={isEditable}
            updateNode={updateNode} />
        </NodeInspector>
      ) : null}
    </div>
  );
}
