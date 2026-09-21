import React from 'react';
import { BaseEdge, Handle, Position, getSmoothStepPath } from '@xyflow/react';
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
  output: { icon: 'workflow-output' },
};

const NODE_TYPE_LABEL = {
  agent: 'Agent', llm: 'Model', tool: 'Tool', condition: 'Condition',
  human_approval: 'Approval', loop: 'Loop',
};

export const WORKFLOW_BRANCHES = {
  condition: ['true', 'false'],
  human_approval: ['approved', 'rejected'],
  loop: ['retry', 'exhausted'],
};

export const WORKFLOW_BRANCH_META = {
  true: { label: 'True' },
  false: { label: 'False' },
  approved: { label: 'Approved' },
  rejected: { label: 'Rejected' },
  retry: { label: 'Retry' },
  exhausted: { label: 'Exhausted' },
};

export function workflowNodeMeta(nodeType) {
  return WORKFLOW_NODE_META[nodeType] || { icon: 'box' };
}

// 画布上的边只有这一套外观（配置页与运行页共用）：平时是一条细的中性线，正在走的那条
// （.is-flowing）换成运行蓝、加粗到 2px、外圈一层软光，另有一道亮斑沿线在跑（动效在
// app-shell.css）；已经走过的（.is-traversed）比未走的亮一档。不画文字标签、不画箭头，
// 也不给整条线打虚线。配置页选中的边就是把同一套外观的 flowing 状态打开，不另配一套。
export function workflowEdgeAppearance(edge, {
  active = false,
  traversed = false,
  sourceLayout,
  targetLayout,
} = {}) {
  const curved = sourceLayout?.row !== targetLayout?.row
    || sourceLayout?.kind === 'secondary'
    || targetLayout?.kind === 'secondary';
  const reworkEdge = sourceLayout?.kind !== targetLayout?.kind;
  const feedback = sourceLayout?.kind === 'secondary' && targetLayout?.kind === 'primary';
  return {
    sourceHandle: edge?.branch || undefined,
    targetHandle: feedback ? 'runtime-feedback' : undefined,
    type: 'workflowEdge',
    data: {
      active,
      traversed,
      borderRadius: curved ? 28 : 10,
      offset: curved ? (reworkEdge ? 0 : 28) : (edge?.branch === 'retry' ? 0 : 20),
    },
    interactionWidth: 28,
    className: active ? 'is-flowing' : (traversed ? 'is-traversed' : ''),
    style: {
      stroke: active
        ? 'rgba(105, 200, 246, 0.9)'
        : (traversed ? 'rgba(129, 166, 159, 0.5)' : 'rgba(169, 187, 211, 0.32)'),
      strokeWidth: active ? 2 : 1.5,
    },
    zIndex: active ? 1 : 0,
  };
}

/**
 * 节点端口（两页共用的唯一一份）：主链按行走向给左右出入端口；副链（返工）节点输入统一走顶部、
 * 出口跟节点自己那一侧；loop 的 retry 出口永远和它自己的出端口同侧。配置页和运行页都必须调这里
 * ——两边各写一份就会悄悄长歪（配置页曾把 retry 画在节点顶部、运行页画在左侧，同一条边在两页
 * 形状不同，看起来就是「边的端点两个都不一样」）。
 */
export function workflowNodePorts(node, layoutMeta) {
  const direction = layoutMeta?.direction || 'right';
  const secondary = layoutMeta?.kind === 'secondary';
  const sourcePosition = secondary
    ? (direction === 'right' ? Position.Left : Position.Right)
    : (direction === 'right' ? Position.Right : Position.Left);
  return {
    sourcePosition,
    targetPosition: secondary
      ? Position.Top
      : (direction === 'right' ? Position.Left : Position.Right),
    branchSourcePositions: secondary && node?.type === 'loop' ? { retry: sourcePosition } : undefined,
  };
}

/** 次级节点回到主链的那条边落在主节点底部的回环端口（两页共用同一份判断）。 */
export function workflowFeedbackTargetIds(edges, layoutMeta) {
  const targets = new Set();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const source = String(edge?.from || edge?.source || '');
    const target = String(edge?.to || edge?.target || '');
    if (layoutMeta?.get(source)?.kind === 'secondary' && layoutMeta?.get(target)?.kind === 'primary') {
      targets.add(target);
    }
  }
  return targets;
}

/**
 * 两页共用的边渲染器：中性细线上再叠「正在走」的软光和沿线亮斑。两页注册的是同一个组件，
 * 配置页选中的边与运行页当前走的那条边走的就是这份代码，只有状态不同、没有第二套画法。
 */
export function WorkflowCanvasEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  interactionWidth,
}) {
  const active = Boolean(data?.active);
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition || Position.Right,
    targetPosition: targetPosition || Position.Left,
    borderRadius: Number(data?.borderRadius ?? 20),
    offset: Number(data?.offset ?? 20),
  });
  const stroke = style?.stroke || 'rgba(169, 187, 211, 0.32)';
  return (
    <>
      {active ? (
        <path
          className="workflow-edge-halo"
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={7}
          strokeOpacity={0.16}
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={interactionWidth}
        style={{ ...style, strokeLinecap: 'round' }}
      />
      {active ? (
        <path
          className="workflow-edge-spark"
          d={path}
          fill="none"
          stroke="#eaf4ff"
          strokeWidth={2}
          strokeOpacity={0.72}
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
    </>
  );
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
      title={`${node.label || nodeType}${runtimeStatus ? ` · ${data.runtimeStatusLabel || runtimeStatus}` : ''}`}
      aria-label={`${node.label || nodeType}${runtimeStatus ? ` · ${data.runtimeStatusLabel || runtimeStatus}` : ''}`}
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
        <AppIcon name={iconName} size={20} />
      </span>
      <span className="workflow-flow-node-copy">
        <strong>{node.label}</strong>
        {NODE_TYPE_LABEL[nodeType] ? <small>{NODE_TYPE_LABEL[nodeType]}</small> : null}
      </span>
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
import '@xyflow/react/dist/style.css';
