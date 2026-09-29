/**
 * 连线路由（配置页与运行页共用的唯一一份几何）。
 *
 * 为什么自己写：React Flow 自带的 getSmoothStepPath 是「先绕到中线、再直角折过去」那套——
 * 拐角半径小（默认 5–20px）、绕行距离长（进出节点先横向让开一大段），多条回路叠在一起就是
 * 一团机械的折线。这里按「少、短、顺、圆」重写：
 *
 *   · 出/进节点先走 LEAD（24px，落在 20–30px 之间）直线，之后才开始转弯；
 *   · 转弯一律是 90° 圆弧（三次贝塞尔逼近，半径 RADIUS = 32px），不存在硬折角；
 *   · 需要让开时至少让 ESCAPE = LEAD + RADIUS（56px），"先直线、再转弯"因此总成立；
 *   · 能一拐到位的绝不多拐：端口面对面又在同一条线上就是一条直线，错开只走一个 Z（中间一条直脊），
 *     端口在对面那一侧才绕一次；
 *   · 标签锚点取折线的几何中点，且必须落在某条足够长的直段上（不会卡在拐角里）。
 *
 * 端口方向用 Position 的字符串值（left/right/top/bottom），两页传的就是这个。
 */
export const WORKFLOW_EDGE_LEAD = 24;
export const WORKFLOW_EDGE_RADIUS = 32;
const ESCAPE = WORKFLOW_EDGE_LEAD + WORKFLOW_EDGE_RADIUS;
// 90° 圆弧的三次贝塞尔逼近系数（4/3·tan(π/8)）：半径误差 ~0.03%，所以转弯看起来是一个真圆角。
const ARC = 0.5522847498307936;
// 标签不往短段上放：端口那两段本来就短（56px），钉上去看起来就贴在端点上。
const LABEL_SEGMENT_MIN = 64;

const OUTWARD = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

/** 出线方向：端口在节点哪一侧，线就从那一侧往外走。 */
function exitVector(position) {
  return OUTWARD[position] || OUTWARD.right;
}

/** 进线方向：线到端口时的行进方向（左端口从外面往右进，右端口从右边往左进…）。 */
function entryVector(position) {
  const outward = OUTWARD[position] || OUTWARD.left;
  return { x: -outward.x, y: -outward.y };
}

/**
 * 把坐标系转成「出线方向 = +u」的正交坐标系：出线方向本来只有四种，转过去之后到线方向只剩
 * 「反向 / 同向 / 垂直」三类，路线的构造只写一遍。
 */
function frameFor(exit) {
  if (exit.x === 1) {
    return {
      toPoint: (point) => ({ u: point.x, v: point.y }),
      toVector: (vector) => ({ u: vector.x, v: vector.y }),
      fromPoint: (point) => ({ x: point.u, y: point.v }),
    };
  }
  if (exit.x === -1) {
    return {
      toPoint: (point) => ({ u: -point.x, v: point.y }),
      toVector: (vector) => ({ u: -vector.x, v: vector.y }),
      fromPoint: (point) => ({ x: -point.u, y: point.v }),
    };
  }
  if (exit.y === 1) {
    return {
      toPoint: (point) => ({ u: point.y, v: point.x }),
      toVector: (vector) => ({ u: vector.y, v: vector.x }),
      fromPoint: (point) => ({ x: point.v, y: point.u }),
    };
  }
  return {
    toPoint: (point) => ({ u: -point.y, v: point.x }),
    toVector: (vector) => ({ u: -vector.y, v: vector.x }),
    fromPoint: (point) => ({ x: point.v, y: -point.u }),
  };
}

/**
 * 折线的构造：先「端口面对面」的两类（到线方向与出线相反/相同），再「到线方向与出线垂直」那一类。
 * 都构不出干净路线时返回 null，交给 bow() 画一条 S 形曲线（只有目标在出口背后这种反向边才会用到）。
 */
function polyline(source, target, entry) {
  const du = target.u - source.u;
  const dv = target.v - source.v;
  const spanAcross = Math.abs(dv) < 1;

  if (entry.u === -1) {
    // 同侧端口：必须绕到两端外侧再返回，不能用中间脊线从节点内部穿入。
    if (spanAcross) return null;
    const bend = Math.max(source.u, target.u) + ESCAPE;
    return [source, { u: bend, v: source.v }, { u: bend, v: target.v }, target];
  }

  if (entry.u === 1) {
    // 面对面的端口：目标在前就是一条直线（主链都是这条）；
    // 错开且中间放得下就走 Z；夹得太近就贴着中间一条直脊收窄；目标在身后才退回曲线。
    if (spanAcross) return du >= 0 ? [source, target] : null;
    if (du >= 0) {
      const spine = (source.u + target.u) / 2;
      return [source, { u: spine, v: source.v }, { u: spine, v: target.v }, target];
    }
    return null;
  }

  // 到线方向与出线垂直（比如从节点的右下角绕到上边/下边的端口）：先沿出线方向让开，再横过去，
  // 最后直直地进端口。两段让开的距离用 max(...) + ESCAPE，保证每个拐点两边都留得下圆弧。
  const sideward = entry.v;
  if (du >= ESCAPE && sideward * dv >= ESCAPE) {
    return [source, { u: target.u, v: source.v }, target];
  }
  const bend = Math.max(source.u, target.u) + ESCAPE;
  const lane = target.v - sideward * ESCAPE;
  return [
    source,
    { u: bend, v: source.v },
    { u: bend, v: lane },
    { u: target.u, v: lane },
    target,
  ];
}

/** 反向边（目标在出口背后）的 S 形曲线：两端切线仍然沿着端口方向。 */
function bow(source, target, entry) {
  return [
    source,
    { u: source.u + ESCAPE, v: source.v },
    { u: target.u + (entry.u === -1 ? ESCAPE : -ESCAPE), v: target.v },
    target,
  ];
}

const round = (value) => Math.round(value * 100) / 100;
const format = (point) => `${round(point.x)} ${round(point.y)}`;
const distance = (from, to) => Math.hypot(to.x - from.x, to.y - from.y);

/** 折线 → SVG path：每个拐点切成一段 90° 圆弧（半径尽量 RADIUS，段太短时按段长收一半）。 */
function polylinePath(points) {
  const path = [`M ${format(points[0])}`];
  let cursor = points[0];
  const pushLine = (point) => {
    // 两个相邻拐点共用一个短段时会出现零长度的 "L"：不写出来（SVG 里也是空动作，但看着脏）。
    if (distance(cursor, point) < 0.05) return;
    path.push(`L ${format(point)}`);
    cursor = point;
  };
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const inLength = distance(previous, corner);
    const outLength = distance(corner, next);
    if (inLength < 0.5 || outLength < 0.5) continue;
    const incoming = { x: (corner.x - previous.x) / inLength, y: (corner.y - previous.y) / inLength };
    const outgoing = { x: (next.x - corner.x) / outLength, y: (next.y - corner.y) / outLength };
    // 共线（这里本来就是直段）不用切圆弧。
    if (Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) < 1e-6) continue;
    // 半径：尽量 RADIUS；连着端口的那个拐点还要给端口留下 LEAD 直线（所以不是段长一半），
    // 两拐点共用的那段则各切一半。
    const radius = Math.max(0, Math.min(
      WORKFLOW_EDGE_RADIUS,
      index === 1 ? inLength - WORKFLOW_EDGE_LEAD : inLength / 2,
      index === points.length - 2 ? outLength - WORKFLOW_EDGE_LEAD : outLength / 2,
    ));
    const entry = { x: corner.x - incoming.x * radius, y: corner.y - incoming.y * radius };
    const exit = { x: corner.x + outgoing.x * radius, y: corner.y + outgoing.y * radius };
    pushLine(entry);
    path.push(
      `C ${format({ x: entry.x + incoming.x * radius * ARC, y: entry.y + incoming.y * radius * ARC })}`
      + ` ${format({ x: exit.x - outgoing.x * radius * ARC, y: exit.y - outgoing.y * radius * ARC })}`
      + ` ${format(exit)}`,
    );
    cursor = exit;
  }
  pushLine(points[points.length - 1]);
  return path.join(' ');
}

function curvePath(points) {
  return `M ${format(points[0])} C ${format(points[1])} ${format(points[2])} ${format(points[3])}`;
}

// A small saved-position offset must not become two tiny quarter-turns. Spread it over
// the available span, keeping real straight port leads (not merely Bezier tangents).
function softTransition(source, target, sourcePosition, targetPosition) {
  const exit = exitVector(sourcePosition);
  const outward = exitVector(targetPosition || 'left');
  const gap = distance(source, target);
  const lead = Math.min(WORKFLOW_EDGE_LEAD, gap / 4);
  const start = { x: source.x + exit.x * lead, y: source.y + exit.y * lead };
  const end = { x: target.x + outward.x * lead, y: target.y + outward.y * lead };
  const reach = Math.max(WORKFLOW_EDGE_RADIUS, distance(start, end) / 2);
  const controls = [start,
    { x: start.x + exit.x * reach, y: start.y + exit.y * reach },
    { x: end.x + outward.x * reach, y: end.y + outward.y * reach }, end];
  const anchor = {
    x: (start.x + 3 * controls[1].x + 3 * controls[2].x + end.x) / 8,
    y: (start.y + 3 * controls[1].y + 3 * controls[2].y + end.y) / 8,
  };
  return {
    path: `M ${format(source)} L ${format(start)} ${curvePath(controls).replace(/^M [^C]+/, '')} L ${format(target)}`,
    labelX: round(anchor.x), labelY: round(anchor.y), kind: 'curve', points: controls,
  };
}

/** 折线上距起点 distance 处的点（用于把标签钉在直段中段）。 */
function pointAt(points, length) {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = distance(points[index - 1], points[index]);
    if (travelled + segment >= length) {
      const ratio = segment ? (length - travelled) / segment : 0;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio,
      };
    }
    travelled += segment;
  }
  return points[points.length - 1];
}

/** 标签锚点：折线中点落在哪一段就钉那一段的中点，短段（端口那两段）不作候选。 */
function labelAnchor(points) {
  const segments = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = distance(points[index - 1], points[index]);
    segments.push({ length, mid: total + length / 2 });
    total += length;
  }
  if (!total) return points[0];
  const half = total / 2;
  const candidates = segments.filter((segment) => segment.length >= LABEL_SEGMENT_MIN);
  if (!candidates.length) return pointAt(points, half);
  const best = candidates.reduce((current, segment) => (
    Math.abs(segment.mid - half) <= Math.abs(current.mid - half) ? segment : current
  ));
  return pointAt(points, best.mid);
}

/**
 * 一条边的几何：折线（+圆角）或反向边的 S 形曲线。
 * 返回 { path, labelX, labelY, kind, points }：points 是折线的顶点（曲线是四个控制点），
 * 单测直接查这些顶点就能验「直线段 / 圆弧 / 让开距离」这些形状约束。
 */
export function workflowEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}) {
  const source = { x: Number(sourceX) || 0, y: Number(sourceY) || 0 };
  const target = { x: Number(targetX) || 0, y: Number(targetY) || 0 };
  const frame = frameFor(exitVector(sourcePosition));
  const localSource = frame.toPoint(source);
  const localTarget = frame.toPoint(target);
  const entry = frame.toVector(entryVector(targetPosition));
  const du = localTarget.u - localSource.u;
  const dv = Math.abs(localTarget.v - localSource.v);
  if (entry.u === 1 && du > 2 * WORKFLOW_EDGE_LEAD && dv >= 1 && dv < 2 * WORKFLOW_EDGE_RADIUS) {
    return softTransition(source, target, sourcePosition, targetPosition);
  }
  const straight = distance(source, target) < 0.5;
  const local = straight ? [localSource, localTarget] : polyline(localSource, localTarget, entry);
  const points = (local || bow(localSource, localTarget, entry)).map(frame.fromPoint);
  const kind = local ? 'polyline' : 'curve';
  const anchor = kind === 'curve'
    // 三次贝塞尔 t = 0.5 处就在曲线上（B(0.5) = (P0 + 3·C1 + 3·C2 + P3) / 8）。
    ? {
      x: (points[0].x + 3 * points[1].x + 3 * points[2].x + points[3].x) / 8,
      y: (points[0].y + 3 * points[1].y + 3 * points[2].y + points[3].y) / 8,
    }
    : labelAnchor(points);
  return {
    path: kind === 'curve' ? curvePath(points) : polylinePath(points),
    labelX: round(anchor.x),
    labelY: round(anchor.y),
    kind,
    points,
  };
}
