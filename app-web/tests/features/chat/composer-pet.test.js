import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseIdleAction, idleRestDuration } from '../../../src/features/chat/model/pet-idle.js';
import { pickerPlatform, jumpPoint, jumpTarget, platformEdge } from '../../../src/features/chat/model/pet-obstacle.js';
globalThis.window = { HAISH_API_BASE: '' };
const { nextPetCompletion, petActivityFromMessages, petActivityFromWorkflow, petTargetState } = await import('../../../src/features/chat/model/pet-state.js');

test('pet does not add an outline or a text bubble', () => {
  const css = readFileSync(new URL('../../../src/features/chat/components/composer-pet.css', import.meta.url), 'utf8');
  const component = readFileSync(new URL('../../../src/features/chat/components/ComposerPet.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /drop-shadow|box-shadow|filter\s*:/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /\.composer-pet-sprite\s*\{[^}]*image-rendering:\s*auto/s, 'opt out of the app-wide pixelated rendering');
});

test('all four idle actions can be selected, including first, and rest has a bounded duration', () => {
  assert.equal(chooseIdleAction(() => 0), 'walk');
  assert.equal(chooseIdleAction(() => 0.25), 'run');
  assert.equal(chooseIdleAction(() => 0.5), 'sit');
  assert.equal(chooseIdleAction(() => 0.75), 'sleep');
  assert.equal(idleRestDuration('sit'), 10000);
  assert.equal(idleRestDuration('sleep'), 15000);
});

test('picker geometry respects actual bounds, available landing space and jump arcs', () => {
  const form = { left: 100, width: 700 };
  const picker = { left: 200, right: 340, top: 150, width: 140, height: 32 };
  const platform = pickerPlatform(form, picker, 120, 580, 190);
  assert.deepEqual(platform, { left: 100, right: 240, height: 40, halfBody: 26, minCenter: 60, maxCenter: 640 });
  assert.equal(pickerPlatform(form, null, 120, 580, 190), null);
  assert.equal(jumpTarget(platform, 1, true), 133);
  assert.equal(jumpTarget(platform, -1, true), 207);
  assert.equal(jumpTarget(platform, 1, false), 276);
  assert.equal(jumpTarget(platform, -1, false), 64);
  assert.equal(jumpTarget({ ...platform, left: 0 }, -1, false), null);
  assert.equal(platformEdge({ ...platform, left: 0 }, -1), 34);
  assert.equal(platformEdge(platform, 1), 212);
  assert.equal(platformEdge(platform, -1), 128);
  for (const dir of [-1, 1]) {
    const from = dir === 1 ? 74 : 266;
    const target = jumpTarget(platform, dir, true);
    for (let i = 0; i <= 100; i += 1) {
      const point = jumpPoint(from, target, 40, true, i / 100);
      if (point.x + 26 > 100.01 && point.x - 26 < 239.99) assert.ok(point.lift >= 39.5);
    }
    assert.deepEqual(jumpPoint(from, target, 40, true, 1), { x: target, lift: 40 });
    const exit = jumpTarget(platform, dir, false);
    for (let i = 0; i <= 100; i += 1) {
      const point = jumpPoint(target, exit, 40, false, i / 100);
      if (point.x + 26 > 100.01 && point.x - 26 < 239.99) assert.ok(point.lift >= 39.5);
    }
    assert.deepEqual(jumpPoint(target, exit, 40, false, 1), { x: exit, lift: 0 });
  }
});

test('pet follows real execution and wait states', () => {
  assert.equal(petTargetState({ runState: 'waiting_input', running: true }), 'thinking');
  assert.equal(petTargetState({ runState: 'approval', running: true }), 'thinking');
  assert.equal(petTargetState({ runState: 'running', activityState: 'composing' }), 'thinking');
  assert.equal(petTargetState({ runState: 'running', activityState: 'working' }), 'working');
  assert.equal(petTargetState({ runState: 'running', activityState: 'thinking' }), 'thinking');
  assert.equal(petTargetState({ runState: 'running', activityState: 'searching' }), 'thinking');
  assert.equal(petTargetState({ runState: 'running', activityState: 'solving' }), 'working');
  assert.equal(petTargetState({ runState: 'running', activityState: 'listening' }), 'thinking');
  assert.equal(petTargetState({ runState: 'running', activityState: 'other-active-state' }), 'working');
  assert.equal(petTargetState({ runState: 'idle', submitPending: true }), 'thinking');
  assert.equal(petTargetState({ runState: 'idle' }), 'idle');
});

test('pet activity uses only the current streaming task timeline and the orb resolver', () => {
  const rows = [
    { role: 'agent', taskId: 'old', streaming: true, traceTimeline: [{ kind: 'tool', status: 'running', toolName: 'execute' }] },
    { role: 'agent', taskId: 'now', streaming: true, traceTimeline: [{ kind: 'thinking', streaming: true }] },
  ];
  assert.equal(petActivityFromMessages(rows, 'now', 'running'), 'composing');
  rows[1].traceTimeline = [{ kind: 'tool', status: 'running', toolName: 'execute' }];
  assert.equal(petActivityFromMessages(rows, 'now', 'running'), 'working');
  assert.equal(petActivityFromMessages(rows, 'missing', 'running'), null);
  rows[1].streaming = false;
  assert.equal(petActivityFromMessages(rows, 'now', 'running'), null);
  assert.equal(petActivityFromWorkflow(null, 'running'), null);
  assert.equal(petActivityFromWorkflow({ workflowRun: { current_node_id: 'n', nodes: {} }, eventLog: [] }, 'running'), 'composing');
});

test('drag position is shared, clamped, and survives storage errors', async () => {
  const values = new Map();
  globalThis.window.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const module = await import('../../../src/features/chat/model/pet-position.js?position-test');
  assert.equal(module.readPetPosition(), null);
  module.savePetPosition(150, 300);
  assert.equal(module.readPetPosition(), 0.5);
  const reloaded = await import('../../../src/features/chat/model/pet-position.js?position-reload');
  assert.equal(reloaded.readPetPosition(), 0.5);
  reloaded.savePetPosition(500, 300);
  assert.equal(reloaded.readPetPosition(), 1);
  globalThis.window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  reloaded.savePetPosition(30, 100);
  assert.equal(reloaded.readPetPosition(), 0.3);
  reloaded.savePetPosition(30, 0);
  assert.equal(reloaded.readPetPosition(), 0.3);
});

test('celebrates only a live success of the same visible task and conversation', () => {
  const live = { conversationId: 'a', taskId: '1', active: true, taskStatus: 'running' };
  const done = { conversationId: 'a', taskId: '1', active: false, taskStatus: 'done' };
  const tracked = nextPetCompletion(null, live).tracked;
  assert.equal(nextPetCompletion(tracked, done).celebrate, true);
  assert.equal(nextPetCompletion(null, done).celebrate, false);
  assert.equal(nextPetCompletion(tracked, { ...done, conversationId: 'b' }).celebrate, false);
  assert.equal(nextPetCompletion(tracked, { ...done, taskId: '2' }).celebrate, false);
  assert.equal(nextPetCompletion(tracked, { ...done, taskStatus: 'failed' }).celebrate, false);
  assert.equal(nextPetCompletion(tracked, { ...done, taskStatus: 'cancelled' }).celebrate, false);
  const stillBusy = nextPetCompletion(tracked, { ...done, active: true });
  assert.equal(stillBusy.celebrate, false);
  assert.equal(nextPetCompletion(stillBusy.tracked, done).celebrate, true);
  const delayedStatus = nextPetCompletion(tracked, { ...live, active: false });
  assert.equal(nextPetCompletion(delayedStatus.tracked, done).celebrate, true);
});
