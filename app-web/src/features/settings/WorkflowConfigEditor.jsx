// @haish-esm
import React from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
  applyEdgeChanges,
  useReactFlow,
  useNodesState,
} from '@xyflow/react';
import {
  normalizeWorkflowNode,
  normalizeWorkflowEdge,
  normalizeWorkflowRow,
  normalizeWorkflowSettings,
  workflowById,
  typeLabelForWorkflowNode,
  workflowOutputFields,
  workflowSchemaFields,
  workflowUpstreamNodeIds,
  workflowFriendlyVariableLabel,
  workflowVariableCatalog,
  sanitizeWorkflowTemplateValue,
  workflowTokenRangeAt,
  workflowArgumentsText,
  workflowParameterEntries,
  workflowTemplateWithParameterAliases,
  reconcileWorkflowParameterTemplate,
  WORKFLOW_OUTPUT_FIELD_OPTIONS,
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  workflowOutputFieldOptions,
  workflowOutputMappingEntries,
  workflowTemplateVariablePath,
  workflowVariableTypeForValue,
  buildWorkflowOutputPatch,
  payloadForCustomWorkflow,
  placeAddedWorkflowNode,
  placeDroppedWorkflowNode,
} from '../../lib/workflow-catalog.js';
import {
  agentCatalogFromSettings,
  workflowToolOptionsFromAgentSettings,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_INPUT_SCHEMA,
  SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
} from '../../lib/agent-catalog.js';
import {
  FieldRow,
  SettingsLucideIcon,
  SettingsMenuSelect,
  SettingsTooltipIconButton,
  agentIconNameForAgentId,
} from './settings-ui.jsx';
import {
  WorkflowVariablePicker,
  WorkflowVariableSelect,
  WorkflowParameterEditor,
  WorkflowTemplateTextarea,
  WorkflowSchemaList,
  WorkflowOutputContract,
} from './WorkflowFormControls.jsx';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';

const { useState, useEffect, useRef, useMemo } = React;
const ReactFlowNS = {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
  applyEdgeChanges,
  useReactFlow,
};
const WORKFLOW_NODE_DRAG_TYPE = 'application/x-haish-workflow-node';

const WORKFLOW_NODE_META = {
  start: { icon: 'play' },
  agent: { icon: 'workflow-agent' },
  llm: { icon: 'workflow-llm' },
  tool: { icon: 'workflow-tool' },
  condition: { icon: 'workflow-condition' },
  output: { icon: 'circle-check' },
};

function workflowNodeMeta(nodeType) {
  return WORKFLOW_NODE_META[nodeType] || { icon: 'box' };
}

export function WorkflowFlowNode({ data, selected }) {
  const flow = ReactFlowNS;
  const Handle = flow.Handle;
  const Position = flow.Position || { Left: 'left', Right: 'right', Bottom: 'bottom' };
  const node = data?.workflowNode || {};
  const nodeType = node.type || 'agent';
  const meta = workflowNodeMeta(nodeType);
  const incomingBranches = Array.isArray(data?.incomingBranches) ? data.incomingBranches : [];
  const iconName = nodeType === 'agent'
    ? (data?.agentIconName || agentIconNameForAgentId(node.agent_id, data?.agentOptions))
    : meta.icon;
  return (
    <div className={`workflow-flow-node ${nodeType} ${selected ? 'active' : ''}${data?.dropPreview ? ' is-drop-preview' : ''}`}>
      {Handle && nodeType !== 'start' ? (
        <>
          <Handle type="target" position={Position.Left} />
          {incomingBranches.includes('true') ? (
            <Handle
              id="condition-true"
              className="workflow-condition-target-handle is-true"
              type="target"
              position={Position.Left}
              aria-label="True branch input"
              style={{ top: '24%' }}
            />
          ) : null}
          {incomingBranches.includes('false') ? (
            <Handle
              id="condition-false"
              className="workflow-condition-target-handle is-false"
              type="target"
              position={Position.Left}
              aria-label="False default branch input"
              style={{ top: '76%' }}
            />
          ) : null}
        </>
      ) : null}
      <span className="workflow-flow-node-icon" aria-hidden="true">
        <SettingsLucideIcon name={iconName} size={16} />
      </span>
      <span className="workflow-flow-node-copy">
        <strong>{node.label}</strong>
      </span>
      {Handle && nodeType === 'condition' ? (
        <>
          <Handle
            id="true"
            className="workflow-condition-handle is-true"
            type="source"
            position={Position.Right}
            aria-label="True condition branch"
          />
          <Handle
            id="false"
            className="workflow-condition-handle is-false"
            type="source"
            position={Position.Bottom}
            aria-label="False default branch"
            style={{ left: 'calc(100% - 18px)' }}
          />
        </>
      ) : null}
      {Handle && nodeType !== 'condition' && nodeType !== 'output'
        ? <Handle type="source" position={Position.Right} />
        : null}
    </div>
  );
}

function WorkflowCanvasFitView({ workflowKey }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.18, minZoom: 0.45, maxZoom: 1.15, duration: 220 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [fitView, workflowKey]);
  return null;
}

function WorkflowDropCanvas({
  nodes,
  onNodesChange,
  onNodeDragStart,
  onNodeDragStop,
  draggedNodeType,
  onDropNode,
  onDropTargetChange,
  ...props
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] = useNodesState(nodes);
  const [dropPreview, setDropPreview] = useState(null);
  const isNodeDraggingRef = useRef(false);
  const isWorkflowNodeDrag = (event) => (
    Array.from(event.dataTransfer?.types || []).includes(WORKFLOW_NODE_DRAG_TYPE)
  );

  useEffect(() => {
    if (!isNodeDraggingRef.current) setCanvasNodes(nodes);
  }, [nodes, setCanvasNodes]);

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
      onNodeDragStop={(event, node, draggedNodes) => {
        isNodeDraggingRef.current = false;
        onNodeDragStop?.(event, node, draggedNodes);
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
    />
  );
}

const WORKFLOW_REACT_FLOW_NODE_TYPES = { workflowNode: WorkflowFlowNode };

export function canConnectWorkflowNodes(source, target) {
  return Boolean(source && target && source.id !== target.id && source.type !== 'output' && target.type !== 'start');
}

export function workflowEdgeId(edge) {
  return `${edge?.from || ''}:${edge?.branch || ''}->${edge?.to || ''}`;
}

export function addWorkflowEdge(edges, from, to, branch = '') {
  if (!from || !to || from === to) return edges;
  const normalizedBranch = branch === 'default' ? 'false' : branch;
  if (edges.some((edge) => (
    edge.from === from
    && edge.to === to
    && (edge.branch || '') === normalizedBranch
  ))) return edges;
  if (normalizedBranch === 'true' || normalizedBranch === 'false') {
    return [
      ...edges.filter((edge) => !(edge.from === from && edge.branch === normalizedBranch)),
      { from, to, branch: normalizedBranch },
    ];
  }
  if (edges.some((edge) => edge.from === from && edge.to === to && !edge.branch)) return edges;
  return [...edges, { from, to }];
}

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
  const nodePanelResizeRef = useRef(null);

  useEffect(() => {
    if (!workflow) {
      setSelectedNodeId('');
      setSelectedEdgeId('');
      return;
    }
    setSelectedNodeId((current) => (
      workflow.nodes.some((node) => node.id === current) ? current : ''
    ));
    setSelectedEdgeId('');
  }, [selectedId, workflow?.nodes?.length]);

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
  const typeOptions = normalized.node_types
    .filter((item) => item.id !== 'output')
    .map((item) => ({ id: item.id, label: item.label }));

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
  const Controls = flow.Controls;
  const MarkerType = flow.MarkerType || {};
  const reactNodes = nodes.map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0),
    },
    data: {
      workflowNode: node,
      agentOptions,
      incomingBranches: edges
        .filter((edge) => edge.to === node.id && edge.branch)
        .map((edge) => edge.branch),
      agentIconName: node.type === 'agent'
        ? agentIconNameForAgentId(node.agent_id, agentOptions)
        : undefined,
    },
    selected: node.id === selectedNodeId,
    draggable: isEditable,
  }));
  const reactEdges = edges.map((edge) => {
    const edgeId = workflowEdgeId(edge);
    const isSelected = edgeId === selectedEdgeId;
    const branchColor = edge.branch === 'true'
      ? 'rgba(120, 218, 139, 0.42)'
      : edge.branch === 'false'
        ? 'rgba(176, 196, 220, 0.3)'
        : 'rgba(185, 196, 216, 0.26)';
    return {
    id: edgeId,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.branch || undefined,
    targetHandle: edge.branch ? `condition-${edge.branch}` : undefined,
    type: edge.branch ? 'smoothstep' : 'straight',
    pathOptions: edge.branch ? { borderRadius: 10, offset: 20 } : undefined,
    label: edge.branch === 'true'
      ? 'True'
      : edge.branch === 'false'
        ? 'False · default'
        : undefined,
    labelStyle: edge.branch
      ? {
        fill: edge.branch === 'true'
          ? 'rgba(144, 226, 158, 0.92)'
          : 'rgba(205, 215, 232, 0.68)',
        fontSize: 10,
        fontWeight: 700,
      }
      : undefined,
    labelBgStyle: edge.branch ? { fill: 'rgba(9, 14, 24, 0.92)' } : undefined,
    labelBgPadding: edge.branch ? [5, 3] : undefined,
    labelBgBorderRadius: edge.branch ? 5 : undefined,
    selected: isSelected,
    interactionWidth: 28,
    zIndex: edge.branch ? 2 : 0,
    animated: isSelected,
    style: {
      stroke: isSelected ? 'rgba(105, 200, 246, 0.58)' : branchColor,
      strokeWidth: isSelected ? 1.8 : 1.5,
    },
    markerEnd: MarkerType.ArrowClosed
      ? {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: isSelected ? 'rgba(105, 200, 246, 0.64)' : branchColor,
      }
      : undefined,
    };
  });
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
      edges: updated
        .filter((edge) => edge.source && edge.target)
        .map((edge) => ({
          from: edge.source,
          to: edge.target,
          ...(edge.sourceHandle === 'true' || edge.sourceHandle === 'false'
            ? { branch: edge.sourceHandle }
            : {}),
        })),
    });
  };
  const onReactFlowConnect = (connection) => {
    if (!isEditable || !connection?.source || !connection?.target || connection.source === connection.target) return;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!canConnectWorkflowNodes(source, target)) return;
    const branch = source.type === 'condition' ? connection.sourceHandle : '';
    if (source.type === 'condition' && branch !== 'true' && branch !== 'false') return;
    updateWorkflow({ edges: addWorkflowEdge(edges, connection.source, connection.target, branch) });
  };
  const onReactFlowNodeDragStop = (_, draggedNode) => {
    if (!isEditable) return;
    updateWorkflow({
      nodes: nodes.map((node) => (
        node.id === draggedNode.id ? normalizeWorkflowNode({ ...node, position: draggedNode.position }, node) : node
      )),
    });
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
    updateWorkflow({ nodes: placed.nodes });
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
  const deleteSelection = () => {
    if (selectedEdge) {
      deleteEdge(selectedEdgeId);
      return;
    }
    if (selectedNode) deleteNode(selectedNode.id);
  };

  const renderNodeFields = () => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'start') {
      return (
        <>
          <WorkflowSchemaList
            title="Inputs"
            fields={workflowSchemaFields(selectedNode.input_schema || workflow.input_schema)}
          />
        </>
      );
    }
    const parameterEntries = workflowParameterEntries(selectedNode.parameters);
    const renderInputParameters = (templateKey, templateValue, children) => (
      <WorkflowParameterEditor
        parameters={parameterEntries}
        variables={availableVariables}
        disabled={!isEditable}
        onChange={(parameters) => updateNode(selectedNode.id, {
          parameters,
          [templateKey]: reconcileWorkflowParameterTemplate(
            templateValue,
            parameterEntries,
            parameters,
          ),
        })}
      >
        {children}
      </WorkflowParameterEditor>
    );
    if (selectedNode.type === 'agent') {
      const input = selectedNode.input ?? selectedNode.input_mapping?.message ?? '{{input.message}}';
      return (
        <>
          <FieldRow label="agent">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={selectedNode.agent_id || agentOptions[0]?.id || 'preset.general'}
              options={agentOptions.map((item) => ({ id: item.id, label: item.label }))}
              onChange={(agent_id) => updateNode(selectedNode.id, { agent_id })}
              disabled={!isEditable}
            />
          </FieldRow>
          <FieldRow label="prompt" hint="Static instructions only. Dynamic variables belong in Input so the agent prefix stays cacheable.">
            <textarea
              value={selectedNode.prompt || ''}
              disabled={!isEditable}
              rows={5}
              placeholder="Stable instructions for this agent node"
              onChange={(event) => updateNode(selectedNode.id, { prompt: event.target.value })}
            />
          </FieldRow>
          {renderInputParameters('input', input, (
            <WorkflowTemplateTextarea
              title="Input"
              hint="Dynamic user message sent after the cached agent prefix."
              value={workflowTemplateWithParameterAliases(input, parameterEntries)}
              disabled={!isEditable}
              rows={5}
              showVariables={false}
              embedded
              onChange={(value) => updateNode(selectedNode.id, {
                input: workflowTemplateWithParameterAliases(value, parameterEntries),
              })}
            />
          ))}
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'llm') {
      const prompt = selectedNode.prompt || '{{input.message}}';
      return (
        <>
          {renderInputParameters('prompt', prompt, (
            <WorkflowTemplateTextarea
              title="Prompt"
              value={workflowTemplateWithParameterAliases(prompt, parameterEntries)}
              disabled={!isEditable}
              rows={6}
              showVariables={false}
              embedded
              onChange={(value) => updateNode(selectedNode.id, {
                prompt: workflowTemplateWithParameterAliases(value, parameterEntries),
              })}
            />
          ))}
          <FieldRow label="response format">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={selectedNode.response_format || 'text'}
              options={[
                { id: 'text', label: 'Text' },
                { id: 'json_object', label: 'JSON object' },
              ]}
              onChange={(response_format) => updateNode(selectedNode.id, { response_format })}
              disabled={!isEditable}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'tool') {
      const argumentsValue = selectedNode.arguments ?? { query: '{{input.message}}' };
      return (
        <>
          <FieldRow label="tool name">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={selectedNode.tool_name || ''}
              options={toolOptions}
              onChange={(tool_name) => updateNode(selectedNode.id, { tool_name })}
              disabled={!isEditable}
              placeholder="Select a tool"
              header="project tools"
            />
          </FieldRow>
          {renderInputParameters('arguments', argumentsValue, (
            <WorkflowTemplateTextarea
              title="Arguments JSON"
              hint="Objects and arrays render variables recursively."
              value={workflowArgumentsText(workflowTemplateWithParameterAliases(argumentsValue, parameterEntries))}
              disabled={!isEditable}
              rows={6}
              showVariables={false}
              embedded
              onChange={(value) => updateNode(selectedNode.id, {
                arguments: workflowTemplateWithParameterAliases(value, parameterEntries),
              })}
            />
          ))}
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'condition') {
      const expression = selectedNode.expression || '';
      return (
        <>
          {renderInputParameters('expression', expression, (
            <WorkflowTemplateTextarea
              title="Expression"
              hint="Supports equals, not equals, contains, exists, and truthiness."
              value={workflowTemplateWithParameterAliases(expression, parameterEntries)}
              disabled={!isEditable}
              rows={4}
              showVariables={false}
              embedded
              onChange={(value) => updateNode(selectedNode.id, {
                expression: workflowTemplateWithParameterAliases(value, parameterEntries),
              })}
            />
          ))}
        </>
      );
    }
    if (selectedNode.type === 'output') {
      const outputMode = selectedNode.output_mode || (selectedNode.output_mapping ? 'json_object' : 'text');
      const outputEntries = workflowOutputMappingEntries(selectedNode);
      const updateOutputEntries = (entries) => updateNode(selectedNode.id, buildWorkflowOutputPatch(entries));
      return (
        <>
          <FieldRow label="response type">
            <SettingsMenuSelect
              className="workflow-menu-select"
              value={outputMode}
              options={[
                { id: 'text', label: 'Text' },
                { id: 'json_object', label: 'Structured JSON' },
              ]}
              onChange={(mode) => {
                if (mode === 'json_object') {
                  updateNode(selectedNode.id, buildWorkflowOutputPatch(outputEntries));
                  return;
                }
                updateNode(selectedNode.id, {
                  output_mode: 'text',
                  output: selectedNode.output || outputEntries[0]?.value || '{{input.message}}',
                  output_mapping: undefined,
                });
              }}
              disabled={!isEditable}
            />
          </FieldRow>
          {outputMode === 'json_object' ? (
            <div className="workflow-output-mapping">
              <div className="workflow-output-mapping-head">
                <span>output</span>
                {isEditable ? (
                  <button
                    type="button"
                    className="workflow-json-add"
                    onClick={() => updateOutputEntries([
                      ...outputEntries,
                      { key: `field_${outputEntries.length + 1}`, value: '', type: 'string' },
                    ])}
                  >
                    + field
                  </button>
                ) : null}
              </div>
              <div className="workflow-output-mapping-table" aria-label="output">
                <div className="workflow-output-mapping-row is-header">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Value</span>
                  <span className="workflow-output-mapping-action-col" aria-hidden="true" />
                </div>
                {outputEntries.map((entry, index) => (
                  <div className="workflow-output-mapping-row" key={`${entry.key}:${index}`}>
                    <input
                      className="workflow-output-mapping-name"
                      value={entry.key}
                      disabled={!isEditable}
                      placeholder="field name"
                      onChange={(event) => {
                        const key = event.target.value;
                        const next = outputEntries.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, key } : item
                        ));
                        updateOutputEntries(next);
                      }}
                    />
                    <SettingsMenuSelect
                      className="workflow-menu-select workflow-output-mapping-type"
                      value={entry.type || 'any'}
                      options={[
                        { id: 'string', label: 'string' },
                        { id: 'number', label: 'number' },
                        { id: 'boolean', label: 'boolean' },
                        { id: 'object', label: 'object' },
                        { id: 'array', label: 'array' },
                        { id: 'any', label: 'any' },
                      ]}
                      disabled={!isEditable}
                      onChange={(type) => {
                        const next = outputEntries.map((item, itemIndex) => (
                          itemIndex === index ? { ...item, type } : item
                        ));
                        updateOutputEntries(next);
                      }}
                    />
                    <div className="workflow-output-mapping-value">
                      <WorkflowVariableSelect
                        value={entry.value}
                        variables={availableVariables}
                        disabled={!isEditable}
                        onChange={(value) => {
                          const nextType = workflowVariableTypeForValue(value, availableVariables);
                          const next = outputEntries.map((item, itemIndex) => (
                            itemIndex === index
                              ? { ...item, value, type: nextType === 'any' ? (item.type || 'any') : nextType }
                              : item
                          ));
                          updateOutputEntries(next);
                        }}
                      />
                    </div>
                    {isEditable ? (
                      <button
                        type="button"
                        className="workflow-json-delete workflow-output-mapping-delete"
                        aria-label={`delete ${entry.key || 'field'}`}
                        onClick={() => updateOutputEntries(outputEntries.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        ×
                      </button>
                    ) : (
                      <span className="workflow-output-mapping-action-col" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <FieldRow label="final text">
              <WorkflowTemplateTextarea
                value={selectedNode.output || '{{input.message}}'}
                variables={availableVariables}
                disabled={!isEditable}
                rows={6}
                onChange={(output) => updateNode(selectedNode.id, { output_mode: 'text', output })}
              />
            </FieldRow>
          )}
        </>
      );
    }
    return null;
  };

  const showNodePanel = Boolean(selectedNode || selectedEdge);
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
        {isEditable || canSave ? (
          <div className="workflow-toolbar">
            <div className="workflow-toolbar-actions">
              {isEditable ? (
                <div className="workflow-toolbar-add-group" role="group" aria-label="Add node">
                  {typeOptions.map((type) => {
                    const meta = workflowNodeMeta(type.id);
                    return (
                      <PortalTooltip key={type.id} text={`Add ${type.label}`} position="below">
                        <button
                          type="button"
                          className={`workflow-toolbar-button workflow-toolbar-add is-${type.id}${draggedNodeType === type.id ? ' is-dragging' : ''}`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(WORKFLOW_NODE_DRAG_TYPE, type.id);
                            event.dataTransfer.setData('text/plain', type.id);
                            event.dataTransfer.effectAllowed = 'copy';
                            setDraggedNodeType(type.id);
                          }}
                          onDragEnd={() => {
                            setDraggedNodeType('');
                            setIsCanvasDropTarget(false);
                          }}
                          onClick={() => addNode(type.id)}
                        >
                          <span className="workflow-toolbar-add-icon" aria-hidden="true">
                            <SettingsLucideIcon name={meta.icon} size={16} />
                          </span>
                          <span>{type.label}</span>
                        </button>
                      </PortalTooltip>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {canSave ? (
              <div className="workflow-toolbar-end">
                <SettingsTooltipIconButton label="Save" icon="save" iconSize={20} onClick={onSave} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={`workflow-canvas${isCanvasDropTarget ? ' is-node-drag-over' : ''}`}>
          {ReactFlowCanvas ? (
            <ReactFlowProvider>
              <WorkflowDropCanvas
                nodes={reactNodes}
                edges={reactEdges}
                nodeTypes={WORKFLOW_REACT_FLOW_NODE_TYPES}
                draggedNodeType={draggedNodeType}
                onDropNode={addNode}
                onDropTargetChange={setIsCanvasDropTarget}
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
                onNodeDragStop={onReactFlowNodeDragStop}
                nodesDraggable={isEditable}
                nodesConnectable={isEditable}
                edgesFocusable={isEditable}
                elementsSelectable
                deleteKeyCode={null}
                connectionRadius={46}
                fitView
                fitViewOptions={{ padding: 0.2, minZoom: 0.35, maxZoom: 1.15 }}
                minZoom={0.3}
                maxZoom={1.4}
                snapToGrid
                snapGrid={[20, 20]}
                connectionLineType="straight"
                defaultEdgeOptions={{
                  type: 'straight',
                  style: { strokeWidth: 2 },
                }}
                proOptions={{ hideAttribution: true }}
              >
                {Background ? <Background gap={22} size={1.2} color="rgba(176, 206, 255, 0.07)" /> : null}
                {Controls ? <Controls showInteractive={false} position="bottom-left" /> : null}
                <WorkflowCanvasFitView workflowKey={workflow.workflow_id} />
              </WorkflowDropCanvas>
            </ReactFlowProvider>
          ) : (
            <div className="settings-empty">React Flow failed to load.</div>
          )}
        </div>
      </div>
      {showNodePanel ? (
        <div className="workflow-node-panel">
          <div
            className="workflow-node-panel-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize detail panel"
            aria-valuemin={280}
            aria-valuemax={720}
            aria-valuenow={clampedNodePanelWidth}
            onPointerDown={startNodePanelResize}
          />
          <div className="workflow-node-panel-head">
            <div className="workflow-node-panel-title">
              <span>{selectedEdge ? 'Connection' : 'Node'}</span>
              <strong>
                {selectedEdge
                  ? `${selectedEdge.from}${selectedEdge.branch ? ` · ${selectedEdge.branch}` : ''} -> ${selectedEdge.to}`
                  : (selectedNode?.label || selectedNode?.id || 'None')}
              </strong>
            </div>
            {isEditable && selectedNode && !['start', 'output'].includes(selectedNode.type) ? (
              <SettingsTooltipIconButton
                label="Delete"
                icon="delete"
                danger
                iconSize={18}
                className="workflow-node-panel-delete"
                onClick={() => deleteNode(selectedNode.id)}
              />
            ) : null}
            {isEditable && selectedEdge ? (
              <SettingsTooltipIconButton
                label="Delete"
                icon="delete"
                danger
                iconSize={18}
                className="workflow-node-panel-delete"
                onClick={deleteSelection}
              />
            ) : null}
          </div>
          {selectedEdge ? (
            <div className="workflow-node-help">
              Connection: {selectedEdge.from}
              {selectedEdge.branch ? ` · ${selectedEdge.branch}` : ''}
              {' -> '}{selectedEdge.to}
            </div>
          ) : (
            <>
              <FieldRow label="label">
                <input
                  value={selectedNode.label ?? ''}
                  onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })}
                  onKeyDown={(event) => {
                    // Keep text editing keys inside the field; do not let canvas
                    // selection shortcuts swallow Backspace / Delete.
                    if (event.key === 'Backspace' || event.key === 'Delete') {
                      event.stopPropagation();
                    }
                  }}
                  disabled={!isEditable}
                />
              </FieldRow>
              {renderNodeFields()}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
