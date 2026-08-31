import React from 'react';
import { Handle, MarkerType, Position } from '@xyflow/react';
import { agentIconNameForAgentId } from '../../agents/model/agent-settings.js';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';

const WORKFLOW_NODE_META = {
  start: { icon: 'play' },
  agent: { icon: 'workflow-agent' },
  llm: { icon: 'workflow-llm' },
  tool: { icon: 'workflow-tool' },
  condition: { icon: 'workflow-condition' },
  human_approval: { icon: 'workflow-approval' },
  loop: { icon: 'workflow-loop' },
  output: { icon: 'circle-check' },
};

const WORKFLOW_RUNTIME_STATUS_ICON = {
  pending: 'clock',
  running: 'loader',
  waiting_input: 'message',
  approval: 'pause-circle',
  approved: 'circle-check',
  rejected: 'circle-x',
  done: 'circle-check',
  failed: 'circle-x',
  cancelled: 'ban',
};

export const WORKFLOW_BRANCHES = {
  condition: ['true', 'false'],
  human_approval: ['approved', 'rejected'],
  loop: ['retry', 'exhausted'],
};

export const WORKFLOW_BRANCH_META = {
  true: { label: 'True', tone: 'positive' },
  false: { label: 'False', tone: 'muted' },
  approved: { label: 'Approved', tone: 'positive' },
  rejected: { label: 'Rejected', tone: 'negative' },
  retry: { label: 'Retry', tone: 'warning' },
  exhausted: { label: 'Exhausted', tone: 'negative' },
};

export function workflowNodeMeta(nodeType) {
  return WORKFLOW_NODE_META[nodeType] || { icon: 'box' };
}

export function workflowEdgeAppearance(edge, { active = false } = {}) {
  const branchTone = WORKFLOW_BRANCH_META[edge?.branch]?.tone;
  const branchColor = branchTone === 'positive'
    ? 'rgba(120, 218, 139, 0.42)'
    : branchTone === 'negative'
      ? 'rgba(238, 122, 145, 0.42)'
      : branchTone === 'warning'
        ? 'rgba(238, 182, 96, 0.46)'
        : edge?.branch
          ? 'rgba(176, 196, 220, 0.3)'
          : 'rgba(185, 196, 216, 0.26)';
  return {
    sourceHandle: edge?.branch || undefined,
    type: edge?.branch ? 'smoothstep' : 'straight',
    pathOptions: edge?.branch ? { borderRadius: 10, offset: edge.branch === 'retry' ? 0 : 20 } : undefined,
    label: WORKFLOW_BRANCH_META[edge?.branch]?.label,
    labelStyle: edge?.branch
      ? {
        fill: branchTone === 'positive'
          ? 'rgba(144, 226, 158, 0.92)'
          : branchTone === 'negative'
            ? 'rgba(250, 170, 189, 0.92)'
            : branchTone === 'warning'
              ? 'rgba(246, 202, 132, 0.94)'
              : 'rgba(205, 215, 232, 0.68)',
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }
      : undefined,
    labelBgStyle: edge?.branch ? { fill: 'rgba(9, 14, 24, 0.92)' } : undefined,
    labelBgPadding: edge?.branch ? [5, 3] : undefined,
    labelBgBorderRadius: edge?.branch ? 5 : undefined,
    interactionWidth: 28,
    zIndex: edge?.branch ? 2 : 0,
    style: {
      stroke: active ? 'rgba(105, 200, 246, 0.58)' : branchColor,
      strokeWidth: active ? 1.8 : 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: active ? 'rgba(105, 200, 246, 0.64)' : branchColor,
    },
  };
}

export function WorkflowFlowNode({ data, selected, sourcePosition, targetPosition }) {
  const node = data?.workflowNode || {};
  const nodeType = node.type || 'agent';
  const meta = workflowNodeMeta(nodeType);
  const iconName = nodeType === 'agent'
    ? (data?.agentIconName || agentIconNameForAgentId(node.agent_id, data?.agentOptions))
    : meta.icon;
  const runtimeStatus = String(data?.runtimeStatus || '');
  const runtimeDetailAvailable = Boolean(data?.runtimeDetailAvailable);
  const resolvedSourcePosition = data?.sourcePosition || sourcePosition || Position.Right;
  const resolvedTargetPosition = data?.targetPosition || targetPosition || Position.Left;
  const branchSourcePositions = data?.branchSourcePositions || {};
  const branchHandleStyles = data?.branchHandleStyles || {};

  return (
    <div
      className={`workflow-flow-node ${nodeType} ${selected ? 'active' : ''}${data?.dropPreview ? ' is-drop-preview' : ''}${runtimeStatus ? ` is-runtime status-${runtimeStatus}` : ''}${runtimeDetailAvailable ? ' has-runtime-detail' : ''}`}
    >
      {nodeType !== 'start' ? <Handle type="target" position={resolvedTargetPosition} /> : null}
      {data?.feedbackTarget ? (
        <Handle
          id="runtime-feedback"
          className="workflow-feedback-target-handle"
          type="target"
          position={Position.Bottom}
          style={{ left: '24%' }}
        />
      ) : null}
      <span className="workflow-flow-node-icon" aria-hidden="true">
        <AppIcon name={iconName} size={16} />
      </span>
      <span className="workflow-flow-node-copy">
        <strong>{node.label}</strong>
      </span>
      {runtimeStatus ? (
        <span
          className={`workflow-run-node-status status-${runtimeStatus}`}
          aria-label={`Status: ${data.runtimeStatusLabel || runtimeStatus}`}
          title={data.runtimeStatusLabel || runtimeStatus}
        >
          <AppIcon name={WORKFLOW_RUNTIME_STATUS_ICON[runtimeStatus] || 'clock'} size={16} />
        </span>
      ) : null}
      {WORKFLOW_BRANCHES[nodeType]
        ? WORKFLOW_BRANCHES[nodeType].map((branch, index) => (
          <Handle
            key={branch}
            id={branch}
            className={`workflow-condition-handle is-${branch}`}
            type="source"
            position={branchSourcePositions[branch] || (index === 0 ? resolvedSourcePosition : Position.Bottom)}
            aria-label={`${WORKFLOW_BRANCH_META[branch]?.label || branch} branch`}
            style={branchHandleStyles[branch] || (index === 1 ? { left: '50%' } : undefined)}
          />
        ))
        : null}
      {!WORKFLOW_BRANCHES[nodeType] && nodeType !== 'output'
        ? <Handle type="source" position={resolvedSourcePosition} />
        : null}
    </div>
  );
}
