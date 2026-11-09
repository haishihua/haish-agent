// 边外观里能脱离 React 的那一半：角色 → 样式表，以及「正在走 / 走过的」在上面叠加的那一档。
// 装配（把这份外观拼成 React Flow 的边对象）仍在 WorkflowCanvasEdge 那一份里。

// 画布上的边只有这一套外观（配置页与运行页共用），按「这条边在图里扮演什么」分四种角色：
//   main     主流程：源类型色 → 目标类型色的渐变实线（绿→蓝→蓝→紫顺着链路走），2px，不打虚线/标签/箭头；
//   detour   支路（判定走 false 进次级链）：蓝色虚线；
//   loopback 回环（次级链回到主链，retry / exhausted）：青色虚线，间距均匀；
//   end      收尾（进 output 那条）：源类型色 → End 紫的渐变，亮度低一档。
export const WORKFLOW_EDGE_ROLES = {
  main: { gradient: true, strokeWidth: 2, opacity: 0.78 },
  detour: { stroke: 'rgba(122, 176, 245, 0.92)', strokeWidth: 2, dash: '10 7', arrow: true },
  loopback: { stroke: 'rgba(104, 220, 240, 0.95)', strokeWidth: 2, dash: '10 7', arrow: true },
  end: { gradient: true, strokeWidth: 2, opacity: 0.62, arrow: true },
};

const ACTIVE_EDGE_STROKE = 'rgba(105, 200, 246, 0.9)';

/**
 * 正在走的那条（active）整条换成运行蓝、比角色线宽粗 0.4；走过的（traversed）在角色不透明度上
 * 加一档、封顶 1（不能越叠越淡，也不能亮过 active）。
 * 渐变边的 stroke 要等组件里那个整页唯一的渐变 id 才能拼出 url(#…)，所以这里只给纯色边/active 的
 * stroke：渐变边返回 null，由组件换成渐变引用。
 */
export function workflowEdgePaintState({
  data, style, active = false, traversed = false,
} = {}) {
  const paint = data?.paint || { solid: 'rgba(170, 192, 224, 0.34)' };
  const baseOpacity = Number(data?.opacity ?? 1);
  return {
    paint,
    gradient: Boolean(paint.from && paint.to),
    stroke: active ? ACTIVE_EDGE_STROKE : null,
    coreOpacity: active ? 1 : Math.min(1, traversed ? baseOpacity + 0.22 : baseOpacity),
    coreWidth: active ? Number(style?.strokeWidth || 2) + 0.4 : style?.strokeWidth,
    // 箭头颜色：纯色边用自己那一档；渐变边用渐变末端（目标类型色）那一档。
    arrowFill: paint.solid || paint.to,
  };
}
