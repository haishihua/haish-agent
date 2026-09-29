// 连线路由单测：只用几何（没有 DOM），把用户要的形状钉住——
//   · 主链端口面对面、又在同一条线上 ⇒ 一条直线；
//   · 每条线进出端口先走 20–30px 直线，再开始转弯；
//   · 转弯一律 90°、半径 32px（不是 React Flow 默认的小圆角硬折线）；
//   · 回路只走最短那一条（一个拐点能到就不拐第二个），不绕大圈；
//   · 标签锚点落在直段的中段，不卡在拐角里。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKFLOW_EDGE_LEAD,
  WORKFLOW_EDGE_RADIUS,
  workflowEdgePath,
} from '../../../src/features/workflow/model/workflow-edge-path.js';

// 90° 圆弧的三次贝塞尔逼近系数（与实现同一个数学常数，这里重新推一遍而不是抄）。
const ARC = (4 / 3) * Math.tan(Math.PI / 8);
const CARD = { width: 214, height: 72 };

/** 端口坐标：卡片 214x72，left/right 走中线，top/bottom 按比例（0.5 = 中间，0.24 = 回环端口）。 */
function port(node, side, ratio = 0.5) {
  if (side === 'left') return { x: node.x, y: node.y + CARD.height / 2 };
  if (side === 'right') return { x: node.x + CARD.width, y: node.y + CARD.height / 2 };
  if (side === 'top') return { x: node.x + CARD.width * ratio, y: node.y };
  return { x: node.x + CARD.width * ratio, y: node.y + CARD.height };
}

function edge(source, sourceSide, target, targetSide, { sourceRatio = 0.5, targetRatio = 0.5 } = {}) {
  const from = port(source, sourceSide, sourceRatio);
  const to = port(target, targetSide, targetRatio);
  return workflowEdgePath({
    sourceX: from.x,
    sourceY: from.y,
    targetX: to.x,
    targetY: to.y,
    sourcePosition: sourceSide,
    targetPosition: targetSide,
  });
}

function commands(path) {
  const out = [];
  const pattern = /([MLC])([^MLC]*)/g;
  let match = pattern.exec(path);
  while (match) {
    const numbers = match[2].trim().split(/\s+/).map(Number);
    const points = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      points.push({ x: numbers[index], y: numbers[index + 1] });
    }
    out.push({ type: match[1], points });
    match = pattern.exec(path);
  }
  return out;
}

const travel = (path) => {
  const steps = [];
  let previous = null;
  for (const command of commands(path)) {
    if (command.type === 'M') {
      previous = command.points[0];
      continue;
    }
    if (command.type === 'L') {
      steps.push({ kind: 'line', from: previous, to: command.points[0] });
      previous = command.points[0];
      continue;
    }
    const [c1, c2, to] = command.points;
    // 圆弧半径：贝塞尔控制点离弧起点的距离 = r·ARC。
    steps.push({ kind: 'arc', from: previous, c1, c2, to, radius: Math.hypot(c1.x - previous.x, c1.y - previous.y) / ARC });
    previous = to;
  }
  return steps;
};

const length = (from, to) => Math.hypot(to.x - from.x, to.y - from.y);
const arcs = (path) => travel(path).filter((step) => step.kind === 'arc');
const lines = (path) => travel(path).filter((step) => step.kind === 'line');
const closeTo = (value, expected, tolerance = 0.05) => Math.abs(value - expected) <= tolerance;

/** 端口出来的第一段直线（含圆弧切掉的那部分以后剩下的净直线）。 */
const leadIn = (path) => lines(path)[0]?.from && lines(path).length && length(lines(path)[0].from, lines(path)[0].to);
const leadOut = (path) => {
  const list = lines(path);
  return list.length ? length(list[list.length - 1].from, list[list.length - 1].to) : 0;
};

// 系统预设 Goal Loop（core/workflow/model.py）在新排布下的坐标：Retry 挂在判定下方 192px。
const SYSTEM = {
  start: { x: 48, y: 96 },
  worker: { x: 286, y: 96 },
  verifier: { x: 524, y: 96 },
  gate: { x: 762, y: 96 },
  loop: { x: 524, y: 288 },
  output: { x: 762, y: 384 },
};

test('main chain: ports face each other on one line → a single straight line', () => {
  for (const [source, target] of [['start', 'worker'], ['worker', 'verifier'], ['verifier', 'gate']]) {
    const path = edge(SYSTEM[source], 'right', SYSTEM[target], 'left');
    assert.equal(path.kind, 'polyline');
    assert.deepEqual(path.points, [
      { x: SYSTEM[source].x + CARD.width, y: SYSTEM[source].y + CARD.height / 2 },
      { x: SYSTEM[target].x, y: SYSTEM[target].y + CARD.height / 2 },
    ]);
    // 直线：只有 M + L，没有圆弧。
    assert.equal(arcs(path.path).length, 0);
    assert.equal(commands(path.path).map((command) => command.type).join(''), 'ML');
    assert.ok(lines(path.path)[0].from.y === lines(path.path)[0].to.y, '主链是一条水平直线');
  }
});

test('every turn is a 32px quarter arc and every port keeps a straight lead', () => {
  const edges = {
    // 判定 → End：从右端口出去，绕到 End 的右端口（一个 C 形，两个圆弧）。
    gateToOutput: edge(SYSTEM.gate, 'right', SYSTEM.output, 'right'),
    // 判定 → Retry：从右端口出去，落到 Retry 顶部的输入端口。
    gateToLoop: edge(SYSTEM.gate, 'right', SYSTEM.loop, 'top'),
    // Retry → Worker：retry 从自己那一侧（左）出去，落到 Worker 底部的回环端口。
    loopToWorker: edge(SYSTEM.loop, 'left', SYSTEM.worker, 'bottom', { targetRatio: 0.24 }),
    // Retry → End：超限边从 Retry 底部出去，落到 End 的右端口。
    loopToOutput: edge(SYSTEM.loop, 'bottom', SYSTEM.output, 'right'),
  };
  for (const [name, path] of Object.entries(edges)) {
    const turns = arcs(path.path);
    assert.ok(turns.length >= 1, `${name}: 有圆弧`);
    for (const turn of turns) {
      // 半径就是工作台那档 32px；只有两个拐点共用一段短直线时按段长对半收（最短也 ≥ 24）。
      assert.ok(
        turn.radius >= 24 && turn.radius <= WORKFLOW_EDGE_RADIUS + 0.01,
        `${name}: 转弯半径 ${turn.radius.toFixed(2)}（≥ 24，尽量 ${WORKFLOW_EDGE_RADIUS}）`,
      );
      // 90°：进弧和出弧的切线互相垂直。
      const incoming = { x: turn.c1.x - turn.from.x, y: turn.c1.y - turn.from.y };
      const outgoing = { x: turn.to.x - turn.c2.x, y: turn.to.y - turn.c2.y };
      const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
      assert.ok(Math.abs(dot) < 1e-6, `${name}: 拐点是 90° 圆弧（dot=${dot.toFixed(3)}）`);
    }
    assert.ok(leadIn(path.path) >= 20, `${name}: 出端口先走直线（${leadIn(path.path).toFixed(1)}px）`);
    assert.ok(leadOut(path.path) >= 20, `${name}: 进端口前先走直线（${leadOut(path.path).toFixed(1)}px）`);
  }
});

test('routing only takes the shortest way around: one turn when one turn is enough', () => {
  // 回环（Retry → Worker 底部回环端口）：一个拐点，横向直接压到回环端口再垂直上去。
  const loopback = edge(SYSTEM.loop, 'left', SYSTEM.worker, 'bottom', { targetRatio: 0.24 });
  assert.deepEqual(loopback.points, [
    { x: 524, y: 324 },
    { x: 337.36, y: 324 },
    { x: 337.36, y: 168 },
  ]);
  assert.equal(arcs(loopback.path).length, 1, '回环只拐一次，不绕大圈');
  assert.ok(closeTo(arcs(loopback.path)[0].radius, WORKFLOW_EDGE_RADIUS), '一个拐点时半径拉满 32');

  // 判定 → Retry：从右端口出去没法直接向左，让开一段后走一个台阶（三个圆弧），不是绕整圈。
  const detour = edge(SYSTEM.gate, 'right', SYSTEM.loop, 'top');
  assert.deepEqual(detour.points, [
    { x: 976, y: 132 },
    { x: 1032, y: 132 },
    { x: 1032, y: 232 },
    { x: 631, y: 232 },
    { x: 631, y: 288 },
  ]);
  assert.equal(arcs(detour.path).length, 3);
  // 台阶的中段（横着那一段）要够长：标签钉在这里。
  assert.equal(length(detour.points[2], detour.points[3]), 401);

  // 超限边（Retry → End）：从 Retry 底部出去，从 End 的右端口进——下、右、上，三段直线两个 90°。
  const exhausted = edge(SYSTEM.loop, 'bottom', SYSTEM.output, 'right');
  assert.deepEqual(exhausted.points, [
    { x: 631, y: 360 },
    { x: 631, y: 476 },
    { x: 1032, y: 476 },
    { x: 1032, y: 420 },
    { x: 976, y: 420 },
  ]);
});

test('labels land on the middle of a straight run, never inside a corner', () => {
  const cases = [
    edge(SYSTEM.gate, 'right', SYSTEM.loop, 'top'),
    edge(SYSTEM.loop, 'left', SYSTEM.worker, 'bottom', { targetRatio: 0.24 }),
    edge(SYSTEM.loop, 'bottom', SYSTEM.output, 'right'),
    edge(SYSTEM.gate, 'right', SYSTEM.output, 'right'),
  ];
  for (const path of cases) {
    const anchor = { x: path.labelX, y: path.labelY };
    // 锚点必须在某条直线段上：到折线所有直线段的最小距离 ~0，且不落在圆弧的半径范围内。
    const straight = lines(path.path).filter((line) => length(line.from, line.to) > 0.5);
    const nearest = Math.min(...straight.map((line) => {
      const dx = line.to.x - line.from.x;
      const dy = line.to.y - line.from.y;
      const ratio = Math.max(0, Math.min(1, ((anchor.x - line.from.x) * dx + (anchor.y - line.from.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(anchor.x - (line.from.x + dx * ratio), anchor.y - (line.from.y + dy * ratio));
    }));
    assert.ok(nearest < 0.05, `标签锚点落在线上（${nearest.toFixed(3)}）`);
    const cornerDistance = Math.min(...arcs(path.path).map((arc) => Math.hypot(anchor.x - arc.from.x, anchor.y - arc.from.y)));
    assert.ok(cornerDistance >= 30, `标签不卡在拐角里（离最近拐点 ${cornerDistance.toFixed(1)}px）`);
    // 也不贴着两个端点。
    const total = travel(path.path).reduce((sum, step) => sum + length(step.from, step.to), 0);
    const first = path.points[0];
    const last = path.points[path.points.length - 1];
    assert.ok(length(first, anchor) > 40 && length(last, anchor) > 40, '标签不在端点交汇处');
    assert.ok(total > 120);
  }
});

test('the detour and the end edge keep the label at the geometrical middle', () => {
  // 判定 → Retry（从右端口让到右侧再折下来）：标签钉在台阶的那条横段上。
  const detour = edge(SYSTEM.gate, 'right', SYSTEM.loop, 'top');
  assert.deepEqual({ x: detour.labelX, y: detour.labelY }, { x: 831.5, y: 232 });
  // 判定 → End（C 形）：标签钉在竖直中段。
  const end = edge(SYSTEM.gate, 'right', SYSTEM.output, 'right');
  assert.deepEqual({ x: end.labelX, y: end.labelY }, { x: 1032, y: 276 }, 'C 形的标签钉在竖直中段');
});

test('a saved (custom) layout routes with the same rules', () => {
  // 自定义图（fixture custom.move）：主链一排，Retry 在 Worker 左下。
  const custom = {
    start: { x: 40, y: 140 },
    worker: { x: 360, y: 140 },
    judge: { x: 680, y: 140 },
    rescue: { x: 360, y: 460 },
    output: { x: 1000, y: 140 },
  };
  const mainChain = edge(custom.start, 'right', custom.worker, 'left');
  assert.equal(arcs(mainChain.path).length, 0, '主链还是直线');

  // 判定 → Retry（false 支路）：从判定下方出去，落到 Retry 顶部，中间一条横脊。
  const detour = edge(custom.judge, 'bottom', custom.rescue, 'top');
  assert.deepEqual(detour.points, [
    { x: 787, y: 212 },
    { x: 787, y: 336 },
    { x: 467, y: 336 },
    { x: 467, y: 460 },
  ]);
  assert.deepEqual({ x: detour.labelX, y: detour.labelY }, { x: 627, y: 336 });

  // Retry → Worker（回环）：从自己那一侧出去，绕到 Worker 底部的回环端口。
  const loopback = edge(custom.rescue, 'left', custom.worker, 'bottom', { targetRatio: 0.24 });
  assert.deepEqual(loopback.points, [
    { x: 360, y: 496 },
    { x: 304, y: 496 },
    { x: 304, y: 268 },
    { x: 411.36, y: 268 },
    { x: 411.36, y: 212 },
  ]);
  assert.deepEqual({ x: loopback.labelX, y: loopback.labelY }, { x: 304, y: 382 });

  // 判定 → End（收尾）：两个端口面对面、同一条线 ⇒ 直线，不绕。
  const end = edge(custom.judge, 'right', custom.output, 'left');
  assert.equal(arcs(end.path).length, 0);
});

test('backwards edges (target behind the exit side) fall back to a smooth S curve', () => {
  // 右端口出去、目标却在左边（自定义图里把节点拖反了）：不硬折、也不打结，走一条两端切线
  // 各自顺着端口的 S 形曲线。
  const backwards = edge({ x: 400, y: 100 }, 'right', { x: 100, y: 100 }, 'right');
  assert.equal(backwards.kind, 'curve');
  const [p0, c1, c2, p3] = backwards.points;
  assert.ok(c1.x > p0.x, '曲线从端口往外走（不是立刻回头）');
  assert.ok(c2.x > p3.x, '曲线从目标那一侧回来');
  assert.ok(Number.isFinite(backwards.labelX) && Number.isFinite(backwards.labelY));
  // 两端切线方向仍然沿着端口。
  assert.ok(closeTo(c1.y, p0.y) && closeTo(c2.y, p3.y));
});

test('small saved height offsets use a soft transition with real 24px port leads', () => {
  const result = workflowEdgePath({ sourceX: 0, sourceY: 0, targetX: 150, targetY: 4,
    sourcePosition: 'right', targetPosition: 'left' });
  assert.equal(result.kind, 'curve');
  assert.equal(commands(result.path).map((command) => command.type).join(''), 'MLCL');
  assert.equal(arcs(result.path).length, 1);
  assert.ok(closeTo(leadIn(result.path), 24));
  assert.ok(closeTo(leadOut(result.path), 24));
  assert.equal(result.labelX, 75);
  assert.equal(result.labelY, 2);
});

test('same-side ports always return from outside the target, never through its body', () => {
  const result = workflowEdgePath({ sourceX: 0, sourceY: 0, targetX: 240, targetY: 150,
    sourcePosition: 'right', targetPosition: 'right' });
  const last = lines(result.path).at(-1);
  assert.ok(last.from.x > last.to.x);
  assert.equal(last.to.x, 240);
  assert.ok(result.points[1].x >= 296);
});

test('degenerate input (same point) stays finite', () => {
  const path = workflowEdgePath({
    sourceX: 100,
    sourceY: 100,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'right',
    targetPosition: 'left',
  });
  assert.equal(path.kind, 'polyline');
  assert.ok(Number.isFinite(path.labelX) && Number.isFinite(path.labelY));
  assert.equal(path.path.includes('NaN'), false);
});

test('lead and radius are the shared constants (no per-page numbers)', () => {
  assert.equal(WORKFLOW_EDGE_LEAD, 24);
  assert.equal(WORKFLOW_EDGE_RADIUS, 32);
});
