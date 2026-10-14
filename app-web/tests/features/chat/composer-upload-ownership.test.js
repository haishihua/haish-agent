import test from 'node:test';
import assert from 'node:assert/strict';
import { createComposerHandlers } from '../../../src/features/chat/hooks/createComposerHandlers.js';
import { createConversationRuntime } from '../../../src/features/conversations/hooks/createConversationRuntime.js';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

function harness() {
  const runtimes = new Map();
  const state = { attachment: null, upload: null, toasts: [], snapshots: [] };
  const requests = [];
  const conversationIdRef = { current: 'a' };
  const conversationActivationSeqRef = { current: 0 };
  const ctx = {
    API_BASE: '', conversationActivationSeqRef, conversationIdRef, draftConversationRef: { current: null }, viewModeRef: { current: 'chat' },
    runtimesRef: { current: runtimes }, streamTargetConvIdRef: { current: null },
    taskImageAttachmentsRef: { current: new Map() },
    createEmptyTaskRuntimeState: () => ({ tasksById: {}, taskOrder: [], activeTaskId: null, pendingTask: null }),
    setBusy: () => {}, setShellSeeded: () => {}, setTaskRuntimeState: () => {}, setWorkspaceState: () => {},
    normalizeWorkspaceOrdering: (value) => value, notifyTaskComplete: () => {},
    userCancelledTaskIdsRef: { current: new Set() }, chatFinalizedTaskIdsRef: { current: new Set() },
    isTaskActuallyActive: () => false,
    cancelActiveConversationTask: async (id) => Response.json({ cancelled: false, conversation_id: id }),
    recoverConversationTasks: async () => {},
    setComposerAttachment: (value) => { state.attachment = value; },
    setUploadState: (value) => { state.upload = value; },
    showToast: (...toast) => state.toasts.push(toast),
    applyConversationSnapshot: (value) => state.snapshots.push(value),
    apiFetch: (_url, { signal, body }) => new Promise((resolve, reject) => {
      requests.push({ signal, body, resolve: (name) => resolve({ ok: true, json: async () => ({
        attachment: { file_name: name, document_id: name }, conversation: { conversation_id: body.get('conversation_id') },
      }) }), reject });
    }),
  };
  const { showToast } = ctx;
  Object.assign(ctx, createConversationRuntime(ctx), { showToast });
  const getRuntime = (id) => ctx.getRuntime(id, { create: true });
  const stop = () => createDeployHandlers(ctx).handleStop();
  // Production recreates the factory on render. Display ownership persists in
  // the real runtime independently of Stop's transport-controller slot.
  const select = (name) => {
    const file = new Blob([name], { type: 'text/plain' }); file.name = name;
    return createComposerHandlers(ctx).handleAttachmentSelect(file, 'agent');
  };
  const switchTo = (id) => {
    conversationIdRef.current = id;
    conversationActivationSeqRef.current += 1;
    state.attachment = null; state.upload = { active: false, fileName: '' };
  };
  return { state, requests, select, switchTo, getRuntime, stop };
}

for (const failure of [false, true]) {
  test(`A settling ${failure ? 'with an error' : 'successfully'} cannot clear or replace B's upload`, async () => {
    const h = harness();
    const a = h.select('a.txt'); const resultA = a.catch((error) => error);
    const controllerA = h.getRuntime('a').fetchController;
    h.switchTo('b'); const b = h.select('b.txt');
    const controllerB = h.getRuntime('b').fetchController;
    if (failure) h.requests[0].reject(new Error('failed A')); else h.requests[0].resolve('old A');
    await resultA;
    assert.equal(h.state.attachment.name, 'b.txt');
    assert.deepEqual(h.state.upload, { active: true, fileName: 'b.txt' });
    assert.deepEqual(h.state.toasts, []); assert.deepEqual(h.state.snapshots, []);
    assert.equal(h.getRuntime('a').fetchController, null, 'old request releases its own runtime');
    assert.equal(controllerA.signal.aborted, false);
    assert.equal(h.getRuntime('b').fetchController, controllerB);
    h.requests[1].resolve('new B'); await b;
    assert.equal(h.state.attachment.name, 'new B');
    assert.equal(h.state.attachment.uploaded, true);
    assert.deepEqual(h.state.upload, { active: false, fileName: '' });
  });
}

for (const roundTrip of [false, true]) {
  for (const failure of [false, true]) {
    test(`${roundTrip ? 'A → B → A' : 'same-owner replacement'} rejects old ${failure ? 'error' : 'result'} and cleanup`, async () => {
      const h = harness(); const old = h.select('old.txt').catch((error) => error);
      if (roundTrip) { h.switchTo('b'); h.switchTo('a'); }
      const next = h.select('new.txt'); const controller = h.getRuntime('a').fetchController;
      if (failure) h.requests[0].reject(new Error('old failure')); else h.requests[0].resolve('old result');
      await old;
      assert.equal(h.getRuntime('a').fetchController, controller);
      assert.equal(h.state.attachment.name, 'new.txt');
      assert.deepEqual(h.state.upload, { active: true, fileName: 'new.txt' });
      assert.deepEqual(h.state.toasts, []); assert.deepEqual(h.state.snapshots, []);
      h.requests[1].resolve('new result'); await next;
      assert.equal(h.state.attachment.name, 'new result');
      assert.equal(h.state.toasts.length, 1); assert.equal(h.state.snapshots.length, 1);
    });
  }
}

for (const settle of ['resolve', 'AbortError', 'error']) {
  test(`an aborted upload ${settle} never applies a result or failure toast, but releases its own chrome`, async () => {
    const h = harness(); const request = h.select('aborted.txt').catch((error) => error);
    h.getRuntime('a').fetchController.abort();
    if (settle === 'resolve') h.requests[0].resolve('late success');
    else h.requests[0].reject(Object.assign(new Error('cancelled'), { name: settle }));
    await request;
    assert.equal(h.state.attachment, null);
    assert.deepEqual(h.state.toasts, []); assert.deepEqual(h.state.snapshots, []);
    assert.deepEqual(h.state.upload, { active: false, fileName: '' });
    assert.equal(h.getRuntime('a').fetchController, null);
  });
}

test('an aborted old upload cannot clean a new controller or attachment', async () => {
  const h = harness(); const old = h.select('old.txt').catch((error) => error);
  h.getRuntime('a').fetchController.abort();
  h.getRuntime('a').abortRequested = true;
  const current = h.select('new.txt'); const controller = h.getRuntime('a').fetchController;
  h.requests[0].reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); await old;
  assert.equal(h.getRuntime('a').fetchController, controller);
  assert.equal(h.state.attachment.name, 'new.txt');
  assert.equal(h.state.upload.active, true);
  assert.deepEqual(h.state.toasts, []);
  h.requests[1].resolve('new.txt'); await current;
});

test('A → B → A without a replacement upload still cannot revive the discarded attachment', async () => {
  const h = harness(); const request = h.select('old.txt');
  h.switchTo('b'); h.switchTo('a');
  h.requests[0].resolve('discarded result'); await request;
  assert.equal(h.state.attachment, null);
  assert.deepEqual(h.state.upload, { active: false, fileName: '' });
  assert.deepEqual(h.state.toasts, []); assert.deepEqual(h.state.snapshots, []);
  assert.equal(h.getRuntime('a').fetchController, null);
});

for (const settle of ['resolve', 'AbortError', 'error']) {
  test(`real runtime + deploy Stop clears the transport slot, then ${settle} releases upload UI`, async () => {
    const h = harness();
    const request = h.select('stopped.txt').catch((error) => error);
    const controller = h.getRuntime('a').fetchController;
    h.stop();
    assert.equal(controller.signal.aborted, true);
    assert.equal(h.getRuntime('a').fetchController, null, 'actual Stop synchronously clears this slot');
    assert.equal(h.getRuntime('a').composerUploadController, controller, 'display owner survives transport release');
    if (settle === 'resolve') h.requests[0].resolve('late success');
    else h.requests[0].reject(Object.assign(new Error('stopped'), { name: settle }));
    await request;
    await h.getRuntime('a').stopPromise;
    assert.equal(h.state.attachment, null);
    assert.deepEqual(h.state.upload, { active: false, fileName: '' });
    assert.deepEqual(h.state.toasts, []); assert.deepEqual(h.state.snapshots, []);
    assert.equal(h.getRuntime('a').composerUploadController, null);
  });
}

for (const navigation of ['same conversation', 'A → B', 'A → B → A']) {
  test(`real Stop's late abort cannot overwrite a new upload after ${navigation}`, async () => {
    const h = harness();
    const old = h.select('old.txt').catch((error) => error);
    h.stop();
    await h.getRuntime('a').stopPromise;
    if (navigation !== 'same conversation') h.switchTo('b');
    if (navigation === 'A → B → A') h.switchTo('a');
    const currentId = navigation === 'A → B' ? 'b' : 'a';
    const next = h.select('new.txt');
    const controller = h.getRuntime(currentId).fetchController;
    h.requests[0].reject(Object.assign(new Error('late abort'), { name: 'AbortError' }));
    await old;
    assert.equal(h.state.attachment.name, 'new.txt');
    assert.deepEqual(h.state.upload, { active: true, fileName: 'new.txt' });
    assert.equal(h.getRuntime(currentId).fetchController, controller);
    assert.deepEqual(h.state.toasts, []); assert.deepEqual(h.state.snapshots, []);
    h.requests[1].resolve('new.txt'); await next;
    assert.equal(h.state.attachment.uploaded, true);
    assert.equal(h.state.upload.active, false);
  });
}

test('current non-abort failure clears the attachment, reports once and releases the controller', async () => {
  const h = harness(); const request = h.select('bad.txt');
  h.requests[0].reject(new Error('bad document'));
  await assert.rejects(request, /bad document/);
  assert.equal(h.state.attachment, null);
  assert.deepEqual(h.state.toasts, [['error', 'upload failed: bad.txt']]);
  assert.equal(h.state.upload.active, false);
  assert.equal(h.getRuntime('a').fetchController, null);
});
