//   labels     纯数据表（节点类型标签、变量字段标签）
//   template   模板变量与输入展示文案
//   nodes      节点 / 边 / 整行规范化 + End 输出契约
//   layout     落点、拖放吸附与自动排版
//   settings   设置项规范化与列表投影
//   variables  模板变量目录
//   payload    自定义工作流的创建模板与保存 payload
import {
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  buildWorkflowOutputPatch,
  normalizeWorkflowEdge,
  normalizeWorkflowNode,
  normalizeWorkflowRow,
  workflowOutputFields,
  workflowOutputMappingEntries,
  workflowSchemaFields,
} from './workflow-catalog/nodes.js';
import { typeLabelForWorkflowNode } from './workflow-catalog/labels.js';
import {
  reconcileWorkflowParameterTemplate,
  sanitizeWorkflowTemplateValue,
  workflowArgumentsText,
  workflowInputDisplayText,
  workflowParameterEntries,
  workflowTemplateVariablePath,
  workflowTemplateWithParameterAliases,
  workflowTokenRangeAt,
  workflowVariableTypeForValue,
} from './workflow-catalog/template.js';
import { placeAddedWorkflowNode, placeDroppedWorkflowNode } from './workflow-catalog/layout.js';
import {
  normalizeWorkflowSettings,
  workflowById,
  workflowListItems,
} from './workflow-catalog/settings.js';
import { workflowVariableCatalog } from './workflow-catalog/variables.js';
import {
  createDefaultCustomWorkflowPayload,
  payloadForCustomWorkflow,
} from './workflow-catalog/payload.js';

export {
  DEFAULT_WORKFLOW_OUTPUT_MAPPING,
  DEFAULT_WORKFLOW_OUTPUT_SCHEMA,
  buildWorkflowOutputPatch,
  createDefaultCustomWorkflowPayload,
  normalizeWorkflowEdge,
  normalizeWorkflowNode,
  normalizeWorkflowRow,
  normalizeWorkflowSettings,
  payloadForCustomWorkflow,
  placeAddedWorkflowNode,
  placeDroppedWorkflowNode,
  reconcileWorkflowParameterTemplate,
  sanitizeWorkflowTemplateValue,
  typeLabelForWorkflowNode,
  workflowArgumentsText,
  workflowById,
  workflowInputDisplayText,
  workflowListItems,
  workflowOutputFields,
  workflowOutputMappingEntries,
  workflowParameterEntries,
  workflowSchemaFields,
  workflowTemplateVariablePath,
  workflowTemplateWithParameterAliases,
  workflowTokenRangeAt,
  workflowVariableCatalog,
  workflowVariableTypeForValue,
};
