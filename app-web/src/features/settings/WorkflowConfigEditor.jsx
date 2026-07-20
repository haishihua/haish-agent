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
  useReactFlow,
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
  WORKFLOW_OUTPUT_FIELD_OPTIONS,
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  workflowOutputFieldOptions,
  workflowOutputMappingEntries,
  workflowTemplateVariablePath,
  workflowVariableTypeForValue,
  buildWorkflowOutputPatch,
  createWorkflowExamplePatch,
  payloadForCustomWorkflow,
  placeAddedWorkflowNode,
} from '../../lib/workflow-catalog.js';
import {
  agentCatalogFromSettings,
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
  WorkflowTemplateTextarea,
  WorkflowSchemaList,
  WorkflowOutputContract,
} from './WorkflowFormControls.jsx';

const { useState, useEffect, useRef, useMemo } = React;
const ReactFlowNS = { ReactFlow, Background, Controls, Handle, Position, MarkerType, ReactFlowProvider, useReactFlow };

const WORKFLOW_NODE_META = {
  start: { icon: 'play', badge: 'Start' },
  agent: { icon: 'sparkles', badge: 'Agent' },
  llm: { icon: 'message', badge: 'LLM' },
  tool: { icon: 'wrench', badge: 'Tool' },
  condition: { icon: 'git-branch', badge: 'Condition' },
  output: { icon: 'circle-check', badge: 'End' },
};

function workflowNodeMeta(nodeType) {
  return WORKFLOW_NODE_META[nodeType] || { icon: 'box', badge: typeLabelForWorkflowNode(nodeType) };
}

export function WorkflowFlowNode({ data, selected }) {
  const flow = ReactFlowNS;
  const Handle = flow.Handle;
  const Position = flow.Position || { Left: 'left', Right: 'right' };
  const node = data?.workflowNode || {};
  const nodeType = node.type || 'agent';
  const meta = workflowNodeMeta(nodeType);
  const iconName = nodeType === 'agent'
    ? (data?.agentIconName || agentIconNameForAgentId(node.agent_id, data?.agentOptions))
    : meta.icon;
  return (
    <div className={`workflow-flow-node ${nodeType} ${selected ? 'active' : ''}`}>
      {Handle && nodeType !== 'start' ? <Handle type="target" position={Position.Left} /> : null}
      <span className="workflow-flow-node-icon" aria-hidden="true">
        <SettingsLucideIcon name={iconName} size={16} />
      </span>
      <span className="workflow-flow-node-copy">
        <span className="workflow-flow-node-badge">{meta.badge}</span>
        <strong>{node.label || typeLabelForWorkflowNode(nodeType)}</strong>
      </span>
      {Handle && nodeType !== 'output' ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

function WorkflowCanvasFitView({ workflowKey, nodeCount }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.18, minZoom: 0.45, maxZoom: 1.15, duration: 220 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [fitView, workflowKey, nodeCount]);
  return null;
}

const WORKFLOW_REACT_FLOW_NODE_TYPES = { workflowNode: WorkflowFlowNode };

export function canConnectWorkflowNodes(source, target) {
  return Boolean(source && target && source.id !== target.id && source.type !== 'output' && target.type !== 'start');
}

export function addWorkflowEdge(edges, from, to) {
  if (!from || !to || from === to || edges.some((edge) => edge.from === from && edge.to === to)) return edges;
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
  const workflow = workflowById(normalized, selectedId);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [nodePanelWidth, setNodePanelWidth] = useState(340);
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
  const selectedEdge = edges.find((edge) => `${edge.from}->${edge.to}` === selectedEdgeId) || null;
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
      agentIconName: node.type === 'agent'
        ? agentIconNameForAgentId(node.agent_id, agentOptions)
        : undefined,
    },
    selected: node.id === selectedNodeId,
    draggable: isEditable,
  }));
  const reactEdges = edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    // Straight keeps collinear nodes on a true line; smoothstep always elbows.
    type: 'straight',
    selected: `${edge.from}->${edge.to}` === selectedEdgeId,
    interactionWidth: 28,
    animated: `${edge.from}->${edge.to}` === selectedEdgeId,
    style: {
      stroke: `${edge.from}->${edge.to}` === selectedEdgeId
        ? 'rgba(105, 200, 246, 0.95)'
        : 'rgba(239, 191, 100, 0.62)',
      strokeWidth: `${edge.from}->${edge.to}` === selectedEdgeId ? 2.5 : 2,
    },
    markerEnd: MarkerType.ArrowClosed
      ? {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: `${edge.from}->${edge.to}` === selectedEdgeId
          ? 'rgba(105, 200, 246, 0.95)'
          : 'rgba(239, 191, 100, 0.72)',
      }
      : undefined,
  }));
  const onReactFlowNodesChange = (changes) => {
    if (!isEditable || !flow.applyNodeChanges) return;
    const removeIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
    if (removeIds.size) {
      const removableIds = new Set(nodes.filter((node) => removeIds.has(node.id) && !['start', 'output'].includes(node.type)).map((node) => node.id));
      if (!removableIds.size) return;
      updateWorkflow({
        nodes: nodes.filter((node) => !removableIds.has(node.id)),
        edges: edges.filter((edge) => !removableIds.has(edge.from) && !removableIds.has(edge.to)),
      });
      if (removableIds.has(selectedNodeId)) setSelectedNodeId('');
      setSelectedEdgeId('');
      return;
    }
    if (!changes.some((change) => change.type === 'position' && change.position)) return;
    const updated = flow.applyNodeChanges(changes, reactNodes);
    const updatedById = new Map(updated.map((node) => [node.id, node]));
    updateWorkflow({
      nodes: nodes.map((node) => {
        const next = updatedById.get(node.id);
        if (!next) return node;
        return normalizeWorkflowNode({ ...node, position: next.position }, node);
      }),
    });
  };
  const onReactFlowEdgesChange = (changes) => {
    if (!isEditable || !flow.applyEdgeChanges) return;
    if (!changes.some((change) => change.type !== 'select')) return;
    const updated = flow.applyEdgeChanges(changes, reactEdges);
    if (selectedEdgeId && !updated.some((edge) => edge.id === selectedEdgeId)) setSelectedEdgeId('');
    updateWorkflow({
      edges: updated
        .filter((edge) => edge.source && edge.target)
        .map((edge) => ({ from: edge.source, to: edge.target })),
    });
  };
  const onReactFlowConnect = (connection) => {
    if (!isEditable || !connection?.source || !connection?.target || connection.source === connection.target) return;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!canConnectWorkflowNodes(source, target)) return;
    updateWorkflow({ edges: addWorkflowEdge(edges, connection.source, connection.target) });
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
  const addNode = (type) => {
    const baseType = type || 'agent';
    const count = nodes.filter((node) => node.type === baseType).length + 1;
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
      ...(baseType === 'tool' ? { tool_name: '', arguments: { query: '{{input.message}}' } } : {}),
      ...(baseType === 'condition' ? { expression: '{{nodes.agent_1.success}} == true' } : {}),
      ...(baseType === 'output' ? {
        output_mode: 'json_object',
        output: '{{input.message}}',
        output_mapping: DEFAULT_WORKFLOW_OUTPUT_MAPPING,
        output_schema: DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
      } : {}),
    };
    const placed = placeAddedWorkflowNode(nodes, newNode);
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
    updateWorkflow({ edges: edges.filter((edge) => `${edge.from}->${edge.to}` !== edgeId) });
    setSelectedEdgeId('');
  };
  const deleteSelection = () => {
    if (selectedEdge) {
      deleteEdge(selectedEdgeId);
      return;
    }
    if (selectedNode) deleteNode(selectedNode.id);
  };
  const loadExampleWorkflow = () => {
    if (!isEditable) return;
    const shouldReplace = nodes.length <= 2
      || window.confirm('Replace this canvas with an example workflow?');
    if (!shouldReplace) return;
    updateWorkflow(createWorkflowExamplePatch(agentOptions));
    setSelectedNodeId('output');
    setSelectedEdgeId('');
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
    if (selectedNode.type === 'agent') {
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
          <WorkflowTemplateTextarea
            title="Input"
            hint="Dynamic user message sent after the cached agent prefix."
            value={selectedNode.input ?? selectedNode.input_mapping?.message ?? '{{input.message}}'}
            variables={availableVariables}
            disabled={!isEditable}
            rows={5}
            variableHint="Insert values from earlier nodes or workflow inputs."
            onChange={(input) => updateNode(selectedNode.id, { input })}
          />
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'llm') {
      return (
        <>
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
          <FieldRow label="prompt">
            <WorkflowTemplateTextarea
              value={selectedNode.prompt || '{{input.message}}'}
              variables={availableVariables}
              disabled={!isEditable}
              rows={6}
              onChange={(prompt) => updateNode(selectedNode.id, { prompt })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'tool') {
      return (
        <>
          <FieldRow label="tool name">
            <input value={selectedNode.tool_name || ''} onChange={(event) => updateNode(selectedNode.id, { tool_name: event.target.value })} disabled={!isEditable} placeholder="tool name" />
          </FieldRow>
          <FieldRow label="arguments json" hint="Objects and arrays render variables recursively.">
            <WorkflowTemplateTextarea
              value={workflowArgumentsText(selectedNode.arguments)}
              variables={availableVariables}
              disabled={!isEditable}
              rows={6}
              onChange={(argumentsText) => updateNode(selectedNode.id, { arguments: argumentsText })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
        </>
      );
    }
    if (selectedNode.type === 'condition') {
      return (
        <>
          <FieldRow label="expression" hint="P0 supports restricted comparisons: equals, not equals, contains, exists, and truthiness.">
            <WorkflowTemplateTextarea
              value={selectedNode.expression || ''}
              variables={availableVariables}
              disabled={!isEditable}
              rows={4}
              onChange={(expression) => updateNode(selectedNode.id, { expression })}
            />
          </FieldRow>
          <WorkflowOutputContract node={selectedNode} />
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
                <>
                  <button type="button" className="workflow-toolbar-button is-muted" onClick={loadExampleWorkflow}>
                    <SettingsLucideIcon name="layers" size={14} />
                    <span>Load example</span>
                  </button>
                  <div className="workflow-toolbar-add-group" role="group" aria-label="Add node">
                    {typeOptions.map((type) => {
                      const meta = workflowNodeMeta(type.id);
                      return (
                        <button
                          type="button"
                          className={`workflow-toolbar-button workflow-toolbar-add is-${type.id}`}
                          key={type.id}
                          onClick={() => addNode(type.id)}
                          title={`Add ${type.label}`}
                        >
                          <span className="workflow-toolbar-add-icon" aria-hidden="true">
                            <SettingsLucideIcon name={meta.icon} size={16} />
                          </span>
                          <span>{type.label}</span>
                          <span className="workflow-toolbar-add-plus" aria-hidden="true">
                            <SettingsLucideIcon name="plus" size={12} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
            {canSave ? (
              <div className="workflow-toolbar-end">
                <SettingsTooltipIconButton label="Save" icon="save" iconSize={20} onClick={onSave} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="workflow-canvas">
          {ReactFlowCanvas ? (
            <ReactFlowProvider>
              <ReactFlowCanvas
                nodes={reactNodes}
                edges={reactEdges}
                nodeTypes={WORKFLOW_REACT_FLOW_NODE_TYPES}
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
                <WorkflowCanvasFitView workflowKey={workflow.workflow_id} nodeCount={nodes.length} />
              </ReactFlowCanvas>
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
              <strong>{selectedEdge ? `${selectedEdge.from} -> ${selectedEdge.to}` : (selectedNode?.label || selectedNode?.id || 'None')}</strong>
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
              Connection: {selectedEdge.from}{' -> '}{selectedEdge.to}
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


