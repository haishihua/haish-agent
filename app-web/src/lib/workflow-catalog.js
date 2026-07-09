// @haish-esm
// Workflow catalog defaults + pure helpers (UI-free).
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DIRECT_AGENT_WORKFLOW_ID,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_WORKFLOW_INPUT_SCHEMA,
  COMMON_WORKFLOW_OUTPUT_FIELDS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
  DEFAULT_DIRECT_WORKFLOW,
  DEFAULT_WORKFLOW_SETTINGS,
} from './agent-catalog.js';

export function normalizeWorkflowNode(node, fallback = {}) {
  const nodeId = String(node?.id || fallback.id || '').trim();
  const type = String(node?.type || fallback.type || '').trim() || 'agent';
  const data = node && typeof node === 'object' ? { ...node } : {};
  ['prompt', 'input', 'output', 'expression', 'arguments', 'output_mapping'].forEach((key) => {
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
    label: String(data.label || fallback.label || typeLabelForWorkflowNode(type)),
    position: {
      x: Number.isFinite(Number(position.x)) ? Number(position.x) : Number(fallbackPosition.x || 0),
      y: Number.isFinite(Number(position.y)) ? Number(position.y) : Number(fallbackPosition.y || 0),
    },
  };
}

export function normalizeWorkflowEdge(edge) {
  return {
    from: String(edge?.from || edge?.source || '').trim(),
    to: String(edge?.to || edge?.target || '').trim(),
  };
}

export function normalizeWorkflowRow(item, fallback = DEFAULT_DIRECT_WORKFLOW) {
  const workflowId = String(item?.workflow_id || item?.id || fallback.workflow_id || fallback.id || '').trim();
  const rawNodes = Array.isArray(item?.nodes) && item.nodes.length ? item.nodes : fallback.nodes;
  const rawEdges = Array.isArray(item?.edges) ? item.edges : fallback.edges;
  const fallbackName = item?.draft ? 'New Workflow' : (fallback.display_name || workflowId);
  const isBlankDraft = Boolean(item?.draft && !String(item?.display_name || item?.name || '').trim());
  const nodes = rawNodes
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
  return {
    ...fallback,
    ...(item && typeof item === 'object' ? item : {}),
    id: workflowId,
    workflow_id: workflowId,
    version: String(item?.version || fallback.version || '1.0.0'),
    display_name: String(item?.display_name || item?.name || fallbackName),
    description: String(item?.description || fallback.description || ''),
    enabled: item?.enabled !== false,
    system: Boolean(item?.system ?? fallback.system),
    custom: Boolean(item?.custom ?? !item?.system),
    default: Boolean(item?.default),
    editable: Boolean(item?.editable ?? item?.custom),
    deletable: Boolean(item?.deletable ?? item?.custom),
    executable: Boolean(item?.executable ?? workflowId === DIRECT_AGENT_WORKFLOW_ID),
    draft: Boolean(item?.draft),
    nodes,
    edges: rawEdges.map(normalizeWorkflowEdge).filter((edge) => edge.from && edge.to),
  };
}

export function normalizeWorkflowSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : DEFAULT_WORKFLOW_SETTINGS;
  const presets = Array.isArray(source.presets) && source.presets.length
    ? source.presets.map((item, index) => normalizeWorkflowRow(item, DEFAULT_WORKFLOW_SETTINGS.presets[index] || DEFAULT_DIRECT_WORKFLOW)).filter((item) => item.workflow_id)
    : DEFAULT_WORKFLOW_SETTINGS.presets;
  const custom = Array.isArray(source.custom)
    ? source.custom.map((item) => normalizeWorkflowRow(item, { ...DEFAULT_DIRECT_WORKFLOW, custom: true, system: false, editable: true, deletable: true, default: false })).filter((item) => item.workflow_id)
    : [];
  const nodeTypes = Array.isArray(source.node_types) && source.node_types.length
    ? source.node_types
    : DEFAULT_WORKFLOW_NODE_TYPES;
  return {
    default_workflow_id: String(source.default_workflow_id || DIRECT_AGENT_WORKFLOW_ID),
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
    canToggle: item.workflow_id !== DIRECT_AGENT_WORKFLOW_ID,
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
  return [...COMMON_WORKFLOW_OUTPUT_FIELDS, ...(WORKFLOW_NODE_OUTPUT_FIELDS[type] || [])];
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
  const nodeLabel = item.nodeLabel || item.group || 'Node';
  const fieldLabels = {
    status: 'status',
    success: 'done',
    summary: 'answer',
    error: 'error',
    metadata: 'metadata',
    messages: 'messages',
    artifacts: 'artifacts',
    structured: 'structured data',
    citations: 'citations',
    trace: 'trace',
    text: 'text',
    json: 'JSON',
    usage: 'usage',
    finish_reason: 'finish reason',
    raw: 'raw result',
    matched_case: 'matched case',
    selected_target: 'selected target',
    value: 'value',
  };
  return `${nodeLabel} ${fieldLabels[item.fieldId] || item.fieldId || 'value'}`;
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
      }),
      type: field.type || 'any',
      group: typeLabelForWorkflowNode(node.type),
      nodeLabel: node.label || typeLabelForWorkflowNode(node.type),
      fieldId: field.id,
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

export function createWorkflowExamplePatch(agentOptions) {
  const agentId = agentOptions.find((item) => item.id === 'preset.product')?.id
    || agentOptions[0]?.id
    || 'preset.general';
  return {
    display_name: 'Plan and Answer Example',
    description: 'Analyze the request, format a final answer, and return structured fields.',
    nodes: [
      { id: 'start', type: 'start', label: 'Request', input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA, position: { x: 80, y: 220 } },
      {
        id: 'agent_1',
        type: 'agent',
        label: 'Analyze',
        agent_id: agentId,
        prompt: 'Read the user request and produce a concise plan.\n\nUser request:\n{{input.message}}',
        input_mapping: {
          message: '{{input.message}}',
          attachments: '{{input.attachments}}',
          image_attachments: '{{input.image_attachments}}',
        },
        position: { x: 340, y: 220 },
      },
      {
        id: 'llm_1',
        type: 'llm',
        label: 'Format',
        response_format: 'json_object',
        prompt: 'Turn the plan into a short final answer.\n\nOriginal request:\n{{input.message}}\n\nPlan:\n{{nodes.agent_1.summary}}',
        position: { x: 610, y: 220 },
      },
      {
        id: 'output',
        type: 'output',
        label: 'End',
        output_mode: 'json_object',
        output: '{{nodes.llm_1.text}}',
        output_mapping: {
          answer: '{{nodes.llm_1.text}}',
          plan: '{{nodes.agent_1.summary}}',
          request: '{{input.message}}',
        },
        output_schema: {
          type: 'object',
          fields: [
            { id: 'answer', label: 'answer', type: 'string', path: 'output.answer' },
            { id: 'plan', label: 'plan', type: 'string', path: 'output.plan' },
            { id: 'request', label: 'request', type: 'string', path: 'output.request' },
          ],
        },
        position: { x: 880, y: 220 },
      },
    ],
    edges: [
      { from: 'start', to: 'agent_1' },
      { from: 'agent_1', to: 'llm_1' },
      { from: 'llm_1', to: 'output' },
    ],
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
      { id: 'start', type: 'start', label: 'Start', input_schema: DEFAULT_WORKFLOW_INPUT_SCHEMA, position: { x: 80, y: 180 } },
      {
        id: 'output',
        type: 'output',
        label: 'End',
        output_mode: 'json_object',
        output: '{{input.message}}',
        output_mapping: DEFAULT_WORKFLOW_OUTPUT_MAPPING,
        output_schema: DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
        position: { x: 640, y: 180 },
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
    edges: (workflow.edges || []).map((edge) => ({ from: edge.from, to: edge.to })),
  };
}
