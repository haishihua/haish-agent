import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

const code = transformSync(readFileSync(new URL('../../src/main/realtime-client.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness() {
  const sockets = [], deliveries = [], timers = new Map(), warnings = [];
  let id = 0;
  class Socket {
    static OPEN = 1;
    readyState = 0;
    listeners = {};
    sent = [];
    constructor() { sockets.push(this); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    open() { this.readyState = 1; this.listeners.open(); }
    close() { this.readyState = 3; this.listeners.close(); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    reply(command, result, ok = true) { this.listeners.message({ data: JSON.stringify({ type: 'command.result', request_id: command.request_id, ok, result, detail: 'unavailable' }) }); }
    approvals() { return this.sent.filter(x => x.type === 'approval.snapshot'); }
  }
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, WebSocket: Socket,
    console: { warn: (...args) => warnings.push(args) },
    setTimeout: (fn, ms) => { const key = ++id; timers.set(key, { fn, ms }); return key; },
    clearTimeout: key => timers.delete(key), setInterval: () => ++id, clearInterval() {},
    require(name) {
      if (name === 'electron') return { BrowserWindow: { getAllWindows: () => [1, 2].map(owner => ({ webContents: { id: owner, isDestroyed: () => false, send: (channel, payload) => deliveries.push({ owner, channel, payload }) } })) } };
      if (name === 'node:crypto') return { randomUUID: () => `request-${++id}` };
      if (name === './scheduled-task-activity.js') return { createScheduledTaskActivity: () => ({ handle() {}, clear() {}, beginSnapshot: () => ({ apply() {}, cancel() {} }) }) };
      throw new Error(name);
    },
  });
  const api = module.exports;
  api.configureRealtimeClient({ runtimeBaseUrl: async () => 'http://localhost', isRuntimeStopping: () => false });
  return { api, sockets, deliveries, timers, warnings, async connect() { const pending = api.ensureRealtimeSocket(); await flush(); sockets.at(-1).open(); await pending; await flush(); return sockets.at(-1); }, async tick(ms) { const due = [...timers].filter(([, timer]) => timer.ms === ms); for (const [key, timer] of due) { timers.delete(key); timer.fn(); } await flush(); } };
}

test('initial subscribe then refresh then connect sends and delivers exactly one snapshot', async () => {
  const h = harness();
  h.api.addApprovalSubscriber(1);
  const pending = h.api.refreshApprovalSnapshot(1);
  const socket = await h.connect();
  assert.equal(socket.approvals().length, 1);
  socket.reply(socket.approvals()[0], { state: { pending: [] } });
  await pending; await flush(); await h.tick(1000);
  assert.equal(socket.approvals().length, 1);
  assert.equal(h.deliveries.length, 1);
});

test('concurrent refresh failure and subsequent concurrent success leave no redundant retry', async () => {
  const h = harness();
  const socket = await h.connect();
  h.api.addApprovalSubscriber(1);
  const first = h.api.refreshApprovalSnapshot(1);
  const joined = h.api.refreshApprovalSnapshot(1);
  assert.equal(first, joined);
  const failed = Promise.allSettled([first, joined]);
  await flush();
  assert.equal(socket.approvals().length, 1);
  socket.reply(socket.approvals()[0], {}, false);
  assert.deepEqual((await failed).map(x => x.status), ['rejected', 'rejected']);
  assert.equal([...h.timers.values()].filter(x => x.ms === 1000).length, 1);
  const next = h.api.refreshApprovalSnapshot(1);
  assert.equal(next, h.api.refreshApprovalSnapshot(1));
  await flush();
  socket.reply(socket.approvals()[1], { state: { pending: ['current'] } });
  await next; await h.tick(1000);
  assert.equal(socket.approvals().length, 2);
  assert.equal(h.deliveries.length, 1);
  assert.equal([...h.timers.values()].filter(x => x.ms === 1000).length, 0);
});

test('disconnect invalidates pending refresh and reconnect does not lose recovery', async () => {
  const h = harness(); h.api.addApprovalSubscriber(1);
  const first = await h.connect();
  const pending = h.api.refreshApprovalSnapshot(1).catch(() => {});
  first.close();
  await pending; await h.tick(1000);
  const second = h.sockets.at(-1); second.open(); await flush();
  assert.equal(second.approvals().length, 1);
  first.reply(first.approvals()[0], { state: { pending: ['stale'] } });
  second.reply(second.approvals()[0], { state: { pending: ['fresh'] } });
  await flush(); await h.tick(1000);
  assert.equal(h.deliveries.length, 1);
  assert.equal(h.deliveries[0].payload.state.pending[0], 'fresh');
  assert.equal(second.approvals().length, 1);
});

test('open resolves without awaiting approval; reconnect snapshot recovers approvals created/resolved offline', async () => {
  const h = harness();
  h.api.addApprovalSubscriber(1);
  const first = await h.connect();
  assert.equal(first.approvals().length, 1);
  first.reply(first.approvals()[0], { state: { pending: ['old'] } });
  await flush();
  first.close();
  await h.tick(1000);
  const second = h.sockets.at(-1);
  second.open();
  await flush();
  assert.equal(second.approvals().length, 1);
  second.reply(second.approvals()[0], { state: { pending: ['created-offline'], resolved: ['old'] } });
  await flush();
  assert.equal(h.deliveries.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.deliveries.at(-1).payload)), { type: 'approval_snapshot', state: { pending: ['created-offline'], resolved: ['old'] } });
});

test('failed snapshot retries on the same socket and malformed snapshots also recover', async () => {
  const h = harness(); h.api.addApprovalSubscriber(1);
  const socket = await h.connect();
  socket.reply(socket.approvals()[0], {}, false); await flush();
  assert.equal(h.warnings.length, 1);
  await h.tick(1000);
  socket.reply(socket.approvals()[1], { state: null }); await flush();
  await h.tick(1000);
  socket.reply(socket.approvals()[2], { state: { pending: [] } }); await flush();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.deliveries.length, 1);
  assert.equal([...h.timers.values()].filter(x => x.ms === 1000).length, 0);
});

test('unsubscribe suppresses pending snapshot and events, including a re-used owner id', async () => {
  const h = harness(); h.api.addApprovalSubscriber(1); h.api.addApprovalSubscriber(2);
  const socket = await h.connect();
  h.api.removeApprovalSubscriber(1); h.api.addApprovalSubscriber(1);
  h.api.removeApprovalSubscriber(2);
  for (const command of socket.approvals()) socket.reply(command, { state: {} });
  await flush(); assert.equal(h.deliveries.length, 0);
  socket.listeners.message({ data: JSON.stringify({ type: 'approval.event', event: { type: 'changed' } }) });
  assert.deepEqual(h.deliveries.map(x => x.owner), [1]);
});

test('timeouts retry; unsubscribe and stop cancel approval retries', async () => {
  const h = harness(); h.api.addApprovalSubscriber(1);
  const socket = await h.connect();
  await h.tick(10000); await h.tick(1000);
  assert.equal(socket.approvals().length, 2);
  socket.reply(socket.approvals()[1], {}, false); await flush();
  h.api.removeApprovalSubscriber(1); await h.tick(1000);
  assert.equal(socket.approvals().length, 2);
  h.api.addApprovalSubscriber(1);
  const pending = h.api.refreshApprovalSnapshot(1).catch(() => {}); await flush();
  socket.reply(socket.approvals()[2], {}, false); await pending;
  h.api.stopRealtimeClient();
  assert.equal([...h.timers.values()].filter(x => x.ms === 1000).length, 1); // existing transport reconnect only
});
