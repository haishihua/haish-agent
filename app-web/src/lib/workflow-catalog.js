// @haish-esm
// Workflow catalog defaults + pure helpers (UI-free).
import {
  SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_INPUT_SCHEMA,
  COMMON_WORKFLOW_OUTPUT_FIELDS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
  DEFAULT_DIRECT_WORKFLOW,
  DEFAULT_SOFTWARE_DEVELOPMENT_WORKFLOW,
  DEFAULT_WORKFLOW_SETTINGS,
} from './agent-catalog.js';

export function normalizeWorkflowNode(node, fallback = {}) {
  const nodeId = String(node?.id || fallback.id || '').trim();
  const type = String(node?.type || fallback.type || '').trim() || 'agent';
  const data = node && typeof node === 'object' ? { ...node } : {};
  if (type === 'agent' && /\{\{|\}\}/.test(String(data.prompt || ''))) {
    if (data.input == null) data.input = data.prompt;
    data.prompt = '';
  }
  ['prompt', 'input', 'output', 'expression', 'arguments', 'parameters', 'output_mapping'].forEach((key) => {
    if (key in data) data[key] = sanitizeWorkflowTemplateValue(data[key]);
  });
  delete data.id;
  delete data.type;
  const fallbackPosition = fallback.position && typeof fallback.position === 'object' ? fallback.position : {};
  const position = data.position && typeof data.position === 'object' ? data.position : fallbackPosition;
  return {
    ...fallback,
    ...data,
    id: nodeId,
    type,
    // Keep empty labels as-is; `||` would bounce "" back to the previous name
    // and make Backspace/Delete look broken in the detail panel.
    label: String(data.label ?? fallback.label ?? typeLabelForWorkflowNode(type)),
    position: {
      x: Number.isFinite(Number(position.x)) ? Number(position.x) : Number(fallbackPosition.x || 0),
      y: Number.isFinite(Number(position.y)) ? Number(position.y) : Number(fallbackPosition.y || 0),
    },
  };
}

export function workflowParameterEntries(parameters) {
  if (Array.isArray(parameters)) {
    return parameters
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry, index) => ({
        id: String(entry.id || `parameter_${index + 1}`),
        name: String(entry.name || ''),
        value: sanitizeWorkflowTemplateValue(entry.value ?? ''),
      }));
  }
  if (parameters && typeof parameters === 'object') {
    return Object.entries(parameters).map(([name, value], index) => ({
      id: `parameter_${index + 1}`,
      name,
      value: sanitizeWorkflowTemplateValue(value),
    }));
  }
  return [];
}

function replaceWorkflowTemplateToken(value, from, to) {
  if (!from || from === to) return value;
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((item) => replaceWorkflowTemplateToken(item, from, to));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceWorkflowTemplateToken(item, from, to)]),
    );
  }
  return value;
}

export function workflowTemplateWithParameterAliases(value, parameters) {
  return workflowParameterEntries(parameters).reduce((template, parameter) => {
    const name = String(parameter.name || '').trim();
    const source = String(parameter.value || '').trim();
    if (!name || !workflowTemplateVariablePath(source)) return template;
    return replaceWorkflowTemplateToken(template, source, `{{${name}}}`);
  }, sanitizeWorkflowTemplateValue(value));
}

export function reconcileWorkflowParameterTemplate(value, previousParameters, nextParameters) {
  const previous = workflowParameterEntries(previousParameters);
  const next = workflowParameterEntries(nextParameters);
  const nextById = new Map(next.map((parameter) => [parameter.id, parameter]));
  let template = sanitizeWorkflowTemplateValue(value);
  previous.forEach((parameter) => {
    const oldName = String(parameter.name || '').trim();
    if (!oldName) return;
    const replacement = nextById.get(parameter.id);
    if (!replacement) {
      template = replaceWorkflowTemplateToken(template, `{{${oldName}}}`, parameter.value || '');
      return;
    }
    const nextName = String(replacement.name || '').trim();
    if (nextName && nextName !== oldName) {
      template = replaceWorkflowTemplateToken(template, `{{${oldName}}}`, `{{${nextName}}}`);
    }
  });
  return workflowTemplateWithParameterAliases(template, next);
}

export function normalizeWorkflowEdge(edge) {
  const rawBranch = String(edge?.branch || edge?.source_handle || edge?.sourceHandle || '').trim().toLowerCase();
  const branch = rawBranch === 'default' ? 'false' : rawBranch;
  return {
    from: String(edge?.from || edge?.source || '').trim(),
    to: String(edge?.to || edge?.target || '').trim(),
    ...(branch === 'true' || branch === 'false' ? { branch } : {}),
  };
}

export function normalizeWorkflowRow(item, fallback = DEFAULT_SOFTWARE_DEVELOPMENT_WORKFLOW) {
  const workflowId = String(item?.workflow_id || item?.id || fallback.workflow_id || fallback.id || '').trim();
  const rawNodes = Array.isArray(item?.nodes) && item.nodes.length ? item.nodes : fallback.nodes;
  const rawEdges = Array.isArray(item?.edges) ? item.edges : fallback.edges;
  const fallbackName = item?.draft ? 'New Workflow' : (fallback.display_name || workflowId);
  // Prefer explicit display_name (including "") so draft title inputs can clear fully.
  const resolvedDisplayName = item?.display_name != null
    ? item.display_name
    : (item?.name != null ? item.name : fallbackName);
  const isBlankDraft = Boolean(item?.draft && !String(resolvedDisplayName || '').trim());
  let nodes = rawNodes
    .map((node, index) => normalizeWorkflowNode(node, fallback.nodes?.[index] || {}))
    .filter((node) => node.id)
    .map((node) => {
      if (
        isBlankDraft
        && node.type === 'output'
        && (node.output_mode || 'text') === 'text'
        && String(node.output || '').trim() === '{{input.message}}'
        && !node.output_mapping
      ) {
        return {
          ...node,
          output_mode: 'json_object',
          output_mapping: { answer: '{{input.message}}' },
          output_schema: {
            type: 'object',
            fields: [{ id: 'answer', label: 'answer', type: 'string', path: 'output.answer' }],
          },
        };
      }
      return node;
    });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const normalizedEdges = rawEdges
    .map(normalizeWorkflowEdge)
    .filter((edge) => edge.from && edge.to);
  const usedConditionBranches = new Map();
  normalizedEdges.forEach((edge) => {
    if (!edge.branch) return;
    if (!usedConditionBranches.has(edge.from)) usedConditionBranches.set(edge.from, new Set());
    usedConditionBranches.get(edge.from).add(edge.branch);
  });
  const edges = normalizedEdges
    .map((edge) => {
      if (edge.branch) return edge;
      const source = nodeById.get(edge.from);
      if (source?.type !== 'condition' || Array.isArray(source.cases)) return edge;
      if (!usedConditionBranches.has(edge.from)) usedConditionBranches.set(edge.from, new Set());
      const used = usedConditionBranches.get(edge.from);
      const branch = !used.has('true') ? 'true' : !used.has('false') ? 'false' : '';
      if (!branch) return edge;
      used.add(branch);
      return { ...edge, branch };
    });
  const incomingByTarget = new Map();
  edges.forEach((edge) => {
    if (!incomingByTarget.has(edge.to)) incomingByTarget.set(edge.to, []);
    incomingByTarget.get(edge.to).push(edge.from);
  });
  nodes = nodes.map((node) => {
    if (node.type !== 'output') return node;
    const sources = incomingByTarget.get(node.id) || [];
    if (sources.length !== 1 || nodeById.get(sources[0])?.type === 'start') return node;
    const sourceSummary = `{{nodes.${sources[0]}.summary}}`;
    const mapping = node.output_mapping && typeof node.output_mapping === 'object' && !Array.isArray(node.output_mapping)
      ? node.output_mapping
      : null;
    const usesDefaultText = !mapping && String(node.output || '').trim() === '{{input.message}}';
    const usesDefaultMapping = mapping
      && Object.keys(mapping).length === 1
      && String(mapping.answer || '').trim() === '{{input.message}}';
    if (!usesDefaultText && !usesDefaultMapping) return node;
    return {
      ...node,
      output: sourceSummary,
      ...(mapping ? { output_mapping: { answer: sourceSummary } } : {}),
    };
  });
  return {
    ...fallback,
    ...(item && typeof item === 'object' ? item : {}),
    id: workflowId,
    workflow_id: workflowId,
    version: String(item?.version || fallback.version || '1.0.0'),
    display_name: String(resolvedDisplayName),
    description: String(item?.description || fallback.description || ''),
    enabled: item?.enabled !== false,
    system: Boolean(item?.system ?? fallback.system),
    custom: Boolean(item?.custom ?? !item?.system),
    default: Boolean(item?.default),
    editable: Boolean(item?.editable ?? item?.custom),
    deletable: Boolean(item?.deletable ?? item?.custom),
    executable: Boolean(item?.executable ?? workflowId === SOFTWARE_DEVELOPMENT_WORKFLOW_ID),
    draft: Boolean(item?.draft),
    nodes,
    edges,
  };
}

const WORKFLOW_NODE_LAYOUT_STEP_X = 280;
const WORKFLOW_NODE_LAYOUT_START_X = 48;
const WORKFLOW_NODE_LAYOUT_MAIN_Y = 148;
const WORKFLOW_NODE_LAYOUT_BRANCH_Y = 320;
const WORKFLOW_NODE_LAYOUT_STEP_Y = 150;
const WORKFLOW_NODE_OCCUPY_X = 200;
const WORKFLOW_NODE_OCCUPY_Y = 100;
const WORKFLOW_NODE_DROP_GRID = 20;
const WORKFLOW_NODE_DROP_HALF_WIDTH = 107;
const WORKFLOW_NODE_DROP_HALF_HEIGHT = 31;

function workflowNodeCoord(node, axis = 'x', fallback = 0) {
  const value = Number(node?.position?.[axis]);
  return Number.isFinite(value) ? value : fallback;
}

function workflowNodeOverlaps(a, b, ignoreId = '') {
  if (!a || !b || a.id === ignoreId || b.id === ignoreId || a.id === b.id) return false;
  return Math.abs(workflowNodeCoord(a, 'x') - workflowNodeCoord(b, 'x')) < WORKFLOW_NODE_OCCUPY_X
    && Math.abs(workflowNodeCoord(a, 'y') - workflowNodeCoord(b, 'y')) < WORKFLOW_NODE_OCCUPY_Y;
}

/** Place a newly added node left of End (output), shifting End right when needed. */
export function placeAddedWorkflowNode(nodes = [], newNode) {
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.id) : [];
  const candidate = newNode && typeof newNode === 'object' ? { ...newNode } : null;
  if (!candidate?.id) {
    return { nodes: list, position: { x: WORKFLOW_NODE_LAYOUT_START_X + WORKFLOW_NODE_LAYOUT_STEP_X, y: WORKFLOW_NODE_LAYOUT_MAIN_Y } };
  }

  const withoutDuplicate = list.filter((node) => node.id !== candidate.id);
  const endNode = withoutDuplicate.find((node) => node.type === 'output');
  const others = withoutDuplicate.filter((node) => node.type !== 'output');

  let insertX = WORKFLOW_NODE_LAYOUT_START_X + WORKFLOW_NODE_LAYOUT_STEP_X;
  let insertY = WORKFLOW_NODE_LAYOUT_MAIN_Y;
  if (others.length) {
    const rightmost = others.reduce((best, node) => {
      const x = workflowNodeCoord(node, 'x', WORKFLOW_NODE_LAYOUT_START_X);
      if (x > best.x) {
        return { x, y: workflowNodeCoord(node, 'y', WORKFLOW_NODE_LAYOUT_MAIN_Y) };
      }
      return best;
    }, { x: -Infinity, y: WORKFLOW_NODE_LAYOUT_MAIN_Y });
    insertX = rightmost.x + WORKFLOW_NODE_LAYOUT_STEP_X;
    insertY = rightmost.y;
  }

  let nextNodes = withoutDuplicate.map((node) => ({ ...node, position: { ...node.position } }));
  if (endNode) {
    const endX = workflowNodeCoord(endNode, 'x', insertX);
    const endY = workflowNodeCoord(endNode, 'y', insertY);
    // Prefer the End slot so the new node sits between Start and End, then push End right.
    if (insertX >= endX - 40) {
      insertX = endX;
      insertY = endY;
      nextNodes = nextNodes.map((node) => (
        node.id === endNode.id
          ? {
            ...node,
            position: {
              x: endX + WORKFLOW_NODE_LAYOUT_STEP_X,
              y: endY,
            },
          }
          : node
      ));
    }
  }

  let guard = 0;
  while (
    nextNodes.some((node) => workflowNodeOverlaps(node, { id: candidate.id, position: { x: insertX, y: insertY } }))
    && guard < 12
  ) {
    insertY += WORKFLOW_NODE_LAYOUT_STEP_Y;
    guard += 1;
  }

  const position = { x: insertX, y: insertY };
  return {
    nodes: [...nextNodes, { ...candidate, position }],
    position,
  };
}

/** Place a dragged toolbar node with its center at the snapped canvas drop point. */
export function placeDroppedWorkflowNode(nodes = [], newNode, dropPosition) {
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.id) : [];
  const candidate = newNode && typeof newNode === 'object' ? { ...newNode } : null;
  const dropX = Number(dropPosition?.x);
  const dropY = Number(dropPosition?.y);
  if (!candidate?.id || !Number.isFinite(dropX) || !Number.isFinite(dropY)) {
    return placeAddedWorkflowNode(list, candidate);
  }

  const position = {
    x: Math.round((dropX - WORKFLOW_NODE_DROP_HALF_WIDTH) / WORKFLOW_NODE_DROP_GRID) * WORKFLOW_NODE_DROP_GRID,
    y: Math.round((dropY - WORKFLOW_NODE_DROP_HALF_HEIGHT) / WORKFLOW_NODE_DROP_GRID) * WORKFLOW_NODE_DROP_GRID,
  };
  return {
    nodes: [
      ...list.filter((node) => node.id !== candidate.id),
      { ...candidate, position },
    ],
    position,
  };
}

export function layoutWorkflowNodes(nodes = [], edges = []) {
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.id) : [];
  if (!list.length) return [];

  const nodeIds = new Set(list.map((node) => node.id));
  const edgeList = (Array.isArray(edges) ? edges : [])
    .map((edge) => ({
      from: String(edge?.from || edge?.source || '').trim(),
      to: String(edge?.to || edge?.target || '').trim(),
    }))
    .filter((edge) => edge.from && edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  const outgoing = new Map();
  const incomingCount = new Map(list.map((node) => [node.id, 0]));
  edgeList.forEach((edge) => {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
  });

  const startCandidates = list
    .filter((node) => node.type === 'start' || (incomingCount.get(node.id) || 0) === 0)
    .map((node) => node.id);
  const queue = startCandidates.length ? [...startCandidates] : [list[0].id];
  const rank = new Map();
  const visited = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const currentRank = rank.get(id) || 0;
    (outgoing.get(id) || []).forEach((nextId) => {
      const nextRank = currentRank + 1;
      if (!rank.has(nextId) || nextRank > rank.get(nextId)) rank.set(nextId, nextRank);
      if (!visited.has(nextId)) queue.push(nextId);
    });
  }

  list.forEach((node, index) => {
    if (!rank.has(node.id)) rank.set(node.id, index);
  });

  const columns = new Map();
  list.forEach((node) => {
    const column = rank.get(node.id) || 0;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  });

  const positioned = new Map();
  [...columns.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([column, columnNodes]) => {
      const ordered = [...columnNodes].sort((a, b) => {
        const aY = Number(a?.position?.y);
        const bY = Number(b?.position?.y);
        if (Number.isFinite(aY) && Number.isFinite(bY) && aY !== bY) return aY - bY;
        return String(a.id).localeCompare(String(b.id));
      });
      ordered.forEach((node, row) => {
        positioned.set(node.id, {
          x: WORKFLOW_NODE_LAYOUT_START_X + (column * WORKFLOW_NODE_LAYOUT_STEP_X),
          y: ordered.length === 1
            ? WORKFLOW_NODE_LAYOUT_MAIN_Y
            : WORKFLOW_NODE_LAYOUT_MAIN_Y + (row * (WORKFLOW_NODE_LAYOUT_BRANCH_Y - WORKFLOW_NODE_LAYOUT_MAIN_Y)),
        });
      });
    });

  return list.map((node) => normalizeWorkflowNode({
    ...node,
    position: positioned.get(node.id) || node.position || { x: WORKFLOW_NODE_LAYOUT_START_X, y: WORKFLOW_NODE_LAYOUT_MAIN_Y },
  }, node));
}

function withCanonicalWorkflowLayout(workflow) {
  if (!workflow || workflow.custom) return workflow;
  if (workflow.workflow_id !== SOFTWARE_DEVELOPMENT_WORKFLOW_ID && !workflow.system) return workflow;
  return {
    ...workflow,
    nodes: layoutWorkflowNodes(workflow.nodes, workflow.edges),
  };
}

export function normalizeWorkflowSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : DEFAULT_WORKFLOW_SETTINGS;
  const presets = Array.isArray(source.presets) && source.presets.length
    ? source.presets
      .map((item, index) => normalizeWorkflowRow(item, DEFAULT_WORKFLOW_SETTINGS.presets[index] || DEFAULT_SOFTWARE_DEVELOPMENT_WORKFLOW))
      .map((item) => withCanonicalWorkflowLayout(item))
      .filter((item) => item.workflow_id)
    : DEFAULT_WORKFLOW_SETTINGS.presets.map((item) => withCanonicalWorkflowLayout(item));
  const custom = Array.isArray(source.custom)
    ? source.custom.map((item) => normalizeWorkflowRow(item, { ...DEFAULT_DIRECT_WORKFLOW, custom: true, system: false, editable: true, deletable: true, default: false })).filter((item) => item.workflow_id)
    : [];
  const nodeTypes = Array.isArray(source.node_types) && source.node_types.length
    ? source.node_types
    : DEFAULT_WORKFLOW_NODE_TYPES;
  return {
    default_workflow_id: String(source.default_workflow_id || SOFTWARE_DEVELOPMENT_WORKFLOW_ID),
    presets,
    custom,
    node_types: nodeTypes,
  };
}

export function workflowListItems(settings) {
  const normalized = normalizeWorkflowSettings(settings);
  return [...normalized.presets, ...normalized.custom].map((item) => ({
    id: item.workflow_id,
    title: item.display_name || (item.draft ? 'New Workflow' : item.workflow_id),
    kind: item.custom ? 'Custom' : 'Preset',
    summary: item.draft ? 'Draft' : (item.description || (item.enabled === false ? 'Disabled' : 'Enabled')),
    protected: !item.custom,
    enabled: item.enabled !== false,
    custom: Boolean(item.custom),
    default: item.workflow_id === normalized.default_workflow_id || item.default === true,
    canToggle: item.workflow_id !== SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
    canConfigure: Boolean(item.custom) || item.editable,
  }));
}

export function workflowById(settings, workflowId) {
  const normalized = normalizeWorkflowSettings(settings);
  return [...normalized.presets, ...normalized.custom].find((item) => item.workflow_id === workflowId) || null;
}

export function typeLabelForWorkflowNode(type) {
  const known = {
    start: 'Start',
    output: 'End',
    agent: 'Agent',
    llm: 'LLM',
    tool: 'Tool',
    condition: 'Condition',
  };
  return known[type] || type || 'Node';
}

export function workflowOutputFields(nodeOrType) {
  const type = typeof nodeOrType === 'string' ? nodeOrType : nodeOrType?.type;
  const fields = [...COMMON_WORKFLOW_OUTPUT_FIELDS, ...(WORKFLOW_NODE_OUTPUT_FIELDS[type] || [])];
  if (
    type === 'llm'
    && typeof nodeOrType === 'object'
    && (nodeOrType?.response_format || 'text') !== 'json_object'
  ) {
    return fields.filter((field) => field.id !== 'json');
  }
  return fields;
}

export function workflowSchemaFields(schema) {
  return Array.isArray(schema?.fields) && schema.fields.length
    ? schema.fields
    : DEFAULT_WORKFLOW_INPUT_SCHEMA.fields;
}

export function workflowUpstreamNodeIds(workflow, selectedNodeId) {
  if (!selectedNodeId) return new Set();
  const incoming = new Map();
  (workflow?.edges || []).forEach((edge) => {
    if (!edge.from || !edge.to) return;
    incoming.set(edge.to, [...(incoming.get(edge.to) || []), edge.from]);
  });
  const upstream = new Set();
  const stack = [...(incoming.get(selectedNodeId) || [])];
  while (stack.length) {
    const nodeId = stack.pop();
    if (!nodeId || upstream.has(nodeId)) continue;
    upstream.add(nodeId);
    stack.push(...(incoming.get(nodeId) || []));
  }
  return upstream;
}

export function workflowFriendlyVariableLabel(item) {
  if (!item) return 'Value';
  if (item.path === 'input.message') return 'User message';
  if (item.path === 'input.attachments') return 'Files';
  if (item.path === 'input.image_attachments') return 'Images';
  if (item.path === 'input.conversation_id') return 'Conversation';
  if (item.path === 'input.workspace') return 'Workspace';
  const nodeLabel = String(item.nodeLabel || item.group || 'Node').trim() || 'Node';
  const fieldLabels = {
    status: 'status',
    success: 'success',
    summary: 'summary',
    error: 'error',
    metadata: 'metadata',
    messages: 'messages',
    artifacts: 'artifacts',
    structured: 'structured',
    citations: 'citations',
    trace: 'trace',
    text: 'text',
    json: 'json',
    usage: 'usage',
    finish_reason: 'finish_reason',
    raw: 'raw',
    matched_case: 'matched_case',
    selected_target: 'selected_target',
    value: 'value',
  };
  const fieldLabel = String(
    item.fieldLabel
    || fieldLabels[item.fieldId]
    || item.fieldId
    || 'value',
  ).trim() || 'value';
  return `${nodeLabel}.${fieldLabel}`;
}

export function workflowVariableCatalog(workflow, selectedNodeId = '') {
  const inputFields = workflowSchemaFields(workflow?.input_schema).map((field) => ({
    path: field.path || `input.${field.id}`,
    label: workflowFriendlyVariableLabel({ path: field.path || `input.${field.id}` }),
    type: field.type || 'any',
    group: 'Input',
  }));
  const upstreamIds = workflowUpstreamNodeIds(workflow, selectedNodeId);
  const nodeFields = (workflow?.nodes || [])
    .filter((node) => node?.id && node.id !== selectedNodeId && upstreamIds.has(node.id) && node.type !== 'output')
    .flatMap((node) => workflowOutputFields(node).map((field) => ({
      path: `nodes.${node.id}.${field.id}`,
      label: workflowFriendlyVariableLabel({
        path: `nodes.${node.id}.${field.id}`,
        nodeLabel: node.label || typeLabelForWorkflowNode(node.type),
        fieldId: field.id,
        fieldLabel: field.label,
      }),
      type: field.type || 'any',
      group: typeLabelForWorkflowNode(node.type),
      nodeLabel: node.label || typeLabelForWorkflowNode(node.type),
      fieldId: field.id,
      description: field.description || '',
    })));
  return [...inputFields, ...nodeFields];
}

export function sanitizeWorkflowTemplateValue(value) {
  if (typeof value === 'string') {
    let next = value;
    let previous = '';
    while (next !== previous) {
      previous = next;
      next = next.replace(/{{([^{}]*){{\s*([^{}]+?)\s*}}([^{}]*)}}/g, '{{$2}}');
    }
    return next;
  }
  if (Array.isArray(value)) return value.map(sanitizeWorkflowTemplateValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeWorkflowTemplateValue(item)]));
  }
  return value;
}

export function workflowTokenRangeAt(text, start, end) {
  const selectedStart = Math.min(start, end);
  const selectedEnd = Math.max(start, end);
  const exactMatch = text.match(/^{{\s*[^{}]+?\s*}}$/);
  if (exactMatch) return { start: 0, end: text.length };
  const tokenPattern = /{{\s*[^{}]+?\s*}}/g;
  let match = tokenPattern.exec(text);
  while (match) {
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    const cursorInsideToken = selectedStart === selectedEnd && selectedStart > tokenStart && selectedStart < tokenEnd;
    const selectionTouchesToken = selectedStart < tokenEnd && selectedEnd > tokenStart;
    if (cursorInsideToken || selectionTouchesToken) return { start: tokenStart, end: tokenEnd };
    match = tokenPattern.exec(text);
  }
  return { start: selectedStart, end: selectedEnd };
}

export function workflowArgumentsText(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

export const WORKFLOW_OUTPUT_FIELD_OPTIONS = ['answer', 'summary', 'plan', 'request', 'citations', 'artifacts', 'metadata'];
export const DEFAULT_WORKFLOW_OUTPUT_MAPPING = {
  answer: '{{input.message}}',
};
export const DEFAULT_WORKFLOW_OUTPUT_SCHEMA = {
  type: 'object',
  fields: [{ id: 'answer', label: 'answer', type: 'string', path: 'output.answer' }],
};

export function workflowOutputFieldOptions(entries) {
  const keys = new Set(WORKFLOW_OUTPUT_FIELD_OPTIONS);
  entries.forEach((entry) => {
    const key = String(entry.key || '').trim();
    if (key) keys.add(key);
  });
  return [...keys].map((key) => ({ id: key, label: key }));
}

export function workflowOutputMappingEntries(node) {
  const schemaFields = Array.isArray(node?.output_schema?.fields) ? node.output_schema.fields : [];
  const typeByKey = new Map(schemaFields.map((field) => [field.id || field.key || field.name, field.type || 'any']));
  const mapping = node?.output_mapping && typeof node.output_mapping === 'object' && !Array.isArray(node.output_mapping)
    ? node.output_mapping
    : null;
  const entries = mapping
    ? Object.entries(mapping)
    : [['answer', node?.output || '{{input.message}}']];
  return entries.map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : workflowArgumentsText(value),
    type: typeByKey.get(key) || 'any',
  }));
}

export function workflowTemplateVariablePath(value) {
  const match = String(value || '').trim().match(/^{{\s*([^{}]+?)\s*}}$/);
  return match ? match[1] : '';
}

export function workflowVariableTypeForValue(value, variables) {
  const path = workflowTemplateVariablePath(value);
  if (!path) return 'any';
  return variables.find((item) => item.path === path)?.type || 'any';
}

export function buildWorkflowOutputPatch(entries) {
  const output_mapping = {};
  entries.forEach((entry) => {
    const key = String(entry.key || '').trim();
    if (!key) return;
    output_mapping[key] = entry.value || '';
  });
  const firstValue = Object.values(output_mapping)[0] || '{{input.message}}';
  return {
    output_mode: 'json_object',
    output: String(output_mapping.answer || output_mapping.summary || firstValue),
    output_mapping,
    output_schema: {
      type: 'object',
      fields: Object.keys(output_mapping).map((key) => ({
        id: key,
        label: key,
        type: entries.find((entry) => entry.key === key)?.type || 'any',
        path: `output.${key}`,
      })),
    },
  };
}

export function createDefaultCustomWorkflowPayload() {
  const id = `custom.workflow-${Date.now()}`;
  return normalizeWorkflowRow({
    ...DEFAULT_DIRECT_WORKFLOW,
    id,
    workflow_id: id,
    display_name: '',
    description: '',
    enabled: true,
    system: false,
    custom: true,
    editable: true,
    deletable: true,
    executable: false,
    default: false,
    draft: true,
    input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA,
    nodes: [
      { id: 'start', type: 'start', label: 'Start', input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA, position: { x: 40, y: 160 } },
      {
        id: 'output',
        type: 'output',
        label: 'End',
        output_mode: 'json_object',
        output: '{{input.message}}',
        output_mapping: DEFAULT_WORKFLOW_OUTPUT_MAPPING,
        output_schema: DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
        position: { x: 340, y: 160 },
      },
    ],
    edges: [],
  });
}

export function payloadForCustomWorkflow(workflow) {
  const displayName = String(workflow?.display_name || '').trim();
  if (!displayName) throw new Error('workflow name is required');
  return {
    id: workflow.workflow_id,
    version: workflow.version || '1.0.0',
    display_name: displayName,
    description: workflow.description || '',
    enabled: workflow.enabled !== false,
    input_schema: workflow.input_schema || DEFAULT_WORKFLOW_INPUT_SCHEMA,
    variables: workflow.variables && typeof workflow.variables === 'object' ? workflow.variables : {},
    nodes: (workflow.nodes || []).map((node) => {
      const next = { ...node, id: node.id, type: node.type };
      return next;
    }),
    edges: (workflow.edges || []).map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.branch === 'true' || edge.branch === 'false' ? { branch: edge.branch } : {}),
    })),
  };
}
