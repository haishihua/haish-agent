// 工作流目录：设置项规范化、列表投影与按 id 查找。
import {
  DIRECT_AGENT_WORKFLOW_ID,
  DEFAULT_WORKFLOW_NODE_TYPES,
  DEFAULT_DIRECT_WORKFLOW,
  DEFAULT_WORKFLOW_SETTINGS,
} from '../workflow-defaults.js';
import { normalizeWorkflowRow } from './nodes.js';
import { layoutWorkflowNodes } from './layout.js';

function withCanonicalWorkflowLayout(workflow) {
  if (!workflow || workflow.custom) return workflow;
  if (!workflow.system) return workflow;
  return {
    ...workflow,
    nodes: layoutWorkflowNodes(workflow.nodes, workflow.edges),
  };
}

export function normalizeWorkflowSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : DEFAULT_WORKFLOW_SETTINGS;
  const presets = Array.isArray(source.presets)
    ? source.presets
      .map((item) => normalizeWorkflowRow(item, DEFAULT_DIRECT_WORKFLOW))
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
    canToggle: item.custom || item.editable,
    canConfigure: Boolean(item.custom) || item.editable,
  }));
}

export function workflowById(settings, workflowId) {
  const normalized = normalizeWorkflowSettings(settings);
  return [...normalized.presets, ...normalized.custom].find((item) => item.workflow_id === workflowId) || null;
}
