import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

async function loadModule(name) {
  const source = fs.readFileSync(new URL(`../../../src/main/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const { createScheduledTaskActivity } = await loadModule('scheduled-task-activity');
const { createTaskSleepGuard } = await loadModule('task-sleep-guard');
const source = fs.readFileSync(new URL('../../../src/main/main.ts', import.meta.url), 'utf8');
const taskEvent = (id, type = 'run_started') => ({ type: 'task.event', schedule_id: 'schedule', run_id: id, event: { type } });
const runEvent = (id, status) => ({ type: 'schedule.event', event: { action: 'run_updated', run: { id, status } } });

function fixture() {
  const activity = createScheduledTaskActivity();
  const calls = [];
  const guard = createTaskSleepGuard({ start: () => { calls.push('start'); return 42; }, stop: (id) => { calls.push(['stop', id]); return true; } });
  const sync = (manual = 0) => guard.sync(manual + activity.size);
  const send = (message) => { activity.handle(message); sync(); };
  return { activity, calls, sync, send };
}

test('scheduled streams acquire once and release on the last task, including duplicates', () => {
  const { send, calls, activity } = fixture();
  send(runEvent('a', 'queued'));
  assert.deepEqual(calls, []);
  send(runEvent('a', 'running'));
  send(taskEvent('a'));
  send(taskEvent('b', 'llm_thinking_started'));
  assert.equal(activity.size, 2);
  assert.deepEqual(calls, ['start']);
  send(taskEvent('a', 'run_finished'));
  send({ type: 'task.end', schedule_id: 'schedule', run_id: 'a' });
  assert.deepEqual(calls, ['start']);
  send({ type: 'task.end', schedule_id: 'schedule', run_id: 'b' });
  assert.deepEqual(calls, ['start', ['stop', 42]]);
});

test('failed, cancelled, skipped, interrupted and succeeded runs release the guard', () => {
  for (const status of ['failed', 'cancelled', 'skipped', 'interrupted', 'succeeded']) {
    const { send, calls } = fixture();
    send(taskEvent('a'));
    send(runEvent('a', status));
    assert.deepEqual(calls, ['start', ['stop', 42]], status);
  }
});

test('pause/delete of definitions and approval waits do not release running tasks', () => {
  const { send, calls, activity } = fixture();
  send(taskEvent('a'));
  for (const action of ['paused', 'deleted']) send({ type: 'schedule.event', event: { action, schedule_id: 'schedule' } });
  send(taskEvent('a', 'approval_requested'));
  assert.equal(activity.size, 1);
  assert.deepEqual(calls, ['start']);
  send({ type: 'task.error', schedule_id: 'schedule', run_id: 'a' });
  assert.deepEqual(calls, ['start', ['stop', 42]]);
});

test('ordinary and scheduled work share one blocker', () => {
  const { send, calls, sync, activity } = fixture();
  sync(1);
  send(taskEvent('a'));
  activity.handle({ type: 'task.end', schedule_id: 'schedule', run_id: 'a' });
  sync(1);
  assert.deepEqual(calls, ['start']);
  sync(0);
  assert.deepEqual(calls, ['start', ['stop', 42]]);
});

test('snapshot reconciles missed starts and ends without releasing on failure', () => {
  const { activity, calls, sync } = fixture();
  activity.beginSnapshot().apply(['a', 'a']);
  sync();
  assert.equal(activity.size, 1);
  const failed = activity.beginSnapshot();
  assert.throws(() => failed.apply(undefined), /invalid/);
  failed.cancel();
  sync();
  assert.deepEqual(calls, ['start']);
  activity.beginSnapshot().apply([]);
  sync();
  assert.deepEqual(calls, ['start', ['stop', 42]]);
});

test('live starts and ends win over an in-flight stale snapshot', () => {
  const activity = createScheduledTaskActivity();
  activity.handle(taskEvent('ending'));
  const snapshot = activity.beginSnapshot();
  activity.handle(taskEvent('new'));
  activity.handle({ type: 'task.end', schedule_id: 'schedule', run_id: 'ending' });
  snapshot.apply(['ending']);
  assert.equal(activity.size, 1);
  activity.handle({ type: 'task.end', schedule_id: 'schedule', run_id: 'new' });
  assert.equal(activity.size, 0);
});

test('obsolete snapshot cannot re-acquire after quit or replace a newer snapshot', () => {
  const activity = createScheduledTaskActivity();
  const old = activity.beginSnapshot();
  activity.beginSnapshot().apply(['new']);
  old.apply(['old', 'other']);
  assert.equal(activity.size, 1);
  const quitting = activity.beginSnapshot();
  activity.clear();
  quitting.apply(['new']);
  assert.equal(activity.size, 0);
});

test('main handles scheduled power state before forwarding, without any renderer subscribers', () => {
  const { activity, calls, sync } = fixture();
  const forwarded = [];
  const handler = source.slice(source.indexOf('function handleRealtimeMessage('), source.indexOf('async function ensureRealtimeSocket('));
  const compiled = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext({
    scheduledTaskActivity: activity, syncTaskSleep: sync,
    realtimeScheduleSubscribers: new Set(), realtimeTaskOwners: new Map(),
    realtimeApprovalSubscribers: new Set(), realtimeCommandWaiters: new Map(),
    sendToWebContents: (...args) => forwarded.push(args),
  });
  vm.runInContext(compiled, context);
  context.handleRealtimeMessage({ data: JSON.stringify(taskEvent('a')) });
  assert.deepEqual(calls, ['start']);
  context.handleRealtimeMessage({ data: JSON.stringify({ type: 'task.end', schedule_id: 'schedule', run_id: 'a' }) });
  assert.deepEqual(calls, ['start', ['stop', 42]]);
  assert.deepEqual(forwarded, []);
  assert.match(source, /realtimeTaskOwners\.size \+ scheduledTaskActivity\.size/);
  const disconnect = source.slice(source.indexOf('function failRealtimeConnection('), source.indexOf('function scheduleRealtimeReconnect('));
  assert.doesNotMatch(disconnect, /scheduledTaskActivity\.clear/);
  const reconnect = source.slice(source.indexOf('function scheduleRealtimeReconnect('), source.indexOf('function handleRealtimeMessage('));
  assert.doesNotMatch(reconnect, /Subscribers\.size/);
  assert.match(source, /setInterval\(\(\) => void refreshScheduleActivity\(\), 15_000\)/);
  assert.match(source, /realtimeSocket !== socket/);
  assert.match(source.slice(source.indexOf('app\n  .whenReady()')), /ensureRealtimeSocket\(\)/);
  assert.match(source.slice(source.indexOf("app.on('before-quit'")), /scheduledTaskActivity\.clear\(\)/);
});
