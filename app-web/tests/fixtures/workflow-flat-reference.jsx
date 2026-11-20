import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Position } from '@xyflow/react';
import { WorkflowFlowNode, WorkflowCanvasEdge, workflowEdgeAppearance } from '../../src/features/workflow/components/WorkflowFlowNode.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/workflow-runtime.css';

const nodeTypes = { workflowNode: WorkflowFlowNode };
const edgeTypes = { workflowEdge: WorkflowCanvasEdge };
const nodes = [
  { id: 'start', type: 'workflowNode', position: { x: 36, y: 18 }, data: { workflowNode: { type: 'start', label: 'Start' }, runtimeStatus: 'done', sourcePosition: Position.Bottom } },
  { id: 'agent', type: 'workflowNode', position: { x: 36, y: 150 }, data: { workflowNode: { type: 'agent', label: 'Simple Agent' }, agentIconName: 'box', runtimeStatus: 'running', targetPosition: Position.Top } },
];
const edges = [{ id: 'link', source: 'start', target: 'agent', ...workflowEdgeAppearance({}, { sourceType: 'start', targetType: 'agent' }) }];
createRoot(document.getElementById('root')).render(<div className="workflow-canvas workflow-run-canvas" style={{ height: '100vh', border: 0, borderRadius: 0, background: '#000' }}><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={{ x: 0, y: 0, zoom: 1.66 }} nodesDraggable={false} proOptions={{ hideAttribution: true }} /></div>);
