// 边外观里能脱离 React 的那一半：四条角色的样式表，以及「正在走 / 走过的」在上面叠加的那一档。
// 这些数值以前钉在 WorkflowFlowNode.jsx 的源码文本上（`main: { gradient: true, … },` 这种写法），
// 换个排版就红；抽到 model 后按输入输出对拍，改值才红、改写法不红。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKFLOW_EDGE_ROLES,
  workflowEdgePaintState,
} from '../../../src/features/workflow/model/workflow-edge-appearance.js';

test('四条边角色各自的线宽/不透明度/虚线/箭头只定义一份', () => {
  // 主流程与收尾是渐变线（两端颜色由 workflowEdgeAppearance 按源/目标类型给），不打虚线。
  assert.deepEqual(WORKFLOW_EDGE_ROLES.main, { gradient: true, strokeWidth: 2, opacity: 0.78 });
  assert.deepEqual(WORKFLOW_EDGE_ROLES.end, { gradient: true, strokeWidth: 2, opacity: 0.62, arrow: true });
  // 支路/回环是纯色虚线 + 箭头。
  assert.deepEqual(WORKFLOW_EDGE_ROLES.detour, {
    stroke: 'rgba(122, 176, 245, 0.92)', strokeWidth: 2, dash: '10 7', arrow: true,
  });
  assert.deepEqual(WORKFLOW_EDGE_ROLES.loopback, {
    stroke: 'rgba(104, 220, 240, 0.95)', strokeWidth: 2, dash: '10 7', arrow: true,
  });
  // 虚线只给支路/回环：主链上出现虚线就是「另一套画法」又回来了。
  assert.deepEqual(
    Object.entries(WORKFLOW_EDGE_ROLES).filter(([, role]) => role.dash).map(([name]) => name),
    ['detour', 'loopback'],
  );
  // 收尾比主流程暗一档：进 End 的线不该抢走在跑的那条。
  assert.ok(WORKFLOW_EDGE_ROLES.end.opacity < WORKFLOW_EDGE_ROLES.main.opacity);
});

test('正在走的边整条换运行蓝并加粗，走过的只在不透明度上加一档', () => {
  const gradientEdge = {
    data: { paint: { from: 'var(--workflow-accent-agent)', to: 'var(--workflow-accent-output)' }, opacity: 0.62 },
    style: { strokeWidth: 2 },
  };
  const idle = workflowEdgePaintState({ ...gradientEdge, active: false, traversed: false });
  // 渐变边不给 stroke：组件要用自己那个整页唯一的渐变 id 拼 url(#…)，这里只是留空。
  assert.equal(idle.stroke, null);
  assert.equal(idle.gradient, true);
  assert.equal(idle.coreOpacity, 0.62);
  assert.equal(idle.coreWidth, 2);

  const active = workflowEdgePaintState({ ...gradientEdge, active: true });
  assert.equal(active.stroke, 'rgba(105, 200, 246, 0.9)');
  // 在走的那条永远满亮，不受角色不透明度拖累；线宽比角色宽 0.4。
  assert.equal(active.coreOpacity, 1);
  assert.equal(active.coreWidth, 2.4);

  // 走过的：提亮一档；再亮也不会超过 1，也不会盖过 active。
  assert.equal(workflowEdgePaintState({ ...gradientEdge, traversed: true }).coreOpacity, 0.84);
  const bright = { data: { ...gradientEdge.data, opacity: 0.9 }, style: { strokeWidth: 2 } };
  assert.equal(workflowEdgePaintState({ ...bright, traversed: true }).coreOpacity, 1);
});

test('纯色边用自己那一档描边，没给外观时退回中性灰', () => {
  const solid = workflowEdgePaintState({
    data: { paint: { solid: 'rgba(122, 176, 245, 0.92)' }, opacity: 0.78 },
    style: { strokeWidth: 2, strokeDasharray: '10 7' },
  });
  assert.equal(solid.gradient, false);
  assert.equal(solid.paint.solid, 'rgba(122, 176, 245, 0.92)');
  // 箭头颜色：纯色边用自己那一档。
  assert.equal(solid.arrowFill, 'rgba(122, 176, 245, 0.92)');

  // 渐变边的箭头用渐变末端（目标类型色）那一档，不是源色。
  assert.equal(
    workflowEdgePaintState({ data: { paint: { from: 'var(--a)', to: 'var(--b)' } } }).arrowFill,
    'var(--b)',
  );

  // 没有外观（旧数据 / 还没算出来的边）也得画得出来：中性灰纯色，不透明度按 1。
  const fallback = workflowEdgePaintState();
  assert.deepEqual(fallback.paint, { solid: 'rgba(170, 192, 224, 0.34)' });
  assert.equal(fallback.gradient, false);
  assert.equal(fallback.coreOpacity, 1);
  assert.equal(fallback.arrowFill, 'rgba(170, 192, 224, 0.34)');
  // 没有线宽时按 2 算（再 +0.4 才是 active 的宽度）。
  assert.equal(fallback.coreWidth, undefined);
  assert.equal(workflowEdgePaintState({ active: true }).coreWidth, 2.4);
});
