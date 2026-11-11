/** Workflow graph editor constants and pure graph-edit helpers shared by the editor panes. */

import { isWorkflowEdgeBranch } from '../../../../core/workflow-catalog/nodes.js';

export const WORKFLOW_NODE_DRAG_TYPE = 'application/x-haish-workflow-node';

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
  if (isWorkflowEdgeBranch(normalizedBranch)) {
    return [
      ...edges.filter((edge) => !(edge.from === from && edge.branch === normalizedBranch)),
      { from, to, branch: normalizedBranch },
    ];
  }
  if (edges.some((edge) => edge.from === from && edge.to === to && !edge.branch)) return edges;
  return [...edges, { from, to }];
}
