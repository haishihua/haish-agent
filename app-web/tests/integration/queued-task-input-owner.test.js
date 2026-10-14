import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeployHandlers } from '../../src/features/tasks/hooks/createDeployHandlers.js';
import { createDraftConversationHandlers } from '../../src/features/conversations/hooks/createDraftConversationHandlers.js';
import { normalizeRuntimeEvents, runtimeEventToLog } from '../../src/features/tasks/model/runtime-events.js';

globalThis.window = { HAISH_API_BASE: '', haish: {} };
const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const image = { image_id: 'image', path: '/images/image.png', mime: 'image/png' };
const input = { input_id: 'input', message: 'steer', image_attachments: [image] };
const queued = {
  event_id: 'queued', type: 'task_input_queued', task_id: 'task-a', conversation_id: 'a',
  created_at: '2026-10-13T00:00:00Z', payload: input,
};
const applied = {
  event_id: 'applied', type: 'task_input_applied', task_id: 'task-a', conversation_id: 'a',
  payload: { inputs: [input] },
};
const log = (event) => runtimeEventToLog(normalizeRuntimeEvents([event])[0]);

function harness() {
  const conversationIdRef = { current: 'a' };
  const taskA = { taskId: 'task-a', status: 'running', eventLog: [], title: 'initial' };
  const taskB = { taskId: 'task-b', status: 'running', eventLog: [], title: 'other' };
  const runtimes = new Map([
    ['a', { busy: true, activeTaskId: 'task-a', taskRuntimeState: { activeTaskId: 'task-a', tasksById: { 'task-a': taskA } } }],
    ['b', { busy: true, activeTaskId: 'task-b', taskRuntimeState: { activeTaskId: 'task-b', tasksById: { 'task-b': taskB } } }],
  ]);
  const post = deferred();
  const upload = deferred();
  const requests = [];
  const uploads = [];
  const writes = [];
  const drafts = createDraftConversationHandlers({
    API_BASE: 'http://runtime', conversationIdRef, buildApiHeaders: () => ({}),
    apiFetch: (url, options) => { requests.push({ url, options }); return post.promise; },
    updateTaskRuntimeState: (update, owner = conversationIdRef.current) => {
      writes.push(owner);
      const runtime = runtimes.get(owner);
      runtime.taskRuntimeState = update(runtime.taskRuntimeState);
    },
  });
  const deploy = createDeployHandlers({
    conversationIdRef, conversationId: 'a', selectedConversationId: 'a', conversationReady: true,
    draftConversationRef: { current: null }, viewModeRef: { current: 'chat' },
    getRuntime: (id) => runtimes.get(id), queueTaskInput: drafts.queueTaskInput,
    uploadChatImage: (file, signal, owner) => { uploads.push({ file, signal, owner }); return upload.promise; },
    showToast: () => {},
  });
  const append = (event) => {
    const state = runtimes.get('a').taskRuntimeState;
    state.tasksById['task-a'] = { ...state.tasksById['task-a'], eventLog: [...state.tasksById['task-a'].eventLog, log(event)] };
  };
  const resolvePost = (event = queued) => post.resolve({ ok: true, json: async () => ({ input_id: 'input', event }) });
  const inputs = () => buildChatTimeline(runtimes.get('a').taskRuntimeState.tasksById['task-a'], 'running').items
    .filter((item) => item.kind === 'user_input');
  return { drafts, deploy, conversationIdRef, runtimes, post, upload, requests, uploads, writes, append, resolvePost, inputs, taskB };
}

test('a late steering POST echoes in A after navigation to B, then applied SSE flips that same row', async () => {
  const h = harness();
  const sending = h.deploy.handleDeploy('steer');
  await tick();
  assert.equal(h.requests[0].url, 'http://runtime/api/tasks/task-a/inputs');
  h.conversationIdRef.current = 'b';
  h.resolvePost();
  assert.equal(await sending, true);
  assert.deepEqual(h.writes, ['a']);
  assert.equal(h.inputs().length, 1);
  assert.equal(h.inputs()[0].status, 'pending');
  h.append(applied);
  assert.equal(h.inputs().length, 1);
  assert.equal(h.inputs()[0].status, 'applied');
  assert.equal(h.runtimes.get('b').taskRuntimeState.tasksById['task-b'], h.taskB);
});

for (const earlyEvent of [queued, applied]) {
  test(`${earlyEvent.type} arriving before the POST response does not duplicate the instruction`, async () => {
    const h = harness();
    const sending = h.deploy.handleDeploy('steer');
    await tick();
    h.conversationIdRef.current = 'b';
    h.append(earlyEvent);
    h.resolvePost();
    assert.equal(await sending, true);
    assert.equal(h.inputs().length, 1);
    assert.equal(h.inputs()[0].status, earlyEvent === applied ? 'applied' : 'pending');
    assert.equal(h.runtimes.get('a').taskRuntimeState.tasksById['task-a'].eventLog.length, 1);
  });
}

test('navigation while image upload is pending retains A ownership through upload, POST and echo', async () => {
  const h = harness();
  const file = { name: 'image.png' };
  const sending = h.deploy.handleDeploy('steer', null, null, null, [{ file, previewUrl: 'blob:image' }]);
  assert.equal(h.uploads[0].owner, 'a');
  h.conversationIdRef.current = 'b';
  h.upload.resolve(image);
  await tick();
  assert.equal(h.requests[0].url, 'http://runtime/api/tasks/task-a/inputs');
  assert.deepEqual(JSON.parse(h.requests[0].options.body).image_attachments, [image]);
  h.resolvePost();
  assert.equal(await sending, true);
  assert.deepEqual(h.writes, ['a']);
  assert.equal(h.inputs().length, 1);
  assert.equal(h.inputs()[0].images[0].previewUrl, 'blob:image');
  h.append(applied);
  assert.equal(h.inputs().length, 1);
  assert.equal(h.inputs()[0].status, 'applied');
});

test('repeated identical steering messages with distinct input identities remain distinct', async () => {
  const h = harness();
  h.append(queued);
  const sending = h.drafts.queueTaskInput('task-a', 'steer', [], 'steer', 'a');
  h.resolvePost({ ...queued, event_id: 'queued-2', payload: { ...input, input_id: 'input-2' } });
  await sending;
  assert.deepEqual(h.inputs().map((item) => item.id), ['input', 'input-2']);
});

test('steering requires an owner and rejects mismatched response ownership before writing', async () => {
  const h = harness();
  await assert.rejects(h.drafts.queueTaskInput('task-a', 'steer'), /conversation owner/);
  assert.equal(h.requests.length, 0);
  const sending = h.drafts.queueTaskInput('task-a', 'steer', [], 'steer', 'a');
  const rejected = assert.rejects(sending, /different conversation owner/);
  h.resolvePost({ ...queued, conversation_id: 'b' });
  await rejected;
  assert.deepEqual(h.writes, []);
});
