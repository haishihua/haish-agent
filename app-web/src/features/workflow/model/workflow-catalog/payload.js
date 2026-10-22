// 自定义工作流的创建模板与保存 payload。
import { DEFAULT_DIRECT_WORKFLOW, DEFAULT_WORKFLOW_INPUT_SCHEMA } from '../workflow-defaults.js';
import {
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  normalizeWorkflowRow,
} from './nodes.js';

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
      ...(['true', 'false', 'approved', 'rejected', 'retry', 'exhausted'].includes(edge.branch)
        ? { branch: edge.branch }
        : {}),
    })),
  };
}
