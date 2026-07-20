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
  isInsideSkateBoundary,
  leisureBehaviorStep,
  LEISURE_SPOTS,
  TABLE_SPOTS,
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
    ],
    edges: [
      { from: 'start', to: 'agent' },
      { from: 'agent', to: 'tool' },
      { from: 'tool', to: 'output' },
    ],
  };
  const cast = buildPenguinCast(workflow);
  assert.deepEqual(cast.map((actor) => actor.nodeId), ['agent', 'tool']);
  assert.equal(cast[0].spriteKey, 'penguin_1');
  assert.equal(cast[0].spawnSpot.id, cast[0].leisureSpotId);
  const runningTask = {
    executionMode: 'bot',
    status: 'running',
    workflowRun: { status: 'running', current_node_id: 'agent', nodes: { agent: { status: 'running' } } },
  };
  assert.equal(actorPhase(cast[0], runningTask, false, cast.map((actor) => actor.nodeId)), 'working');
  assert.equal(actorPhase(cast[0], null, false, cast.map((actor) => actor.nodeId)), 'leisure');
  assert.equal(actorSpot(cast[0], 'working').id, 'table_work');
  assert.equal(actorWalkDirection({ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.45 }), 'right');
  assert.equal(actorWalkDirection({ x: 0.8, y: 0.8 }, { x: 0.75, y: 0.2 }), 'back');
  assert.match(actorSpriteSource(cast[0], 'working', { moving: true, direction: 'left', frame: 3 }), /walk_left_03\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'coffee', 2), /coffee_02\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'basket', 3), /basketball_03\.png$/);
  assert.match(actorSpriteSource(cast[0], 'leisure', null, 'skate', 8), /belly_slide_08\.png$/);
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
  const ballRelease = leisureBehaviorStep('basket', 3, 1);
  assert.equal(ballRelease.action, 'basketball_shoot');
  assert.equal(ballRelease.ball.state, 'flight');
  assert.equal(ballRelease.ball.releaseDelay, 220);
  const ballFlight = leisureBehaviorStep('basket', 4, 1);
  const ballLanded = leisureBehaviorStep('basket', 5, 1);
  const ballPickup = leisureBehaviorStep('basket', 6, 1);
  assert.equal(ballFlight.action, 'basketball_shoot');
  assert.equal(ballFlight.ball.state, 'flight');
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
  assert.equal(leisureBehaviorStep('skate', 2, 2).action, 'belly_slide');
  assert.ok(Array.from({ length: 24 }, (_, index) => (
    isInsideSkateBoundary(leisureBehaviorStep('skate', index, 2).spot)
  )).every(Boolean));
  const route = actorRoute(LEISURE_SPOTS[2], TABLE_SPOTS[2]);
  assert.ok(route.length >= 4);
  assert.equal(route.at(-1).id, 'table_seat_2');
  assert.ok([...LEISURE_SPOTS, ...TABLE_SPOTS].every((spot) => (
    spot.x >= 0 && spot.x <= 1 && spot.y >= 0 && spot.y <= 1
  )));
  assert.ok(actorTravelDuration(route[0], route[1]) >= 420);
  const partialRun = {
    executionMode: 'bot',
    status: 'done',
    workflowRun: { status: 'done', nodes: { agent: { status: 'done', success: true } } },
  };
  assert.equal(actorPhase(cast[0], partialRun, false, cast.map((actor) => actor.nodeId)), 'leisure');
});
