import test from 'node:test';
import assert from 'node:assert/strict';
import { BoundedCache } from '../../src/shared/lib/bounded-cache.js';
import { startPolling } from '../../src/shared/lib/polling.js';
import { appendStreamEvent } from '../../src/features/chat/model/stream-events.js';
import { workflowControlEvents } from '../../src/features/workflow/model/workflow-control-events.js';

globalThis.window = {};
const { evictInactiveRuntimes, releaseWorkspaceRuntimeDetails } = await import('../../src/features/conversations/model/runtime-cache.js');
const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');

test('streamed text and reasoning reuse historical timeline items without replaying events', () => {
  for (const type of ['llm_answer_delta', 'llm_thinking_delta']) {
    let reads = 0;
    const historical = { get type() { reads += 1; return 'agent_progress_delta'; }, message: 'Earlier progress' };
    let task = { status: 'running', toolCalls: [], eventLog: [historical, { type, delta: 'Hello ' }] };
    let timeline = buildChatTimeline(task);
    const original = timeline;
    reads = 0;
    for (let i = 0; i < 20; i += 1) {
      task = { ...task, eventLog: appendStreamEvent(task.eventLog, { type, delta: `${i} ` }) };
      timeline = buildChatTimeline(task);
      assert.equal(timeline.items[0], original.items[0]);
    }
    assert.equal(reads, 0, 'old events must not be read for merged text deltas');
    assert.match(timeline.items.at(-1).text, /18 19/);
    assert.equal(original.items.at(-1).text.trim(), 'Hello', 'previous React props remain immutable');
    const replay = buildChatTimeline({ ...task, eventLog: task.eventLog.slice() });
    assert.deepEqual(timeline, replay);
    assert.deepEqual(buildChatTimeline({ ...task, status: 'done' }), buildChatTimeline({ ...task, status: 'done', eventLog: task.eventLog.slice() }));
  }
});

test('workflow status inputs remain stable through text deltas, but update on transitions', () => {
  let events = [{ type: 'workflow_node_started', nodeId: 'a' }];
  const controls = workflowControlEvents(events);
  events = appendStreamEvent(events, { type: 'llm_answer_delta', delta: 'a' });
  assert.equal(workflowControlEvents(events), controls);
  events = appendStreamEvent(events, { type: 'llm_answer_delta', delta: 'b' });
  assert.equal(workflowControlEvents(events), controls);
  events = appendStreamEvent(events, { type: 'workflow_edge_selected', fromNodeId: 'a', toNodeId: 'b' });
  assert.equal(workflowControlEvents(events).length, 2);
});

test('reloadable caches evict least recently used values and active runtimes survive', () => {
  const cache = new BoundedCache(2);
  cache.set('a', 1).set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  assert.equal(cache.has('b'), false);
  assert.equal(cache.size, 2);
  const runtime = (lastAccessedAt, status = 'done') => ({ lastAccessedAt, taskRuntimeState: { tasksById: { task: { status } } } });
  const runtimes = new Map([['current', runtime(0)], ['active', runtime(0, 'running')], ['old', runtime(1)], ['recent', runtime(2)]]);
  const evicted = evictInactiveRuntimes(runtimes, 'current', 1);
  assert.deepEqual([...evicted], ['old']);
  assert.equal(runtimes.has('active'), true);
  const state = { projects: [{ conversations: [{ id: 'old', tasks: [{ taskId: 't', status: 'done', eventLog: ['large history'], answerText: 'large answer' }] }] }] };
  const compact = releaseWorkspaceRuntimeDetails(state, evicted);
  assert.equal(compact.projects[0].conversations[0].tasks[0].eventLog, undefined);
  assert.equal(compact.projects[0].conversations[0].tasks[0].runtimeHydrated, false);
  assert.deepEqual(state.projects[0].conversations[0].tasks[0].eventLog, ['large history']);
});

test('polling waits for requests, backs off failures, slows when hidden and resumes on focus', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  let resolve;
  let calls = 0;
  let fail = false;
  const stop = startPolling(() => {
    calls += 1;
    if (fail) return Promise.reject(new Error('offline'));
    return new Promise((done) => { resolve = done; });
  }, { interval: 100, hiddenInterval: 1000 });
  try {
    t.mock.timers.tick(500);
    assert.equal(calls, 1);
    resolve();
    await Promise.resolve();
    fail = true;
    t.mock.timers.tick(100);
    await Promise.resolve();
    assert.equal(calls, 2);
    t.mock.timers.tick(199);
    assert.equal(calls, 2);
    fail = false;
    globalThis.document.hidden = true;
    t.mock.timers.tick(1);
    resolve();
    await Promise.resolve();
    t.mock.timers.tick(999);
    assert.equal(calls, 3);
    globalThis.document.hidden = false;
    globalThis.window.dispatchEvent(new Event('focus'));
    assert.equal(calls, 4);
    stop();
    resolve();
    await Promise.resolve();
    t.mock.timers.tick(10000);
    assert.equal(calls, 4);
  } finally {
    stop();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
