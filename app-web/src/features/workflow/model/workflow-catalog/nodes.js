// 节点 / 边 / 整行工作流的规范化，以及 End 节点的输出契约默认值。
import {
  DEFAULT_DIRECT_WORKFLOW,
  DEFAULT_WORKFLOW_INPUT_SCHEMA,
  COMMON_WORKFLOW_OUTPUT_FIELDS,
  WORKFLOW_NODE_OUTPUT_FIELDS,
} from '../workflow-defaults.js';
import { typeLabelForWorkflowNode } from './labels.js';
import { sanitizeWorkflowTemplateValue, workflowArgumentsText } from './template.js';

export const DEFAULT_WORKFLOW_OUTPUT_MAPPING = {
  answer: '{{input.message}}',
};
export const DEFAULT_WORKFLOW_OUTPUT_SCHEMA = {
  type: 'object',
  fields: [{ id: 'answer', label: 'answer', type: 'string', path: 'output.answer' }],
};

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
  const positionX = Number(position.x);
  const positionY = Number(position.y);
  return {
    ...fallback,
    ...data,
    id: nodeId,
    type,
    // Keep empty labels as-is; `||` would bounce "" back to the previous name
    // and make Backspace/Delete look broken in the detail panel.
    label: String(data.label ?? fallback.label ?? typeLabelForWorkflowNode(type)),
    // 没写过的节点不要凭空补一个 (0,0)：那是「没排过」而不是「排到原点」。配置页一旦拖过
    // 节点就会把整张图的排布写进来（见 workflowArrangementPositions）。
    ...(Number.isFinite(positionX) && Number.isFinite(positionY)
      ? { position: { x: positionX, y: positionY } }
      : {}),
  };
}

export function normalizeWorkflowEdge(edge) {
  const rawBranch = String(edge?.branch || edge?.source_handle || edge?.sourceHandle || '').trim().toLowerCase();
  const branch = rawBranch === 'default' ? 'false' : rawBranch;
  return {
    from: String(edge?.from || edge?.source || '').trim(),
    to: String(edge?.to || edge?.target || '').trim(),
    ...(['true', 'false', 'approved', 'rejected', 'retry', 'exhausted'].includes(branch) ? { branch } : {}),
  };
}

export function normalizeWorkflowRow(item, fallback = DEFAULT_DIRECT_WORKFLOW) {
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
    executable: Boolean(item?.executable ?? fallback.executable),
    draft: Boolean(item?.draft),
    nodes,
    edges,
  };
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
