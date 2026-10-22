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
const { createAppSleepGuard } = await loadModule('app-sleep-guard');
const source = fs.readFileSync(new URL('../../../src/main/main.ts', import.meta.url), 'utf8');
const realtimeSource = fs.readFileSync(new URL('../../../src/main/realtime-client.ts', import.meta.url), 'utf8');
const taskEvent = (id, type = 'run_started') => ({ type: 'task.event', schedule_id: 'schedule', run_id: id, event: { type } });
const runEvent = (id, status) => ({ type: 'schedule.event', event: { action: 'run_updated', run: { id, status } } });

function fixture(blockerId = 42) {
  const activity = createScheduledTaskActivity();
  const calls = [];
  const guard = createAppSleepGuard({ start: () => { calls.push('start'); return blockerId; }, stop: (id) => { calls.push(['stop', id]); return true; } });
  const send = (message) => activity.handle(message);
  return { activity, calls, guard, send };
}

function runMainSection(text, globals) {
  // 切片里可能出现 `export function ...`：在 VM 里当普通声明执行即可。
  const compiled = ts.transpileModule(text.replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = vm.createContext(globals);
  vm.runInContext(compiled, context);
  return context;
}

function lifecycleFixture({ gotTheLock = true, platform = 'darwin' } = {}) {
  const { guard, calls } = fixture();
  const handlers = new Map();
  let ready;
  const app = {
    whenReady: () => new Promise((resolve) => { ready = resolve; }),
    setName: () => {},
    on: (name, handler) => handlers.set(name, handler),
    quit: () => calls.push('quit'),
  };
  let realtimeStopped = false;
  const context = runMainSection(source.slice(source.indexOf('app\n  .whenReady()')), {
    app, appSleepGuard: guard, gotTheLock, process: { platform }, console,
    applyDockIcon: () => {}, setupAppUpdater: () => {},
    ensureRealtimeSocket: async () => {}, scheduleRealtimeReconnect: () => {},
    ensureRemoteAdapter: async () => {}, runtimePaths: () => ({}),
    registerWebProtocol: () => {}, createWindow: () => calls.push('window'), stopDockAttention: () => {},
    BrowserWindow: { getAllWindows: () => [] },
    // 实时通道的收尾在 realtime-client.ts，这里只验证 before-quit 真的调到了它。
    stopRealtimeClient: () => { realtimeStopped = true; },
    stopLocalRuntime: async () => {}, stopRemoteAdapter: async () => {},
  });
  const quit = () => handlers.get('before-quit')({ preventDefault: () => calls.push('preventDefault') });
  return { context, calls, handlers, ready, quit, realtimeStopped: () => realtimeStopped };
}

test('app guard is idle before ready and start/stop are idempotent, including blocker id zero', () => {
  const { guard, calls } = fixture(0);
  guard.stop();
  assert.deepEqual(calls, []);
  guard.start();
  guard.start();
  assert.deepEqual(calls, ['start']);
  guard.stop();
  guard.stop();
  assert.deepEqual(calls, ['start', ['stop', 0]]);
});

test('main acquires on ready without tasks and keeps the blocker after macOS windows close', async () => {
  const { calls, handlers, ready, quit, realtimeStopped } = lifecycleFixture();
  assert.deepEqual(calls, []);
  ready();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['start', 'window']);
  handlers.get('window-all-closed')();
  handlers.get('activate')();
  assert.deepEqual(calls, ['start', 'window', 'window']);
  quit();
  quit();
  assert.deepEqual(calls, ['start', 'window', 'window', 'preventDefault', ['stop', 42]]);
  assert.equal(realtimeStopped(), true, 'quit must tear the realtime channel down');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.at(-1), 'quit');
  assert.match(source, /powerSaveBlocker\.start\('prevent-app-suspension'\)/);
  assert.equal((source.match(/appSleepGuard\.start\(\)/g) || []).length, 1);
  assert.equal((source.match(/appSleepGuard\.stop\(\)/g) || []).length, 1);
  assert.doesNotMatch(source, /syncTaskSleep|taskSleepGuard|prevent-display-sleep/);
});

test('secondary instances and quit-before-ready never acquire a blocker', async () => {
  const secondary = lifecycleFixture({ gotTheLock: false });
  secondary.ready();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(secondary.calls, []);
  const earlyQuit = lifecycleFixture();
  earlyQuit.quit();
  earlyQuit.ready();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(earlyQuit.calls, ['preventDefault', 'quit']);
});

test('non-macOS retains quit-on-last-window behavior', () => {
  const { calls, handlers } = lifecycleFixture({ platform: 'linux' });
  handlers.get('window-all-closed')();
  assert.deepEqual(calls, ['quit']);
});

test('scheduled queued, duplicate, parallel and completed streams never release the app blocker', () => {
  const { send, calls, activity, guard } = fixture();
  guard.start();
  send(runEvent('a', 'queued'));
  assert.equal(activity.size, 0);
  send(runEvent('a', 'running'));
  send(taskEvent('a'));
  send(taskEvent('b', 'llm_thinking_started'));
  assert.equal(activity.size, 2);
  send(taskEvent('a', 'run_finished'));
  send({ type: 'task.end', schedule_id: 'schedule', run_id: 'a' });
  send({ type: 'task.end', schedule_id: 'schedule', run_id: 'b' });
  assert.equal(activity.size, 0);
  assert.deepEqual(calls, ['start']);
});

test('failed, cancelled, skipped, interrupted and succeeded runs only clear task activity', () => {
  for (const status of ['failed', 'cancelled', 'skipped', 'interrupted', 'succeeded']) {
    const { send, calls, activity, guard } = fixture();
    guard.start();
    send(taskEvent('a'));
    send(runEvent('a', status));
    assert.equal(activity.size, 0, status);
    assert.deepEqual(calls, ['start'], status);
  }
});

test('pause/delete of definitions and approval waits preserve running activity', () => {
  const { send, calls, activity, guard } = fixture();
  guard.start();
  send(taskEvent('a'));
  for (const action of ['paused', 'deleted']) send({ type: 'schedule.event', event: { action, schedule_id: 'schedule' } });
  send(taskEvent('a', 'approval_requested'));
  assert.equal(activity.size, 1);
  send({ type: 'task.error', schedule_id: 'schedule', run_id: 'a' });
  assert.equal(activity.size, 0);
  assert.deepEqual(calls, ['start']);
});

test('snapshot reconciles missed starts and ends without changing the app blocker', () => {
  const { activity, calls, guard } = fixture();
  guard.start();
  activity.beginSnapshot().apply(['a', 'a']);
  assert.equal(activity.size, 1);
  const failed = activity.beginSnapshot();
  assert.throws(() => failed.apply(undefined), /invalid/);
  failed.cancel();
  assert.equal(activity.size, 1);
  activity.beginSnapshot().apply([]);
  assert.equal(activity.size, 0);
  assert.deepEqual(calls, ['start']);
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

test('main handles scheduled activity without renderer subscribers or changes to the app blocker', () => {
  const { activity, calls, guard } = fixture();
  guard.start();
  const forwarded = [];
  const handler = realtimeSource.slice(realtimeSource.indexOf('function handleRealtimeMessage('), realtimeSource.indexOf('async function ensureRealtimeSocket('));
  const context = runMainSection(handler, {
    scheduledTaskActivity: activity, appSleepGuard: guard,
    realtimeScheduleSubscribers: new Set(), realtimeTaskOwners: new Map(),
    realtimeApprovalSubscribers: new Set(), realtimeCommandWaiters: new Map(),
    sendToWebContents: (...args) => forwarded.push(args),
  });
  context.handleRealtimeMessage({ data: JSON.stringify(taskEvent('a')) });
  assert.equal(activity.size, 1);
  context.handleRealtimeMessage({ data: JSON.stringify({ type: 'task.end', schedule_id: 'schedule', run_id: 'a' }) });
  assert.equal(activity.size, 0);
  assert.deepEqual(calls, ['start']);
  assert.deepEqual(forwarded, []);
  const disconnect = realtimeSource.slice(realtimeSource.indexOf('function failRealtimeConnection('), realtimeSource.indexOf('function scheduleRealtimeReconnect('));
  assert.doesNotMatch(disconnect, /scheduledTaskActivity\.clear/);
  const reconnect = realtimeSource.slice(realtimeSource.indexOf('function scheduleRealtimeReconnect('), realtimeSource.indexOf('function handleRealtimeMessage('));
  assert.doesNotMatch(reconnect, /Subscribers\.size/);
  assert.match(realtimeSource, /setInterval\(\(\) => void refreshScheduleActivity\(\), 15_000\)/);
  assert.match(realtimeSource, /realtimeSocket !== socket/);
  assert.match(source.slice(source.indexOf('app\n  .whenReady()')), /ensureRealtimeSocket\(\)/);
  assert.match(source.slice(source.indexOf("app.on('before-quit'")), /stopRealtimeClient\(\)/);
  // 定时任务活动必须在退出时清空：清空写在 realtime-client 的 stopRealtimeClient 里。
  assert.match(
    realtimeSource.slice(realtimeSource.indexOf('export function stopRealtimeClient(')),
    /scheduledTaskActivity\.clear\(\)/,
  );
});

test('ordinary task completion and runtime disconnect leave the app blocker active', () => {
  const { guard, calls } = fixture();
  guard.start();
  const owners = new Map([['manual', { ownerId: 1, taskId: 'task-1' }]]);
  const messages = [];
  const context = runMainSection(realtimeSource.slice(realtimeSource.indexOf('function failRealtimeConnection('), realtimeSource.indexOf('async function ensureRealtimeSocket(')), {
    appSleepGuard: guard, scheduledTaskActivity: createScheduledTaskActivity(),
    realtimeTaskOwners: owners, realtimeCommandWaiters: new Map(),
    realtimeScheduleSubscribers: new Set(), realtimeApprovalSubscribers: new Set(),
    sendToWebContents: (...args) => messages.push(args), clearTimeout,
  });
  context.handleRealtimeMessage({ data: JSON.stringify({ type: 'task.end', request_id: 'manual' }) });
  assert.equal(owners.size, 0);
  // 断线不再把在跑的任务判死：既不合成 task.error 给渲染层，也不清空登记。
  // 任务在服务端继续跑，重连成功后由 task.attach 重新挂上（之前这里会把每一条
  // 在跑的流判成 503 失败，任务在用户眼里就是“失败了”）。
  owners.set('disconnected', { ownerId: 2, taskId: 'task-2' });
  context.failRealtimeConnection();
  assert.equal(owners.size, 1);
  assert.equal(messages.length, 1);
  assert.deepEqual(calls, ['start']);
});
