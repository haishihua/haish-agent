// @haish-esm

export const BOT_ACTOR_NODE_TYPES = new Set(['agent', 'llm', 'tool']);

export const TABLE_SPOTS = [
  { id: 'table_seat_0', kind: 'table', nav: 'table_west', x: 0.55, y: 0.66, approach: { id: 'table_seat_0_approach', kind: 'route', nav: 'table_west', x: 0.51, y: 0.67 } },
  { id: 'table_seat_1', kind: 'table', nav: 'table_southwest', x: 0.60, y: 0.80, approach: { id: 'table_seat_1_approach', kind: 'route', nav: 'table_southwest', x: 0.56, y: 0.82 } },
  { id: 'table_seat_2', kind: 'table', nav: 'table_northeast', x: 0.81, y: 0.60, approach: { id: 'table_seat_2_approach', kind: 'route', nav: 'table_northeast', x: 0.85, y: 0.58 } },
  { id: 'table_seat_3', kind: 'table', nav: 'table_east', x: 0.87, y: 0.72, approach: { id: 'table_seat_3_approach', kind: 'route', nav: 'table_east', x: 0.91, y: 0.72 } },
  { id: 'table_seat_4', kind: 'table', nav: 'table_northwest', x: 0.59, y: 0.56, approach: { id: 'table_seat_4_approach', kind: 'route', nav: 'table_northwest', x: 0.57, y: 0.52 } },
  { id: 'table_seat_5', kind: 'table', nav: 'table_northeast', x: 0.74, y: 0.54, approach: { id: 'table_seat_5_approach', kind: 'route', nav: 'table_northeast', x: 0.74, y: 0.50 } },
];

const TABLE_WORK_SPOT = { ...TABLE_SPOTS[0], id: 'table_work' };

export const TABLE_OVERFLOW_SPOTS = [
  TABLE_SPOTS[4],
  TABLE_SPOTS[5],
  TABLE_SPOTS[2],
];

export const LEISURE_SPOTS = [
  { id: 'leisure_coffee_1', kind: 'coffee', nav: 'cafe_east', x: 0.38, y: 0.41 },
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
    { id: 'skate_0', kind: 'skate', nav: 'lake_center', x: 0.16, y: 0.68 },
    { id: 'skate_1', kind: 'skate', nav: 'lake_center', x: 0.32, y: 0.64 },
    { id: 'skate_2', kind: 'skate', nav: 'lake_center', x: 0.23, y: 0.76 },
    { id: 'skate_3', kind: 'skate', nav: 'lake_center', x: 0.33, y: 0.70 },
    { id: 'skate_4', kind: 'skate', nav: 'lake_center', x: 0.17, y: 0.73 },
    { id: 'skate_5', kind: 'skate', nav: 'lake_center', x: 0.27, y: 0.61 },
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

export function leisureBehaviorStep(kind, stepIndex, actorIndex = 0, fallbackSpot = LEISURE_SPOTS[0]) {
  if (kind === 'coffee') {
    const step = stepIndex % 6;
    const cycle = Math.floor(stepIndex / 6);
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
    const step = stepIndex % 8;
    const cycle = Math.floor(stepIndex / 8);
    const dribble = rotatingSpot(ACTIVITY_SPOTS.basketDribble, actorIndex, cycle);
    const shoot = rotatingSpot(ACTIVITY_SPOTS.basketShoot, actorIndex, cycle);
    const outcome = (actorIndex + cycle) % 3 === 0 ? 'miss' : 'hit';
    const landing = rotatingSpot(
      outcome === 'hit' ? ACTIVITY_SPOTS.basketMade : ACTIVITY_SPOTS.basketLoose,
      actorIndex,
      cycle,
    );
    const pickup = {
      ...landing,
      id: `${landing.id}_pickup`,
    };
    const ball = {
      key: `${actorIndex}-${cycle}`,
      outcome,
      spriteKey: `penguin_${(actorIndex % 4) + 1}`,
      spriteVariant: (actorIndex % 4) + 1,
      start: shoot,
      hoop: BASKET_RIM,
      landing,
    };
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
    if (step === 4) return { action: 'basketball_shoot', duration: 1900, spot: shoot, ball: { ...ball, state: 'flight' } };
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
      spot: rotatingSpot(ACTIVITY_SPOTS.skate, actorIndex, stepIndex),
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
  return stableWorkflowOrder(workflow)
    .filter((node) => BOT_ACTOR_NODE_TYPES.has(String(node?.type || '').toLowerCase()))
    .map((node, index) => ({
      actorId: `wfnode:${node.id}`,
      nodeId: String(node.id),
      nodeType: String(node.type).toLowerCase(),
      label: String(node.label || node.name || node.id || `Node ${index + 1}`),
      spriteKey: `penguin_${(index % 4) + 1}`,
      spriteVariant: (index % 4) + 1,
      seatIndex: index,
      leisureSpotId: LEISURE_SPOTS[index % LEISURE_SPOTS.length].id,
      spawnSpot: LEISURE_SPOTS[index % LEISURE_SPOTS.length],
      castIndex: index,
    }));
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
  const allActorsFinished = actorNodeIds.length > 0 && actorNodeIds.every((nodeId) => {
    const result = run.nodes?.[nodeId];
    const status = normalizedStatus(result?.status);
    return Boolean(result) && result.success !== false && status !== 'running' && status !== 'failed';
  });

  if (runStatus === 'done' && allActorsFinished) return reportDismissed ? 'leisure' : 'reporting';
  if (node?.success === false || nodeStatus === 'failed') return 'error';
  if (run.current_node_id === actor.nodeId || nodeStatus === 'running') return 'working';
  return 'leisure';
}

export function actorSpot(actor, phase) {
  if (phase === 'working') return TABLE_WORK_SPOT;
  if (phase === 'reporting') {
    if (actor.seatIndex < TABLE_SPOTS.length) return TABLE_SPOTS[actor.seatIndex];
    return TABLE_OVERFLOW_SPOTS[(actor.seatIndex - TABLE_SPOTS.length) % TABLE_OVERFLOW_SPOTS.length];
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
  const skating = from?.kind === 'skate' && to?.kind === 'skate';
  const pixelsPerMs = skating ? 0.105 : 0.075;
  return Math.round(Math.max(700, Math.min(skating ? 3600 : 4200, Math.hypot(dx, dy) / pixelsPerMs)));
}

export function actorSpriteAction(phase, motion = null, leisureKind = '', activityAction = '') {
  const leisureAction = leisureKind === 'coffee'
    ? 'coffee'
    : leisureKind === 'basket'
      ? 'basketball'
      : leisureKind === 'skate'
        ? 'belly_slide'
        : 'idle';
  const skating = motion?.moving && activityAction === 'belly_slide';
  const dribbling = motion?.moving && activityAction === 'basketball';
  return skating
    ? 'belly_slide'
    : dribbling
      ? 'basketball'
    : motion?.moving && motion.mode === 'jump'
      ? 'idle'
    : motion?.moving
      ? `walk_${motion.direction || 'front'}`
    : phase === 'working'
    ? 'thinking'
    : phase === 'reporting' || phase === 'complete'
      ? 'special'
      : phase === 'error'
        ? 'thinking'
        : activityAction || leisureAction;
}

export function actorSpriteSource(actor, phase, motion = null, leisureKind = '', animationFrame = 1, activityAction = '') {
  const action = actorSpriteAction(phase, motion, leisureKind, activityAction);
  const assetAction = action === 'basketball_pickup' ? 'basketball' : action;
  const frame = motion?.moving && action !== 'belly_slide' ? motion.frame : animationFrame;
  return `assets/world/penguins/${actor.spriteKey}/${assetAction}_${String(frame).padStart(2, '0')}.png`;
}
