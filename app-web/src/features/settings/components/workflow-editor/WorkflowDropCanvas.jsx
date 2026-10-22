import React from 'react';
import {
  ReactFlow,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import {
  placeDroppedWorkflowNode,
  typeLabelForWorkflowNode,
} from '../../../workflow/model/workflow-catalog.js';
import { workflowSnapPosition } from '../../../workflow/model/workflow-canvas-editing.js';
import { WORKFLOW_NODE_DRAG_TYPE } from './shared.js';

const { useState, useEffect, useRef } = React;

// 画布本体：节点/边的视觉交给 WorkflowFlowNode，这里只管拖放、吸附与画布内部状态。
// 所有持久化动作通过 props 上的回调交回 WorkflowConfigEditor（状态仍由主编辑器持有）。
export function WorkflowDropCanvas({
  nodes,
  workflowKey,
  layoutRevision,
  canvasNodesRef,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
  draggedNodeType,
  onDropNode,
  onDropTargetChange,
  children,
  ...props
}) {
  const { screenToFlowPosition, getNodes, getInternalNode, getZoom } = useReactFlow();
  const [snapPreview, setSnapPreview] = useState(null);
  const snapFor = (node, event, draggedNodes) => event.altKey || draggedNodes?.length > 1 ? null
    : workflowSnapPosition(node, getNodes(), props.edges, { zoom: getZoom(), internalNode: getInternalNode });
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState(nodes);
  const [dropPreview, setDropPreview] = useState(null);
  const isNodeDraggingRef = useRef(false);
  const draggedNodePositionsRef = useRef(new Map());
  const previousWorkflowKeyRef = useRef(workflowKey);
  const previousLayoutRevisionRef = useRef(layoutRevision);
  const isWorkflowNodeDrag = (event) => (
    Array.from(event.dataTransfer?.types || []).includes(WORKFLOW_NODE_DRAG_TYPE)
  );

  useEffect(() => {
    if (canvasNodesRef) canvasNodesRef.current = canvasNodes;
  }, [canvasNodes, canvasNodesRef]);

  useEffect(() => {
    // 换工作流、或排布被存下/重置（layoutRevision 变）：画布不再记着上次拖到哪，回到传进来的位置。
    const resetPositions = previousWorkflowKeyRef.current !== workflowKey
      || previousLayoutRevisionRef.current !== layoutRevision;
    if (resetPositions) draggedNodePositionsRef.current.clear();
    previousWorkflowKeyRef.current = workflowKey;
    previousLayoutRevisionRef.current = layoutRevision;
    if (isNodeDraggingRef.current) return;
    setCanvasNodes(nodes.map((node) => {
      const draggedPosition = draggedNodePositionsRef.current.get(node.id);
      return draggedPosition ? { ...node, position: draggedPosition } : node;
    }));
  }, [layoutRevision, nodes, setCanvasNodes, workflowKey]);

  useEffect(() => {
    if (!draggedNodeType) setDropPreview(null);
  }, [draggedNodeType]);

  const previewNode = dropPreview
    ? {
      id: '__workflow_drop_preview__',
      type: 'workflowNode',
      position: dropPreview.position,
      data: {
        workflowNode: {
          id: '__workflow_drop_preview__',
          type: dropPreview.type,
          label: typeLabelForWorkflowNode(dropPreview.type),
        },
        agentIconName: dropPreview.type === 'agent' ? 'workflow-agent' : undefined,
        dropPreview: true,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      className: 'workflow-drop-preview-node',
    }
    : null;

  return (
    <ReactFlow
      {...props}
      nodes={previewNode ? [...canvasNodes, previewNode] : canvasNodes}
      onNodesChange={(changes) => {
        onCanvasNodesChange(changes);
        const persistedChanges = changes.filter((change) => change.type === 'remove');
        if (persistedChanges.length) onNodesChange?.(persistedChanges);
      }}
      onNodeDragStart={(event, node, draggedNodes) => {
        isNodeDraggingRef.current = true;
        onNodeDragStart?.(event, node, draggedNodes);
      }}
      onNodeDrag={(event, node, draggedNodes) => {
        setSnapPreview(snapFor(node, event, draggedNodes));
      }}
      onNodeDragStop={(event, node, draggedNodes) => {
        const snap = snapFor(node, event, draggedNodes);
        const landed = { ...node, position: snap?.position || node.position };
        const landedNodes = (draggedNodes || [node]).map((item) => item.id === node.id ? landed : item);
        for (const item of landedNodes) draggedNodePositionsRef.current.set(item.id, item.position);
        draggedNodePositionsRef.current.set(node.id, landed.position);
        setCanvasNodes((current) => current.map((item) => item.id === node.id ? { ...item, position: landed.position } : item));
        setSnapPreview(null);
        isNodeDraggingRef.current = false;
        onNodeDragStop?.(event, landed, landedNodes);
      }}
      onDragEnter={(event) => {
        if (!isWorkflowNodeDrag(event)) return;
        event.preventDefault();
        onDropTargetChange(true);
      }}
      onDragOver={(event) => {
        if (!isWorkflowNodeDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        onDropTargetChange(true);
        const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const previewPosition = placeDroppedWorkflowNode(
          [],
          { id: '__workflow_drop_preview__' },
          flowPosition,
        ).position;
        setDropPreview((current) => (
          current?.type === draggedNodeType
          && current.position.x === previewPosition.x
          && current.position.y === previewPosition.y
            ? current
            : { type: draggedNodeType, position: previewPosition }
        ));
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        onDropTargetChange(false);
        setDropPreview(null);
      }}
      onDrop={(event) => {
        const nodeType = event.dataTransfer?.getData(WORKFLOW_NODE_DRAG_TYPE);
        if (!nodeType) return;
        event.preventDefault();
        onDropTargetChange(false);
        setDropPreview(null);
        onDropNode(nodeType, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
    >
      {children}
      {snapPreview?.guides.length ? (
        <ViewportPortal>
          <svg className="workflow-snap-guides" aria-hidden="true">
            <rect x={snapPreview.position.x} y={snapPreview.position.y} width={snapPreview.width} height={snapPreview.height} rx={14} />
            {snapPreview.guides.map((guide) => <line key={guide.axis}
              x1={guide.axis === 'x' ? guide.value : guide.start} y1={guide.axis === 'y' ? guide.value : guide.start}
              x2={guide.axis === 'x' ? guide.value : guide.end} y2={guide.axis === 'y' ? guide.value : guide.end} />)}
          </svg>
        </ViewportPortal>
      ) : null}
    </ReactFlow>
  );
}
