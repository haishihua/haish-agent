// 端口方向就是 React Flow 的 Position 枚举（两页把这份结果直接铺进节点配置），
// 所以这里引它的枚举，不在 model 里另造一份 'left'/'right' 字符串常量。
import { Position } from '@xyflow/react';

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
