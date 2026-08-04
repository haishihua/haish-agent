// @haish-esm
import { toDisplayText } from './world-events.js';

export const BOT_ACTOR_NODE_TYPES = new Set(['agent', 'llm', 'tool']);

export const TABLE_SPOTS = [
  { id: 'table_seat_0', kind: 'table', nav: 'table_west', x: 0.552, y: 0.66, approach: { id: 'table_seat_0_approach', kind: 'route', nav: 'table_west', x: 0.51, y: 0.67 } },
  { id: 'table_seat_1', kind: 'table', nav: 'table_northwest', x: 0.599, y: 0.56, approach: { id: 'table_seat_1_approach', kind: 'route', nav: 'table_northwest', x: 0.57, y: 0.52 } },
  { id: 'table_seat_2', kind: 'table', nav: 'table_northeast', x: 0.811, y: 0.535, approach: { id: 'table_seat_2_approach', kind: 'route', nav: 'table_northeast', x: 0.85, y: 0.51 } },
  { id: 'table_seat_3', kind: 'table', nav: 'table_east', x: 0.87, y: 0.72, approach: { id: 'table_seat_3_approach', kind: 'route', nav: 'table_east', x: 0.91, y: 0.72 } },
  { id: 'table_seat_4', kind: 'table', nav: 'table_southwest', x: 0.60, y: 0.80, approach: { id: 'table_seat_4_approach', kind: 'route', nav: 'table_southwest', x: 0.56, y: 0.82 } },
  { id: 'table_seat_5', kind: 'table', nav: 'table_northeast', x: 0.74, y: 0.54, approach: { id: 'table_seat_5_approach', kind: 'route', nav: 'table_northeast', x: 0.74, y: 0.50 } },
];

export const TABLE_OVERFLOW_SPOTS = [
  TABLE_SPOTS[4],
  TABLE_SPOTS[5],
  TABLE_SPOTS[2],
];

export const LEISURE_SPOTS = [
  { id: 'leisure_coffee_1', kind: 'coffee', nav: 'cafe_east', x: 620 / 1536, y: 438 / 1024 },
  { id: 'leisure_basket_1', kind: 'basket', nav: 'court_center', x: 0.67, y: 0.36 },
  { id: 'leisure_skate_1', kind: 'skate', nav: 'lake_center', x: 0.31, y: 0.72 },
  { id: 'leisure_coffee_2', kind: 'coffee', nav: 'cafe_west', x: 0.13, y: 0.42 },
  { id: 'leisure_basket_2', kind: 'basket', nav: 'court_center', x: 0.77, y: 0.38 },
  { id: 'leisure_skate_2', kind: 'skate', nav: 'lake_center', x: 0.38, y: 0.73 },
];

const ACTIVITY_SPOTS = {
  coffeeMachine: [
    { id: 'coffee_machine_0', kind: 'coffee', nav: 'cafe_middle', x: 0.205, y: 0.325, approach: { id: 'coffee_machine_0_approach', kind: 'route', nav: 'cafe_middle', x: 0.205, y: 0.42 } },
  ],
  coffeeStand: [
    { id: 'coffee_stand_0', kind: 'coffee', nav: 'cafe_east', x: 0.39, y: 0.42 },
    { id: 'coffee_stand_1', kind: 'coffee', nav: 'cafe_west', x: 0.12, y: 0.43 },
  ],
  coffeeSeat: [
    { id: 'coffee_seat_0', kind: 'coffee', nav: 'cafe_west', x: 0.17, y: 0.35, approach: { id: 'coffee_seat_0_approach', kind: 'route', nav: 'cafe_west', x: 0.17, y: 0.42 } },
    { id: 'coffee_seat_1', kind: 'coffee', nav: 'cafe_middle', x: 0.26, y: 0.31, approach: { id: 'coffee_seat_1_approach', kind: 'route', nav: 'cafe_middle', x: 0.27, y: 0.41 } },
  ],
  basketDribble: [
    { id: 'basket_dribble_0', kind: 'basket', nav: 'court_center', x: 0.59, y: 0.39 },
    { id: 'basket_dribble_1', kind: 'basket', nav: 'court_center', x: 0.64, y: 0.37 },
    { id: 'basket_dribble_2', kind: 'basket', nav: 'court_center', x: 0.68, y: 0.40 },
    { id: 'basket_dribble_3', kind: 'basket', nav: 'court_center', x: 0.62, y: 0.32 },
  ],
  basketShoot: [
    // Shooting sprites release to their upper-right, so every set shot starts
    // left of the visible rim and follows one continuous Phaser trajectory.
    { id: 'basket_shoot_0', kind: 'basket', nav: 'court_center', x: 0.57, y: 0.35 },
    { id: 'basket_shoot_1', kind: 'basket', nav: 'court_center', x: 0.59, y: 0.38 },
    { id: 'basket_shoot_2', kind: 'basket', nav: 'court_center', x: 0.61, y: 0.32 },
  ],
  basketLoose: [
    { id: 'basket_loose_0', kind: 'basket', nav: 'court_center', x: 0.79, y: 0.32 },
    { id: 'basket_loose_1', kind: 'basket', nav: 'court_center', x: 0.70, y: 0.30 },
    { id: 'basket_loose_2', kind: 'basket', nav: 'court_center', x: 0.81, y: 0.34 },
  ],
  basketMade: [
    { id: 'basket_made_0', kind: 'basket', nav: 'court_center', x: 0.715, y: 0.27 },
    { id: 'basket_made_1', kind: 'basket', nav: 'court_center', x: 0.719, y: 0.29 },
    { id: 'basket_made_2', kind: 'basket', nav: 'court_center', x: 0.711, y: 0.25 },
  ],
  skate: [
    { id: 'skate_0', kind: 'skate', nav: 'lake_center', x: 0.15, y: 0.70 },
    { id: 'skate_1', kind: 'skate', nav: 'lake_center', x: 0.34, y: 0.68 },
  ],
};

// Includes the belly-slide sprite footprint, not just its anchor point.
const SKATE_SAFE_ELLIPSE = { x: 0.245, y: 0.69, rx: 0.105, ry: 0.105 };
// Calibrated against the rendered Haish(dev) scene. The hoop PNG has a large,
// asymmetric transparent canvas, so its visible rim is not at the image anchor.
const BASKET_RIM = { x: 1098 / 1536, y: 177 / 1024 };

function quadraticPoint(start, control, end, progress) {
  const inv = 1 - progress;
  return {
    x: inv * inv * start.x + 2 * inv * progress * control.x + progress * progress * end.x,
    y: inv * inv * start.y + 2 * inv * progress * control.y + progress * progress * end.y,
  };
}

function cubicPoint(start, control1, control2, end, progress) {
  const inv = 1 - progress;
  return {
    x: inv ** 3 * start.x
      + 3 * inv * inv * progress * control1.x
      + 3 * inv * progress * progress * control2.x
      + progress ** 3 * end.x,
    y: inv ** 3 * start.y
      + 3 * inv * inv * progress * control1.y
      + 3 * inv * progress * progress * control2.y
      + progress ** 3 * end.y,
  };
}

export function basketballFlightPath(start, rim, landing, outcome, steps = 120) {
  const contactProgress = 0.7;
  let pointAt;
  if (outcome === 'hit') {
    const inv = 1 - contactProgress;
    const control1 = {
      x: start.x + (rim.x - start.x) * 0.42,
      y: Math.max(16, Math.min(start.y, rim.y) - 74),
    };
    const divisor = 3 * inv * contactProgress * contactProgress;
    const control2 = {
      x: (rim.x
        - inv ** 3 * start.x
        - 3 * inv * inv * contactProgress * control1.x
        - contactProgress ** 3 * landing.x) / divisor,
      y: (rim.y
        - inv ** 3 * start.y
        - 3 * inv * inv * contactProgress * control1.y
        - contactProgress ** 3 * landing.y) / divisor,
    };
    pointAt = (progress) => cubicPoint(start, control1, control2, landing, progress);
  } else {
    const direction = landing.x >= rim.x ? 1 : -1;
    const contact = { x: rim.x + direction * 12, y: rim.y + 2 };
    const launchControl = {
      x: (start.x + contact.x) / 2,
      y: Math.max(16, Math.min(start.y, contact.y) - 74),
    };
    const reboundControl = {
      x: contact.x + direction * 48,
      y: contact.y + 12,
    };
    pointAt = (progress) => progress <= contactProgress
      ? quadraticPoint(start, launchControl, contact, progress / contactProgress)
      : quadraticPoint(
        contact,
        reboundControl,
        landing,
        (progress - contactProgress) / (1 - contactProgress),
      );
  }
  return {
    contactProgress,
    points: Array.from({ length: steps + 1 }, (_, index) => pointAt(index / steps)),
  };
}

export function isInsideSkateBoundary(spot) {
  const dx = (Number(spot?.x || 0) - SKATE_SAFE_ELLIPSE.x) / SKATE_SAFE_ELLIPSE.rx;
  const dy = (Number(spot?.y || 0) - SKATE_SAFE_ELLIPSE.y) / SKATE_SAFE_ELLIPSE.ry;
  return (dx * dx) + (dy * dy) <= 1;
}

function rotatingSpot(spots, actorIndex, cycle) {
  return spots[(actorIndex * 3 + cycle * 5) % spots.length];
}

const OUTDOOR_STEPS_BEFORE_TABLE = {
  coffee: 18,
  basket: 16,
  skate: 6,
};

const OUTDOOR_STEP_OPTIONS = {
  coffee: [12, 18, 24],
  basket: [8, 16, 24],
  skate: [4, 6, 8, 10],
};

export function createLeisureSchedule(kind, random = Math.random) {
  const options = OUTDOOR_STEP_OPTIONS[kind] || [OUTDOOR_STEPS_BEFORE_TABLE[kind] || 6];
  return {
    outdoorSteps: options[Math.floor(random() * options.length)],
    tableDuration: 9000 + Math.floor(random() * 4) * 2000,
    tableAction: kind === 'basket' || random() >= 0.5 ? 'special' : 'thinking',
    activityCycleOffset: Math.floor(random() * 12),
  };
}

function basketballState(actorIndex, cycle) {
  const dribble = rotatingSpot(ACTIVITY_SPOTS.basketDribble, actorIndex, cycle);
  const shoot = rotatingSpot(ACTIVITY_SPOTS.basketShoot, actorIndex, cycle);
  const outcome = (actorIndex + cycle) % 3 === 0 ? 'miss' : 'hit';
  const landing = rotatingSpot(
    outcome === 'hit' ? ACTIVITY_SPOTS.basketMade : ACTIVITY_SPOTS.basketLoose,
    actorIndex,
    cycle,
  );
  const pickup = { ...landing, id: `${landing.id}_pickup` };
  return {
    dribble,
    shoot,
    landing,
    pickup,
    ball: {
      key: `${actorIndex}-${cycle}`,
      outcome,
      spriteKey: `penguin_${(actorIndex % 4) + 1}`,
      spriteVariant: (actorIndex % 4) + 1,
      start: shoot,
      hoop: BASKET_RIM,
      landing,
    },
  };
}

function tableBreakStepCount(kind) {
  return kind === 'basket' ? 7 : 4;
}

function tableBreakStep(kind, stepIndex, actorIndex, tableSpot, schedule) {
  const outdoorSteps = schedule?.outdoorSteps || OUTDOOR_STEPS_BEFORE_TABLE[kind];
  if (!outdoorSteps || !tableSpot?.approach) return null;
  const sequenceLength = outdoorSteps + tableBreakStepCount(kind);
  const sequenceStep = stepIndex % sequenceLength;
  if (sequenceStep < outdoorSteps) return null;
  const tableStep = sequenceStep - outdoorSteps;
  const breakCycle = Math.floor(stepIndex / sequenceLength);
  const action = kind === 'basket'
    ? 'special'
    : schedule?.tableAction || ((breakCycle + actorIndex) % 2 === 0 ? 'thinking' : 'special');
  const completedBasketCycles = Math.max(1, Math.floor(outdoorSteps / 8));
  const basket = kind === 'basket'
    ? basketballState(
      actorIndex,
      (schedule?.activityCycleOffset || 0)
        + breakCycle * completedBasketCycles
        + completedBasketCycles
        - 1,
    )
    : null;
  const parkedBall = basket ? { ...basket.ball, state: 'landed' } : null;
  const keepBall = (step) => (parkedBall ? { ...step, ball: parkedBall } : step);
  if (tableStep === 0) return keepBall({ action: 'idle', duration: 420, spot: tableSpot.approach });
  // The route settle state supplies the brief standing landing pose before
  // this table activity starts.
  if (tableStep === 1) return keepBall({ action, duration: 420, spot: tableSpot });
  if (tableStep === 2) {
    return keepBall({
      action,
      duration: schedule?.tableDuration || (action === 'thinking' ? 5800 : 7200),
      spot: tableSpot,
      tableBreak: true,
    });
  }
  if (kind === 'basket' && tableStep === 3) {
    return keepBall({ action: 'idle', duration: 320, spot: tableSpot.approach });
  }
  if (kind === 'basket' && tableStep === 4) {
    return keepBall({ action: 'idle', duration: 420, spot: basket.pickup });
  }
  if (kind === 'basket' && tableStep === 5) {
    return { action: 'basketball_pickup', duration: 1000, spot: basket.pickup };
  }
  if (kind === 'basket') {
    return { action: 'basketball', duration: 500, spot: basket.pickup, scheduleComplete: true };
  }
  return { action: 'idle', duration: 320, spot: tableSpot.approach, scheduleComplete: true };
}

export function leisureBehaviorStep(
  kind,
  stepIndex,
  actorIndex = 0,
  fallbackSpot = LEISURE_SPOTS[0],
  tableSpot = TABLE_SPOTS[actorIndex % TABLE_SPOTS.length],
  schedule = null,
) {
  const tableBreak = tableBreakStep(kind, stepIndex, actorIndex, tableSpot, schedule);
  if (tableBreak) return tableBreak;
  const outdoorSteps = schedule?.outdoorSteps || OUTDOOR_STEPS_BEFORE_TABLE[kind] || 1;
  const sequenceLength = outdoorSteps + tableBreakStepCount(kind);
  const outdoorStep = stepIndex % sequenceLength;
  const sequenceCycle = Math.floor(stepIndex / sequenceLength);
  const activityCycleOffset = schedule?.activityCycleOffset || 0;
  if (kind === 'coffee') {
    const step = outdoorStep % 6;
    const cycle = activityCycleOffset + sequenceCycle * (outdoorSteps / 6) + Math.floor(outdoorStep / 6);
    const seated = (cycle + actorIndex) % 2 === 1;
    const machine = rotatingSpot(ACTIVITY_SPOTS.coffeeMachine, actorIndex, cycle);
    const drink = rotatingSpot(seated ? ACTIVITY_SPOTS.coffeeSeat : ACTIVITY_SPOTS.coffeeStand, actorIndex, cycle);
    if (step === 0) return { action: 'idle', duration: 1200, spot: machine };
    if (step === 1) return { action: 'coffee_make', duration: 3600, spot: machine };
    if (step === 2) return { action: 'idle', duration: 650, spot: seated ? drink.approach : drink };
    if (step === 3) return { action: seated ? 'idle' : 'coffee', duration: seated ? 120 : 7600, spot: drink };
    if (step === 4) return { action: seated ? 'coffee_sit' : 'idle', duration: seated ? 7600 : 450, spot: drink };
    return { action: 'idle', duration: seated ? 120 : 300, spot: seated ? drink.approach : drink };
  }
  if (kind === 'basket') {
    const step = outdoorStep % 8;
    const cycle = activityCycleOffset + sequenceCycle * (outdoorSteps / 8) + Math.floor(outdoorStep / 8);
    const { dribble, shoot, pickup, ball } = basketballState(actorIndex, cycle);
    if (step === 0) return { action: 'basketball', duration: 900, spot: dribble };
    if (step === 1) return { action: 'basketball', duration: 3600, spot: dribble };
    if (step === 2) return { action: 'basketball', duration: 800, spot: shoot };
    if (step === 3) return {
      action: 'basketball_shoot',
      duration: 440,
      spot: shoot,
      ball: { ...ball, state: 'flight', releaseDelay: 220 },
    };
    // Hold the release pose while the projectile is in flight. Switching back
    // to idle here makes the detached ball look like it appeared by itself.
    if (step === 4) return { action: 'basketball_shoot', duration: 3000, spot: shoot, ball: { ...ball, state: 'flight' } };
    if (step === 5) return { action: 'idle', duration: 350, spot: pickup, ball: { ...ball, state: 'landed' } };
    // At the pickup frame the ground ball transfers back into the actor sprite.
    // Keeping the Phaser ball alive here renders the same ball twice.
    if (step === 6) return { action: 'basketball_pickup', duration: 1000, spot: pickup };
    return { action: 'basketball', duration: 500, spot: pickup };
  }
  if (kind === 'skate') {
    return {
      action: 'belly_slide',
      duration: 2800,
      spot: rotatingSpot(
        ACTIVITY_SPOTS.skate,
        actorIndex,
        activityCycleOffset + sequenceCycle * outdoorSteps + outdoorStep,
      ),
    };
  }
  return { action: 'idle', duration: 6000, spot: fallbackSpot };
}

const NAV_POINTS = {
  cafe_west: { id: 'cafe_west', kind: 'route', nav: 'cafe_west', x: 0.13, y: 0.42 },
  cafe_middle: { id: 'cafe_middle', kind: 'route', nav: 'cafe_middle', x: 0.26, y: 0.42 },
  cafe_east: { id: 'cafe_east', kind: 'route', nav: 'cafe_east', x: 0.39, y: 0.42 },
  west_crossing: { id: 'west_crossing', kind: 'route', nav: 'west_crossing', x: 0.43, y: 0.48 },
  park_hub: { id: 'park_hub', kind: 'route', nav: 'park_hub', x: 0.49, y: 0.52 },
  court_gate: { id: 'court_gate', kind: 'route', nav: 'court_gate', x: 0.58, y: 0.43 },
  court_center: { id: 'court_center', kind: 'route', nav: 'court_center', x: 0.69, y: 0.39 },
  lake_gate: { id: 'lake_gate', kind: 'route', nav: 'lake_gate', x: 0.43, y: 0.63 },
  lake_center: { id: 'lake_center', kind: 'route', nav: 'lake_center', x: 0.34, y: 0.66 },
  table_gate: { id: 'table_gate', kind: 'route', nav: 'table_gate', x: 0.55, y: 0.57 },
  table_northwest: { id: 'table_northwest', kind: 'route', nav: 'table_northwest', x: 0.59, y: 0.51 },
  table_northeast: { id: 'table_northeast', kind: 'route', nav: 'table_northeast', x: 0.80, y: 0.52 },
  table_west: { id: 'table_west', kind: 'route', nav: 'table_west', x: 0.51, y: 0.68 },
  table_east: { id: 'table_east', kind: 'route', nav: 'table_east', x: 0.91, y: 0.69 },
  table_southwest: { id: 'table_southwest', kind: 'route', nav: 'table_southwest', x: 0.57, y: 0.84 },
  table_southeast: { id: 'table_southeast', kind: 'route', nav: 'table_southeast', x: 0.84, y: 0.86 },
};

const NAV_EDGES = [
  ['cafe_west', 'cafe_middle'], ['cafe_middle', 'cafe_east'], ['cafe_east', 'west_crossing'],
  ['west_crossing', 'park_hub'], ['park_hub', 'court_gate'], ['court_gate', 'court_center'],
  ['park_hub', 'lake_gate'], ['lake_gate', 'lake_center'], ['park_hub', 'table_gate'],
  ['table_gate', 'table_northwest'], ['table_northwest', 'table_northeast'],
  ['table_gate', 'table_west'], ['table_west', 'table_southwest'],
  ['table_southwest', 'table_southeast'], ['table_southeast', 'table_east'],
  ['table_east', 'table_northeast'],
];

const NAV_NEIGHBORS = NAV_EDGES.reduce((neighbors, [left, right]) => {
  (neighbors[left] ||= []).push(right);
  (neighbors[right] ||= []).push(left);
  return neighbors;
}, {});

function shortestNavPath(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return [];
  const queue = [[fromId]];
  const seen = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    for (const next of NAV_NEIGHBORS[current] || []) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      if (next === toId) return nextPath.slice(1).map((id) => NAV_POINTS[id]);
      seen.add(next);
      queue.push(nextPath);
    }
  }
  return [];
}

function stableWorkflowOrder(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const edges = Array.isArray(workflow?.edges) ? workflow.edges : [];
  const indexById = new Map(nodes.map((node, index) => [String(node?.id || ''), index]));
  const byId = new Map(nodes.map((node) => [String(node?.id || ''), node]));
  const incoming = new Map(nodes.map((node) => [String(node?.id || ''), 0]));
  const outgoing = new Map(nodes.map((node) => [String(node?.id || ''), []]));

  edges.forEach((edge) => {
    const source = String(edge?.from || edge?.source || '');
    const target = String(edge?.to || edge?.target || '');
    if (!byId.has(source) || !byId.has(target)) return;
    outgoing.get(source).push(target);
    incoming.set(target, (incoming.get(target) || 0) + 1);
  });

  const queue = nodes
    .map((node) => String(node?.id || ''))
    .filter((id) => (incoming.get(id) || 0) === 0)
    .sort((a, b) => indexById.get(a) - indexById.get(b));
  const ordered = [];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(byId.get(id));
    for (const target of outgoing.get(id) || []) {
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) {
        queue.push(target);
        queue.sort((a, b) => indexById.get(a) - indexById.get(b));
      }
    }
  }
  nodes.forEach((node) => {
    const id = String(node?.id || '');
    if (!seen.has(id)) ordered.push(node);
  });
  return ordered;
}

export function buildPenguinCast(workflow) {
  const availableSeatIndexes = TABLE_SPOTS.map((_, index) => index);
  return stableWorkflowOrder(workflow)
    .filter((node) => BOT_ACTOR_NODE_TYPES.has(String(node?.type || '').toLowerCase()))
    .map((node, index) => {
      const spawnSpot = LEISURE_SPOTS[index % LEISURE_SPOTS.length];
      const primarySeats = availableSeatIndexes.filter((seatIndex) => seatIndex < 3);
      const seatPool = primarySeats.length ? primarySeats : availableSeatIndexes;
      const seatIndex = seatPool.length
        ? seatPool.reduce((nearest, candidate) => {
          const nearestSpot = TABLE_SPOTS[nearest];
          const candidateSpot = TABLE_SPOTS[candidate];
          const nearestDistance = Math.hypot(
            spawnSpot.x - nearestSpot.x,
            spawnSpot.y - nearestSpot.y,
          );
          const candidateDistance = Math.hypot(
            spawnSpot.x - candidateSpot.x,
            spawnSpot.y - candidateSpot.y,
          );
          return candidateDistance < nearestDistance ? candidate : nearest;
        })
        : index;
      const reservedIndex = availableSeatIndexes.indexOf(seatIndex);
      if (reservedIndex >= 0) availableSeatIndexes.splice(reservedIndex, 1);
      return {
      actorId: `wfnode:${node.id}`,
      nodeId: String(node.id),
      nodeType: String(node.type).toLowerCase(),
      label: String(node.label || node.name || node.id || `Node ${index + 1}`),
      spriteKey: `penguin_${(index % 4) + 1}`,
      spriteVariant: (index % 4) + 1,
      seatIndex,
      leisureSpotId: spawnSpot.id,
      spawnSpot,
      castIndex: index,
      };
    });
}

function normalizedStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'completed') return 'done';
  if (status === 'aborted') return 'cancelled';
  return status;
}

export function actorPhase(actor, task, reportDismissed = false, actorNodeIds = []) {
  if (!task) return 'leisure';
  if (task.executionMode !== 'bot') return 'hidden';
  const run = task.workflowRun || {};
  const runStatus = normalizedStatus(run.status || task.status);
  const node = run.nodes?.[actor.nodeId];
  const nodeStatus = normalizedStatus(node?.status);
  const reportingNodeId = actorNodeIds.findLast((nodeId) => run.nodes?.[nodeId]);

  if (node?.success === false || nodeStatus === 'failed') return 'error';
  if (runStatus === 'done' && reportingNodeId) {
    return !reportDismissed && actor.nodeId === reportingNodeId ? 'reporting' : 'leisure';
  }
  if (run.current_node_id === actor.nodeId || nodeStatus === 'running') return 'working';
  return 'leisure';
}

export function actorSpot(actor, phase) {
  if (
    phase === 'working'
    || phase === 'walking_to_table'
    || phase === 'waiting'
    || phase === 'reporting'
  ) {
    const seat = actor.seatIndex < TABLE_SPOTS.length
      ? TABLE_SPOTS[actor.seatIndex]
      : TABLE_OVERFLOW_SPOTS[(actor.seatIndex - TABLE_SPOTS.length) % TABLE_OVERFLOW_SPOTS.length];
    // The active worker and final reporter use the stool; hand-off states wait beside it.
    return phase === 'working' || phase === 'reporting' ? seat : seat.approach || seat;
  }
  return LEISURE_SPOTS.find((spot) => spot.id === actor.leisureSpotId) || LEISURE_SPOTS[0];
}

export function actorWalkDirection(from, to) {
  const dx = Number(to?.x || 0) - Number(from?.x || 0);
  const dy = Number(to?.y || 0) - Number(from?.y || 0);
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'back' : 'front';
}

export function actorRoute(from, to) {
  if (!from || !to) return to ? [to] : [];
  if (Math.abs(from.x - to.x) < 0.001 && Math.abs(from.y - to.y) < 0.001) return [];
  const leavingTableApproach = String(from.id || '').startsWith('table_seat_')
    && String(from.id).endsWith('_approach');
  const enteringTableApproach = String(to.id || '').startsWith('table_seat_')
    && String(to.id).endsWith('_approach');
  const compactRoute = (points) => points.filter((point, index, route) => (
    point
    && point.id !== from.id
    && (!index || point.id !== route[index - 1]?.id)
  ));
  // The shoreline is a hard locomotion boundary: skate on the lake, walk on land.
  if (from.kind === 'skate' && (to.kind === 'table' || enteringTableApproach)) {
    const tableApproach = to.kind === 'table' ? to.approach : to;
    return compactRoute([
      NAV_POINTS.lake_gate,
      tableApproach,
      ...(to.kind === 'table' ? [to] : []),
    ]);
  }
  if ((leavingTableApproach || from.kind === 'table') && to.kind === 'skate') {
    const tableApproach = from.kind === 'table' ? from.approach : from;
    return compactRoute([
      ...(from.kind === 'table' ? [tableApproach] : []),
      NAV_POINTS.lake_gate,
      to,
    ]);
  }
  if (leavingTableApproach && to.kind === 'basket') return [to];
  // ponytail: the round-table apron is open, so its seat approaches are direct targets too.
  if (enteringTableApproach) {
    return [to];
  }
  // A reserved outer seat always has a direct, obstacle-free approach from
  // its nearest leisure area. Do not send actors around the table nav ring.
  if (to.kind === 'table') {
    return [
      ...(from.kind === 'table' && from.approach ? [from.approach] : []),
      ...(to.approach ? [to.approach] : []),
      to,
    ].filter((point, index, points) => (
      point.id !== from.id
      && (!index || point.id !== points[index - 1].id)
    ));
  }
  if (from.kind === 'table') {
    return [...(from.approach ? [from.approach] : []), to];
  }
  // The court and lake are intentionally open activity surfaces. Everywhere
  // else uses the navigation graph so actors cannot cut across scenery.
  if (from.kind === to.kind && (to.kind === 'basket' || to.kind === 'skate')) return [to];
  const startNav = from.nav || from.id;
  const endNav = to.nav || to.id;
  const route = [
    ...(from.approach ? [from.approach] : []),
    ...shortestNavPath(startNav, endNav),
    ...(to.approach ? [to.approach] : []),
    to,
  ];
  return route.filter((point, index, points) => {
    if (!point) return false;
    const previous = points[index - 1];
    return !previous || point.id !== previous.id;
  });
}

export function actorTravelDuration(from, to) {
  const dx = (Number(to?.x || 0) - Number(from?.x || 0)) * 1536;
  const dy = (Number(to?.y || 0) - Number(from?.y || 0)) * 1024;
  const skating = (
    from?.kind === 'skate' && (to?.kind === 'skate' || to?.id === 'lake_gate')
  ) || (from?.id === 'lake_gate' && to?.kind === 'skate');
  // ponytail: one speed model keeps every route segment on the same visual beat.
  const pixelsPerMs = skating ? 0.18 : 0.13;
  return Math.round(Math.max(280, Math.min(skating ? 2400 : 2800, Math.hypot(dx, dy) / pixelsPerMs)));
}

export function canPlayLeisureAction(phase, leisureKind, arrived, motion = null) {
  if (phase !== 'leisure') return false;
  if (arrived) return true;
  return Boolean(
    motion?.moving
    && motion.fromKind === leisureKind
    && motion.toKind === leisureKind
  );
}

export function actorSpriteAction(phase, motion = null, leisureKind = '', activityAction = '') {
  const leisureAction = leisureKind === 'coffee'
    ? 'coffee'
    : leisureKind === 'basket'
      ? 'basketball'
      : leisureKind === 'skate'
        ? 'belly_slide'
        : 'idle';
  const skating = motion?.moving && (
    motion.mode === 'skate' || activityAction === 'belly_slide'
  );
  const dribbling = motion?.moving && activityAction === 'basketball';
  return skating
    ? 'belly_slide'
    : dribbling
      ? 'basketball'
    : motion?.moving && motion.mode === 'jump'
      ? 'idle'
    : motion?.moving
      ? `walk_${motion.direction || 'front'}`
    : motion?.mode === 'settle' && leisureKind === 'table'
      ? 'idle'
    : phase === 'working' || phase === 'reporting' || phase === 'complete'
      ? 'special'
      : phase === 'waiting'
        ? 'thinking'
      : phase === 'error'
        ? 'thinking'
        : activityAction || leisureAction;
}

export function actorSpriteSource(actor, phase, motion = null, leisureKind = '', animationFrame = 1, activityAction = '') {
  const action = actorSpriteAction(phase, motion, leisureKind, activityAction);
  const assetAction = action === 'basketball_pickup' ? 'basketball' : action;
  const walking = action.startsWith('walk_');
  const frame = action === 'special' && phase === 'reporting'
    ? ([1, 3, 1, 1][actor.spriteVariant - 1] || 1)
    : motion?.moving && action !== 'belly_slide' && !walking
      ? motion.frame
      : animationFrame;
  return `assets/world/penguins/${actor.spriteKey}/${assetAction}_${String(frame).padStart(2, '0')}.png`;
}

const VISIBLE_PROGRESS_EVENT_TYPES = new Set([
  'llm_thinking_delta',
  'llm_answer_delta',
  'llm_final_answer',
  'agent_progress_delta',
  'sub_agent_progress_delta',
  'sub_agent_answer_delta',
]);

function progressEventText(event) {
  if (!event || !VISIBLE_PROGRESS_EVENT_TYPES.has(String(event.type || ''))) return '';
  const value = String(
    event.delta
    || event.message
    || event.text
    || event.content
    || ''
  );
  return String(event.type || '').endsWith('_delta') ? value : value.trim();
}

function timestampValue(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return number;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function taskProgressText(task, nodeId, { isFinalNode = false } = {}) {
  const events = Array.isArray(task?.eventLog) ? task.eventLog : [];
  const node = task?.workflowRun?.nodes?.[nodeId];
  const workflowDone = normalizedStatus(task?.workflowRun?.status || task?.status) === 'done';
  const summary = toDisplayText(node?.summary).trim();
  if (summary) return summary;
  const finalAnswer = toDisplayText(task?.answerText).trim();
  if (isFinalNode && workflowDone && finalAnswer) return finalAnswer;
  const nodeDone = Boolean(
    node?.finished_at
    || node?.success !== undefined
    || ['done', 'completed', 'failed', 'cancelled'].includes(normalizedStatus(node?.status))
  );
  const startedAt = timestampValue(node?.started_at);
  const visible = events.filter((event) => (
    (event?.workflowNodeId
      ? event.workflowNodeId === nodeId
      : !nodeDone && (!startedAt || timestampValue(event?.timestamp) >= startedAt))
    && VISIBLE_PROGRESS_EVENT_TYPES.has(String(event?.type || ''))
  ));
  const text = visible.reduce((result, event) => {
    const chunk = progressEventText(event);
    if (!chunk) return result;
    const streamed = event.type === 'llm_thinking_delta'
      || event.type === 'llm_answer_delta'
      || event.type === 'sub_agent_answer_delta';
    return `${result}${result && !streamed ? '\n' : ''}${chunk}`;
  }, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    // Completed nodes must remain pinned to their own result. Falling back to
    // an unowned task-wide stream can leak a later node's answer into them.
    if (nodeDone) return '';
    const nodeRunning = normalizedStatus(node?.status) === 'running'
      || task?.workflowRun?.current_node_id === nodeId;
    return nodeRunning ? 'Working…' : '';
  }
  // ponytail: keep the latest stream window so a fixed-size bubble still updates like chat.
  return text.length > 180 ? `…${text.slice(-179)}` : text;
}
