import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorPhase,
  actorRoute,
  actorSpot,
  actorSpriteSource,
  actorTravelDuration,
  actorWalkDirection,
  basketballFlightPath,
  buildPenguinCast,
  canPlayLeisureAction,
  createLeisureSchedule,
  isInsideSkateBoundary,
  leisureBehaviorStep,
  LEISURE_SPOTS,
  TABLE_SPOTS,
  taskProgressText,
} from './bot-scene.js';

test('basketball trajectory is fixed at release and passes the planned contact point', () => {
  const start = { x: 600, y: 360 };
  const rim = { x: 900, y: 120 };
  const landing = { x: 960, y: 280 };
  for (const outcome of ['hit', 'miss']) {
    const first = basketballFlightPath(start, rim, landing, outcome);
    const second = basketballFlightPath(start, rim, landing, outcome);
    assert.deepEqual(first, second);
    assert.deepEqual(first.points[0], start);
    assert.deepEqual(first.points.at(-1), landing);
    const contact = first.points[Math.round(first.contactProgress * 120)];
    if (outcome === 'hit') {
      assert.ok(Math.abs(contact.x - rim.x) < 0.001);
      assert.ok(Math.abs(contact.y - rim.y) < 0.001);
    } else {
      assert.ok(Math.abs(contact.x - rim.x) >= 10);
    }
    const verticalDirections = first.points.slice(1).map((point, index) => (
      Math.sign(point.y - first.points[index].y)
    )).filter(Boolean);
    assert.ok(verticalDirections.reduce((changes, direction, index) => (
      index > 0 && direction !== verticalDirections[index - 1] ? changes + 1 : changes
    ), 0) <= 1);
  }
});

test('builds a stable cast from executable workflow nodes', () => {
  const workflow = {
    nodes: [
      { id: 'output', type: 'output' },
      { id: 'agent', type: 'agent', label: 'Planner' },
      { id: 'start', type: 'start' },
      { id: 'tool', type: 'tool', label: 'Builder' },
      { id: 'qa', type: 'llm', label: 'QA' },
    ],
    edges: [
      { from: 'start', to: 'agent' },
      { from: 'agent', to: 'tool' },
      { from: 'tool', to: 'qa' },
      { from: 'qa', to: 'output' },
    ],
  };
  const cast = buildPenguinCast(workflow);
  assert.deepEqual(cast.map((actor) => actor.nodeId), ['agent', 'tool', 'qa']);
  assert.equal(cast[0].spriteKey, 'penguin_1');
  assert.equal(cast[0].spawnSpot.id, cast[0].leisureSpotId);
  assert.deepEqual(cast.map((actor) => actor.seatIndex), [1, 2, 0]);
  const runningTask = {
    executionMode: 'bot',
    status: 'running',
    workflowRun: { status: 'running', current_node_id: 'agent', nodes: { agent: { status: 'running' } } },
  };
  assert.equal(actorPhase(cast[0], runningTask, false, cast.map((actor) => actor.nodeId)), 'working');
  assert.equal(actorPhase(cast[0], null, false, cast.map((actor) => actor.nodeId)), 'leisure');
  assert.equal(actorSpot(cast[0], 'working').id, 'table_seat_1');
  assert.equal(actorSpot(cast[1], 'walking_to_table').id, 'table_seat_2_approach');
  assert.equal(actorSpot(cast[0], 'waiting').id, 'table_seat_1_approach');
  assert.equal(actorSpot(cast[0], 'reporting').id, 'table_seat_1');
  assert.deepEqual(TABLE_SPOTS.slice(0, 3).map((spot) => spot.nav), [
    'table_west',
    'table_northwest',
    'table_northeast',
  ]);
  assert.deepEqual(TABLE_SPOTS.slice(0, 3).map(({ x, y }) => [x, y]), [
    [0.552, 0.66],
    [0.599, 0.56],
    [0.811, 0.535],
  ]);
  assert.deepEqual(
    [TABLE_SPOTS[2].approach.x, TABLE_SPOTS[2].approach.y],
    [0.85, 0.51],
  );
  assert.equal(actorWalkDirection({ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.45 }), 'right');
  assert.equal(actorWalkDirection({ x: 0.8, y: 0.8 }, { x: 0.75, y: 0.2 }), 'back');
  assert.match(actorSpriteSource(
    cast[0],
    'working',
    { moving: true, direction: 'left', frame: 3 },
    '',
    2,
  ), /walk_left_02\.png$/);
  assert.match(actorSpriteSource(cast[0], 'working', null, 'table', 2), /special_02\.png$/);
  assert.match(actorSpriteSource(
    cast[1],
    'working',
    { moving: false, mode: 'settle' },
    'table',
    2,
  ), /idle_02\.png$/);
  assert.match(actorSpriteSource(cast[0], 'reporting', null, 'table', 2), /special_01\.png$/);
  assert.match(actorSpriteSource(cast[1], 'reporting', null, 'table', 2), /special_03\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'coffee', 2), /coffee_02\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'basket', 3), /basketball_03\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'skate', 8), /belly_slide_08\.png$/);
  assert.match(actorSpriteSource(
    cast[2],
    'leisure',
    { moving: true, mode: 'skate', direction: 'right', frame: 2 },
    'route',
    4,
  ), /belly_slide_04\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'basket', 6, 'basketball_shoot'), /basketball_shoot_06\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', { moving: true, mode: 'jump', direction: 'back', frame: 2 }, 'coffee', 2), /idle_02\.png$/);
  const coffeeMake = leisureBehaviorStep('coffee', 1, 0, LEISURE_SPOTS[0]);
  const coffeeDrink = leisureBehaviorStep('coffee', 3, 0, LEISURE_SPOTS[0]);
  const coffeeApproach = leisureBehaviorStep('coffee', 8, 0, LEISURE_SPOTS[0]);
  const coffeeHopUp = leisureBehaviorStep('coffee', 9, 0, LEISURE_SPOTS[0]);
  const coffeeSit = leisureBehaviorStep('coffee', 10, 0, LEISURE_SPOTS[0]);
  const coffeeHopDown = leisureBehaviorStep('coffee', 11, 0, LEISURE_SPOTS[0]);
  const coffeeMachineReturn = leisureBehaviorStep('coffee', 12, 0, LEISURE_SPOTS[0]);
  const coffeeMakeAgain = leisureBehaviorStep('coffee', 13, 0, LEISURE_SPOTS[0]);
  assert.equal(coffeeMake.action, 'coffee_make');
  assert.equal(coffeeDrink.action, 'coffee');
  assert.ok(coffeeApproach.spot.id.endsWith('_approach'));
  assert.ok(coffeeHopUp.spot.id.startsWith('coffee_seat_'));
  assert.equal(coffeeSit.action, 'coffee_sit');
  assert.ok(coffeeHopDown.spot.id.endsWith('_approach'));
  assert.equal(coffeeMachineReturn.action, 'idle');
  assert.equal(coffeeMakeAgain.action, 'coffee_make');
  assert.equal(coffeeMachineReturn.spot.id, coffeeMakeAgain.spot.id);
  assert.ok(actorRoute(coffeeHopDown.spot, coffeeMakeAgain.spot).length >= 2);
  const coffeeRoute = actorRoute(coffeeMake.spot, coffeeSit.spot);
  assert.ok(coffeeRoute.some((point) => point.id.endsWith('_approach')));
  assert.equal(coffeeRoute.at(-1).id, coffeeSit.spot.id);
  const tableApproach = leisureBehaviorStep('coffee', 18, 0, LEISURE_SPOTS[0], TABLE_SPOTS[3]);
  const tableHop = leisureBehaviorStep('coffee', 19, 0, LEISURE_SPOTS[0], TABLE_SPOTS[3]);
  const tableThinking = leisureBehaviorStep('coffee', 20, 0, LEISURE_SPOTS[0], TABLE_SPOTS[3]);
  const tableLeave = leisureBehaviorStep('coffee', 21, 0, LEISURE_SPOTS[0], TABLE_SPOTS[3]);
  assert.equal(tableApproach.spot.id, TABLE_SPOTS[3].approach.id);
  assert.equal(tableHop.spot.id, TABLE_SPOTS[3].id);
  assert.equal(tableThinking.action, 'thinking');
  assert.equal(tableThinking.tableBreak, true);
  assert.equal(tableLeave.spot.id, TABLE_SPOTS[3].approach.id);
  assert.equal(
    leisureBehaviorStep('basket', 18, 1, LEISURE_SPOTS[1], TABLE_SPOTS[2]).action,
    'special',
  );
  const shortBasketSchedule = createLeisureSchedule('basket', () => 0);
  const longBasketSchedule = createLeisureSchedule('basket', () => 0.999);
  assert.equal(createLeisureSchedule('coffee', () => 0).outdoorSteps, 12);
  assert.equal(createLeisureSchedule('coffee', () => 0.999).outdoorSteps, 24);
  assert.equal(createLeisureSchedule('skate', () => 0).outdoorSteps, 4);
  assert.equal(createLeisureSchedule('skate', () => 0.999).outdoorSteps, 10);
  assert.equal(shortBasketSchedule.outdoorSteps, 8);
  assert.equal(longBasketSchedule.outdoorSteps, 24);
  assert.equal(shortBasketSchedule.tableDuration, 9000);
  assert.equal(longBasketSchedule.tableDuration, 15000);
  assert.equal(shortBasketSchedule.tableAction, 'special');
  assert.equal(longBasketSchedule.tableAction, 'special');
  assert.equal(
    leisureBehaviorStep(
      'basket',
      8,
      1,
      LEISURE_SPOTS[1],
      TABLE_SPOTS[2],
      shortBasketSchedule,
    ).spot.id,
    TABLE_SPOTS[2].approach.id,
  );
  assert.equal(
    leisureBehaviorStep(
      'basket',
      9,
      1,
      LEISURE_SPOTS[1],
      TABLE_SPOTS[2],
      shortBasketSchedule,
    ).action,
    'special',
  );
  const basketTableRest = leisureBehaviorStep(
    'basket', 10, 1, LEISURE_SPOTS[1], TABLE_SPOTS[2], shortBasketSchedule,
  );
  const basketReturnToBall = leisureBehaviorStep(
    'basket', 12, 1, LEISURE_SPOTS[1], TABLE_SPOTS[2], shortBasketSchedule,
  );
  const basketRepick = leisureBehaviorStep(
    'basket', 13, 1, LEISURE_SPOTS[1], TABLE_SPOTS[2], shortBasketSchedule,
  );
  const basketResume = leisureBehaviorStep(
    'basket', 14, 1, LEISURE_SPOTS[1], TABLE_SPOTS[2], shortBasketSchedule,
  );
  assert.equal(basketTableRest.duration, 9000);
  assert.equal(leisureBehaviorStep(
    'basket', 10, 1, LEISURE_SPOTS[1], TABLE_SPOTS[2],
    { ...shortBasketSchedule, tableAction: 'thinking' },
  ).action, 'special');
  assert.equal(basketTableRest.ball.state, 'landed');
  assert.equal(basketReturnToBall.ball.state, 'landed');
  assert.equal(basketReturnToBall.spot.id, basketRepick.spot.id);
  assert.equal(basketRepick.action, 'basketball_pickup');
  assert.equal(basketRepick.ball, undefined);
  assert.equal(basketResume.scheduleComplete, true);
  const ballRelease = leisureBehaviorStep('basket', 3, 1);
  assert.equal(ballRelease.action, 'basketball_shoot');
  assert.equal(ballRelease.ball.state, 'flight');
  assert.equal(ballRelease.ball.releaseDelay, 220);
  const ballFlight = leisureBehaviorStep('basket', 4, 1);
  const ballLanded = leisureBehaviorStep('basket', 5, 1);
  const ballPickup = leisureBehaviorStep('basket', 6, 1);
  assert.equal(ballFlight.action, 'basketball_shoot');
  assert.equal(ballFlight.ball.state, 'flight');
  assert.equal(ballFlight.duration, 3000);
  assert.equal(ballRelease.ball.key, ballFlight.ball.key);
  assert.equal(ballLanded.ball.state, 'landed');
  assert.equal(ballFlight.ball.key, ballLanded.ball.key);
  assert.ok(ballFlight.ball.start.x < ballFlight.ball.hoop.x);
  assert.ok(ballFlight.ball.start.y > ballFlight.ball.hoop.y);
  assert.ok(ballLanded.ball.landing.y > ballFlight.ball.hoop.y);
  assert.equal(ballPickup.action, 'basketball_pickup');
  assert.equal(ballPickup.ball, undefined);
  assert.equal(ballPickup.spot.id, `${ballLanded.ball.landing.id}_pickup`);
  assert.equal(ballPickup.spot.x, ballLanded.ball.landing.x);
  assert.equal(ballPickup.spot.y, ballLanded.ball.landing.y);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'basket', 5, 'basketball_pickup'), /basketball_05\.png$/);
  assert.match(actorSpriteSource(
    cast[0],
    'leisure',
    { moving: true, mode: 'walk', direction: 'right', frame: 2 },
    'basket',
    2,
    'basketball',
  ), /basketball_02\.png$/);
  assert.match(
    actorSpriteSource(cast[0], 'leisure', null, 'table', 3, 'special'),
    /special_03\.png$/,
  );
  assert.equal(leisureBehaviorStep('skate', 2, 2).action, 'belly_slide');
  const skateStart = leisureBehaviorStep('skate', 0, 2).spot;
  const skateEnd = leisureBehaviorStep('skate', 1, 2).spot;
  assert.ok(Math.hypot(
    (skateEnd.x - skateStart.x) * 1536,
    (skateEnd.y - skateStart.y) * 1024,
  ) > 280);
  assert.ok(Array.from({ length: 24 }, (_, index) => (
    leisureBehaviorStep('skate', index, 2)
  )).filter((step) => step.action === 'belly_slide').every((step) => (
    isInsideSkateBoundary(step.spot)
  )));
  assert.equal(
    leisureBehaviorStep('skate', 8, 2, LEISURE_SPOTS[2], TABLE_SPOTS[0]).tableBreak,
    true,
  );
  const route = actorRoute(LEISURE_SPOTS[2], TABLE_SPOTS[2]);
  assert.deepEqual(route.map((point) => point.id), [
    'lake_gate',
    'table_seat_2_approach',
    'table_seat_2',
  ]);
  assert.equal(route.at(-1).id, 'table_seat_2');
  assert.deepEqual(
    actorRoute(LEISURE_SPOTS[2], TABLE_SPOTS[0].approach).map((point) => point.id),
    ['lake_gate', 'table_seat_0_approach'],
  );
  assert.deepEqual(
    actorRoute(TABLE_SPOTS[2].approach, TABLE_SPOTS[2]).map((point) => point.id),
    ['table_seat_2'],
  );
  assert.deepEqual(
    actorRoute(TABLE_SPOTS[2], LEISURE_SPOTS[1]).map((point) => point.id),
    ['table_seat_2_approach', 'leisure_basket_1'],
  );
  assert.deepEqual(
    actorRoute(TABLE_SPOTS[2].approach, LEISURE_SPOTS[1]).map((point) => point.id),
    ['leisure_basket_1'],
  );
  assert.deepEqual(
    actorRoute(TABLE_SPOTS[0].approach, LEISURE_SPOTS[2]).map((point) => point.id),
    ['lake_gate', 'leisure_skate_1'],
  );
  assert.ok([...LEISURE_SPOTS, ...TABLE_SPOTS].every((spot) => (
    spot.x >= 0 && spot.x <= 1 && spot.y >= 0 && spot.y <= 1
  )));
  const seatHopDuration = actorTravelDuration(route.at(-2), route.at(-1));
  assert.ok(seatHopDuration >= 280 && seatHopDuration <= 700);
  assert.ok(actorTravelDuration(
    { x: 0.1, y: 0.1, kind: 'route' },
    { x: 0.8, y: 0.8, kind: 'route' },
  ) > seatHopDuration);
  assert.equal(canPlayLeisureAction('leisure', 'basket', false, {
    moving: true,
    fromKind: 'table',
    toKind: 'route',
  }), false);
  assert.equal(canPlayLeisureAction('leisure', 'basket', false, {
    moving: true,
    fromKind: 'basket',
    toKind: 'basket',
  }), true);
  const partialRun = {
    executionMode: 'bot',
    status: 'done',
    workflowRun: { status: 'done', nodes: { agent: { status: 'done', success: true } } },
  };
  assert.equal(actorPhase(cast[0], partialRun, false, cast.map((actor) => actor.nodeId)), 'reporting');
  const completedRun = {
    executionMode: 'bot',
    status: 'done',
    workflowRun: {
      status: 'done',
      nodes: Object.fromEntries(cast.map((actor) => [
        actor.nodeId,
        { status: 'done', success: true },
      ])),
    },
  };
  assert.deepEqual(
    cast.map((actor) => actorPhase(
      actor,
      completedRun,
      false,
      cast.map((item) => item.nodeId),
    )),
    ['leisure', 'leisure', 'reporting'],
  );
});

test('uses user-visible stream progress from the active workflow node window', () => {
  const task = {
    workflowRun: {
      nodes: {
        planner: { started_at: '2026-07-27T10:00:00.000Z' },
      },
    },
    eventLog: [
      { type: 'agent_progress_delta', timestamp: '2026-07-27T09:59:59.000Z', message: '旧节点内容' },
      { type: 'llm_thinking_delta', timestamp: '2026-07-27T10:00:01.000Z', delta: '正在分析' },
      { type: 'llm_thinking_delta', timestamp: '2026-07-27T10:00:02.000Z', delta: '用户需求' },
    ],
  };
  assert.equal(taskProgressText(task, 'planner'), '正在分析用户需求');
  assert.equal(taskProgressText({
    workflowRun: { nodes: { planner: { summary: '完整节点结果' } } },
    eventLog: [{ type: 'llm_answer_delta', delta: '流式片段' }],
  }, 'planner'), '完整节点结果');
  assert.equal(taskProgressText({
    workflowRun: {
      status: 'done',
      nodes: {
        product: { status: 'done', success: true, summary: '产品节点结果' },
        qa: { status: 'done', success: true, summary: 'QA 节点结果' },
      },
    },
    answerText: '整个工作流的最终结果',
    eventLog: [{ type: 'llm_answer_delta', delta: '整个工作流的最终结果' }],
  }, 'product'), '产品节点结果');
  assert.equal(taskProgressText({
    workflowRun: {
      status: 'done',
      nodes: {
        qa: { status: 'done', success: true, summary: 'QA 节点结果' },
      },
    },
    answerText: '整个工作流的最终结果',
  }, 'qa', { isFinalNode: true }), 'QA 节点结果');
  assert.equal(taskProgressText({
    workflowRun: {
      status: 'done',
      nodes: {
        qa: { status: 'done', success: true, summary: '最后节点的真实结果' },
      },
    },
    answerText: '{"answer":"错误回显的用户输入"}',
  }, 'qa', { isFinalNode: true }), '最后节点的真实结果');
  assert.equal(taskProgressText({
    workflowRun: {
      status: 'done',
      nodes: {
        qa: { status: 'done', success: true },
      },
    },
    answerText: '{"answer":"已解包的最终结果"}',
  }, 'qa', { isFinalNode: true }), '已解包的最终结果');
  assert.equal(taskProgressText({
    workflowRun: {
      status: 'done',
      nodes: {
        product: { status: 'done', success: true },
      },
    },
    answerText: '不应串到产品节点的最终结果',
    eventLog: [{ type: 'llm_answer_delta', delta: '不应串到产品节点的最终结果' }],
  }, 'product'), '');
  assert.equal(taskProgressText({ workflowRun: { nodes: {} }, eventLog: [] }, 'planner'), '');
  assert.equal(taskProgressText({
    workflowRun: { nodes: { planner: {} } },
    eventLog: [{ type: 'tool_executor_started', message: '手动拼接的工具状态' }],
  }, 'planner'), '');
  assert.equal(taskProgressText({
    workflowRun: {
      current_node_id: 'planner',
      nodes: { planner: { status: 'running' } },
    },
    eventLog: [],
  }, 'planner'), 'Working…');
  assert.equal(taskProgressText({
    workflowRun: {
      current_node_id: 'builder',
      nodes: {
        planner: { started_at: '2026-07-27T10:00:00.000Z' },
        builder: { status: 'running', started_at: '2026-07-27T10:01:00.000Z' },
      },
    },
    eventLog: [
      { type: 'llm_answer_delta', workflowNodeId: 'planner', delta: '产品方案' },
      { type: 'llm_final_answer', workflowNodeId: 'builder', message: '开发结果' },
    ],
  }, 'builder'), '开发结果');
  assert.equal(taskProgressText({
    workflowRun: {
      nodes: {
        planner: { status: 'done', success: true },
      },
    },
    eventLog: [
      { type: 'llm_answer_delta', workflowNodeId: 'planner', delta: '完成了' },
      { type: 'llm_answer_delta', workflowNodeId: 'planner', delta: ' 产品分析' },
    ],
  }, 'planner'), '完成了 产品分析');
  const longStream = `${'较早的流式内容'.repeat(30)}这是最新输出`;
  const visibleLongStream = taskProgressText({
    workflowRun: {
      current_node_id: 'planner',
      nodes: {
        planner: { status: 'running' },
      },
    },
    eventLog: [
      { type: 'llm_answer_delta', workflowNodeId: 'planner', delta: longStream },
    ],
  }, 'planner');
  assert.equal(visibleLongStream, `…${longStream.slice(-179)}`);
  assert.ok(visibleLongStream.endsWith('这是最新输出'));
});
