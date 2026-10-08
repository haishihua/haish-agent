import React from 'react';
import { BaseEdge, EdgeLabelRenderer, Handle, Position } from '@xyflow/react';
import { agentIconNameForAgentId } from '../../agents/model/agent-settings.js';
import { workflowEdgePath } from '../model/workflow-edge-path.js';
import { WORKFLOW_PORT_SIDES, workflowSideHandle } from '../model/workflow-canvas-editing.js';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { ProviderIcon } from '../../settings/components/settings-ui.jsx';

export const WORKFLOW_FIT_OPTIONS = { padding: 0.2, minZoom: 0.3, maxZoom: 0.9 };

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
  start: 'Trigger', output: 'Complete',
  agent: 'Agent', llm: 'Model', tool: 'Tool', condition: 'Condition',
  human_approval: 'Approval', loop: 'Loop',
};

export const WORKFLOW_BRANCHES = {
  condition: ['true', 'false'],
  human_approval: ['approved', 'rejected'],
  loop: ['retry', 'exhausted'],
};

// 分支的文案只有这一份：label 是把手/无障碍用的短词，edgeLabel 是画布上那枚小 pill 的文案
// （回环的两条支路说清楚自己是哪一种：还要再跑一轮 / 已经用满次数）。
export const WORKFLOW_BRANCH_META = {
  true: { label: 'True', edgeLabel: 'True' },
  false: { label: 'False', edgeLabel: 'False' },
  approved: { label: 'Approved', edgeLabel: 'Approved' },
  rejected: { label: 'Rejected', edgeLabel: 'Rejected' },
  retry: { label: 'Retry', edgeLabel: 'Need retry' },
  exhausted: { label: 'Exhausted', edgeLabel: 'Max retries' },
};

export function workflowNodeMeta(nodeType) {
  return WORKFLOW_NODE_META[nodeType] || { icon: 'box' };
}

// 类型色只有一份（app-shell.css 里 .workflow-canvas 上的 --workflow-accent-*）：节点的描边/图标色
// 与连线的渐变都从这里取色，JS 里不再抄一份十六进制颜色。
const WORKFLOW_ACCENT_VARS = {
  start: 'var(--workflow-accent-start)',
  agent: 'var(--workflow-accent-agent)',
  llm: 'var(--workflow-accent-llm)',
  tool: 'var(--workflow-accent-tool)',
  condition: 'var(--workflow-accent-condition)',
  human_approval: 'var(--workflow-accent-human_approval)',
  loop: 'var(--workflow-accent-loop)',
  output: 'var(--workflow-accent-output)',
};

export function workflowNodeAccent(nodeType) {
  return WORKFLOW_ACCENT_VARS[nodeType] || WORKFLOW_ACCENT_VARS.agent;
}

// 画布上的边只有这一套外观（配置页与运行页共用），按「这条边在图里扮演什么」分四种角色：
//   main     主流程：源类型色 → 目标类型色的渐变实线（绿→蓝→蓝→紫顺着链路走），2px，不打虚线/标签/箭头；
//   detour   支路（判定走 false 进次级链）：蓝色虚线；
//   loopback 回环（次级链回到主链，retry / exhausted）：青色虚线，间距均匀；
//   end      收尾（进 output 那条）：源类型色 → End 紫的渐变，亮度低一档。
// 正在走的那条（.is-flowing）与走过的（.is-traversed）在上面这层配色上再叠一档；颜色/线宽/
// 虚线/标签/箭头都只在这里给一次，画法只有 WorkflowCanvasEdge 一份。
export const WORKFLOW_EDGE_ROLES = {
  main: { gradient: true, strokeWidth: 2, opacity: 0.78 },
  detour: { stroke: 'rgba(122, 176, 245, 0.92)', strokeWidth: 2, dash: '10 7', arrow: true },
  loopback: { stroke: 'rgba(104, 220, 240, 0.95)', strokeWidth: 2, dash: '10 7', arrow: true },
  end: { gradient: true, strokeWidth: 2, opacity: 0.62, arrow: true },
};

const ACTIVE_EDGE_STROKE = 'rgba(105, 200, 246, 0.9)';

export function workflowEdgeAppearance(edge, {
  active = false,
  traversed = false,
  sourceLayout,
  targetLayout,
  sourceType = '',
  targetType = '',
  sourceNode,
} = {}) {
  const feedback = (edge?.branch === 'retry' || sourceLayout?.kind === 'secondary')
    && targetLayout?.kind === 'primary' && targetType !== 'loop';
  // 回环（从次级链回主链）优先于「进 output」：retry/exhausted 两条回路必须一眼看出是回路。
  const role = sourceType === 'loop' || sourceLayout?.kind === 'secondary'
    ? 'loopback'
    : (targetType === 'loop' || targetLayout?.kind === 'secondary' ? 'detour' : (targetType === 'output' ? 'end' : 'main'));
  // cases/default gates have no edge.branch. Resolve visual ports only; never rewrite execution data.
  const defaultCase = sourceNode?.default === String(edge?.to || edge?.target || '');
  const branch = edge?.branch || (sourceType === 'condition'
    ? (defaultCase || role === 'detour' ? 'false' : 'true') : undefined);
  const base = WORKFLOW_EDGE_ROLES[role];
  const circuit = role === 'detour' || role === 'loopback';
  return {
    sourceHandle: branch || undefined,
    targetHandle: feedback ? 'runtime-feedback' : undefined,
    type: 'workflowEdge',
    data: {
      active,
      traversed,
      role,
      // 标签只给回路/支路：主链上是干净的一条线（减视觉噪音），箭头同理。
      label: circuit && branch
        ? (defaultCase && targetType === 'loop' ? 'Need retry' : (WORKFLOW_BRANCH_META[branch]?.edgeLabel || '')) : '',
      arrow: Boolean(base.arrow),
      // 颜色来源只有这一份：渐变（源类型色 → 目标类型色）或纯色——具体画法只在 WorkflowCanvasEdge。
      paint: base.gradient
        ? { from: workflowNodeAccent(sourceType), to: workflowNodeAccent(targetType) }
        : { solid: base.stroke },
      opacity: base.opacity ?? 1,
    },
    interactionWidth: 28,
    className: active ? 'is-flowing' : (traversed ? 'is-traversed' : ''),
    style: {
      strokeWidth: base.strokeWidth,
      ...(base.dash ? { strokeDasharray: base.dash } : {}),
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
  const secondary = node?.type === 'loop' || layoutMeta?.kind === 'secondary';
  const sourcePosition = secondary
    ? (direction === 'right' ? Position.Left : Position.Right)
    : (direction === 'right' ? Position.Right : Position.Left);
  return {
    sourcePosition,
    targetPosition: secondary
      ? (node?.type === 'loop' ? (direction === 'right' ? Position.Right : Position.Left) : Position.Top)
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
    if (edge?.branch === 'retry'
      || (layoutMeta?.get(source)?.kind === 'secondary' && layoutMeta?.get(target)?.kind === 'primary')) {
      targets.add(target);
    }
  }
  return targets;
}

/**
 * 两页共用的边渲染器（core line + subtle outer glow 两层）：同一段 path 先铺一层很淡的
 * glow（CSS 里 blur 5px，只糊它自己），再叠清晰的核心线；正在走的那条再多一道沿线亮斑。
 * 路径几何不在这里，也不在 React Flow 的默认路由里，而在 model/workflow-edge-path.js（唯一一份）：
 * 大圆角 smooth step —— 端口先走 24px 直线、转弯一律 32px 圆弧、绕行只绕最短那一条。
 * 主流程/收尾线的颜色是「源类型色 → 目标类型色」的线性渐变（用户空间坐标，沿着这段线铺），
 * 回环/支路是纯色虚线；小箭头用 7px 实心小三角 marker（userSpaceOnUse，缩放画布也不变大，
 * refX 往回让 8px，让箭头停在卡片外面而不是被节点盖住），
 * 标签是中间那枚小 pill（EdgeLabelRenderer，CSS 在 app-shell.css）。
 * 两页注册的是同一个组件：配置页选中的边与运行页当前走的那条边只有状态不同，没有第二套画法。
 */
// 渐变 / marker 的 id 必须整页唯一：同一张图在配置页与运行页各渲染一次（同一个文档里），拿边 id 拼
// 会撞车，url(#…) 会解析到另一页那一个（颜色是另一页的状态色）。
let workflowEdgePaintSeq = 0;

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
  const [paintUid] = React.useState(() => {
    workflowEdgePaintSeq += 1;
    return `workflow-edge-paint-${workflowEdgePaintSeq}`;
  });
  const [markerUid] = React.useState(() => {
    workflowEdgePaintSeq += 1;
    return `workflow-edge-arrow-${workflowEdgePaintSeq}`;
  });
  const active = Boolean(data?.active);
  const traversed = Boolean(data?.traversed);
  // 路径几何只有一份来源（model/workflow-edge-path.js）：大圆角 smooth step，端口先走直线再转弯，
  // 标签锚点钉在线段中段。两页注册的是同一个组件，所以形状天然一致。
  const { path, labelX, labelY } = workflowEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: sourcePosition || Position.Right,
    targetPosition: targetPosition || Position.Left,
  });
  // 颜色来源（渐变 / 纯色）由 workflowEdgeAppearance 给；这里只负责把它画出来，两页同一份。
  const paint = data?.paint || { solid: 'rgba(170, 192, 224, 0.34)' };
  const gradient = Boolean(paint.from && paint.to);
  const roleStroke = gradient ? `url(#${paintUid})` : paint.solid;
  const stroke = active ? ACTIVE_EDGE_STROKE : roleStroke;
  const baseOpacity = Number(data?.opacity ?? 1);
  const coreOpacity = active ? 1 : Math.min(1, traversed ? baseOpacity + 0.22 : baseOpacity);
  const coreWidth = active ? Number(style?.strokeWidth || 2) + 0.4 : style?.strokeWidth;
  const dash = style?.strokeDasharray;
  const arrow = Boolean(data?.arrow);
  // 箭头颜色：纯色边用自己那一档；渐变边用渐变末端（目标类型色）那一档。
  const arrowFill = paint.solid || paint.to;
  return (
    <>
      {gradient ? (
        <defs>
          <linearGradient
            id={paintUid}
            gradientUnits="userSpaceOnUse"
            x1={sourceX}
            y1={sourceY}
            x2={targetX}
            y2={targetY}
          >
            <stop offset="0%" style={{ stopColor: paint.from }} />
            <stop offset="100%" style={{ stopColor: paint.to }} />
          </linearGradient>
        </defs>
      ) : null}
      {arrow ? (
        <defs>
          <marker
            id={markerUid}
            viewBox="0 0 8 8"
            markerWidth={7}
            markerHeight={7}
            refX={15.4}
            refY={4}
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0.8 1.1 L6.2 4 L0.8 6.9 Z" fill={active ? stroke : arrowFill} />
          </marker>
        </defs>
      ) : null}
      <path
        className="workflow-edge-glow"
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={7}
        strokeOpacity={active ? 0.42 : (traversed ? 0.32 : 0.26)}
        strokeDasharray={dash}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={interactionWidth}
        markerEnd={arrow ? `url(#${markerUid})` : undefined}
        style={{
          ...style,
          stroke,
          strokeOpacity: coreOpacity,
          strokeWidth: coreWidth,
          strokeLinecap: 'round',
        }}
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
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="workflow-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
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
      className={`workflow-flow-node ${nodeType} ${selected ? 'active' : ''}${data?.dropPreview ? ' is-drop-preview' : ''}${runtimeStatus ? ` is-runtime status-${runtimeStatus}` : ''}${runtimeDetailAvailable ? ' has-runtime-detail' : ''}${data?.reconnectType ? ' is-reconnecting' : ''}`}
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
          style={{ left: '50%' }}
        />
      ) : null}
      {runtimeStatus === 'running' ? (
        <span className="workflow-node-live-badge" role="status"><i aria-hidden="true" />Running</span>
      ) : null}
      <span className="workflow-flow-node-icon" aria-hidden="true">
        <AppIcon name={iconName} size={22} />
      </span>
      <span className="workflow-flow-node-copy">
        <strong>{node.label}</strong>
        {NODE_TYPE_LABEL[nodeType] ? <small className={data?.runtimeModelId ? 'workflow-node-model' : undefined}>{data?.runtimeModelId ? <><ProviderIcon provider={data.runtimeProvider} /><span>Agent · {data.runtimeModelId}</span></> : NODE_TYPE_LABEL[nodeType]}</small> : null}
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
      {['source', 'target'].flatMap((type) => WORKFLOW_PORT_SIDES.map((side) => {
        const id = workflowSideHandle(type, side);
        const available = data?.reconnectType === type;
        const used = data?.usedSideHandles?.includes(id);
        return <Handle key={id} id={id} type={type} position={side}
          className={`workflow-side-handle${available ? ' is-available' : ''}${used ? ' is-used' : ''}`}
          isConnectableStart={false} isConnectableEnd={available}
          aria-label={`${type} ${side}`} />;
      }))}
    </div>
  );
}
import '@xyflow/react/dist/style.css';
