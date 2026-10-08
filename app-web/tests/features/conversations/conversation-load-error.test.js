import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';
import { conversationContentLoading } from '../../../src/features/chat/model/conversation-loading.js';

function createHarness() {
  let error = '';
  let sequence = 0;
  let requests = 0;
  let fetchDetail = async (id) => ({ conversation_id: id });
  const conversationIdRef = { current: 'previous' };
  const controllerRef = { current: null };
  const runtimes = new Map();
  const workspaceState = {
    projects: [{ id: 'p', conversations: ['a', 'b'].map((id) => ({ id, tasks: [] })) }],
  };
  const handlers = () => createConversationHandlers({
    conversationError: error,
    setConversationError: (value) => { error = value; },
    conversationIdRef,
    conversationDetailAbortRef: controllerRef,
    draftConversationRef: { current: null },
    workspaceState,
    setWorkspaceState: () => {},
    normalizeWorkspaceOrdering: (state) => state,
    findConversationById: (state, id) => state.projects[0].conversations.find((c) => c.id === id),
    getRuntime: (id) => runtimes.get(id),
    invalidateConversationActivation: () => ++sequence,
    isConversationActivationCurrent: (value) => value === sequence,
    activateConversationShell: (_project, id) => {
      conversationIdRef.current = id;
      if (!runtimes.has(id)) {
        runtimes.set(id, { shellSeeded: true, taskRuntimeState: { taskOrder: [], tasksById: {} } });
      }
    },
    activateConversationDetail: async (detail) => {
      runtimes.get(detail.conversation_id).shellSeeded = false;
    },
    fetchConversationDetail: (...args) => {
      requests += 1;
      return fetchDetail(...args);
    },
    dropMissingConversation: () => ({ wasSelected: false }),
  });
  return {
    select: (id) => handlers().handleSelectConversation('p', id),
    failWith: (failure) => { fetchDetail = async () => { throw failure; }; },
    respondWith: (fetcher) => { fetchDetail = fetcher; },
    error: () => error,
    requests: () => requests,
    runtime: (id) => runtimes.get(id),
    controller: () => controllerRef.current,
    loading: () => conversationContentLoading({
      shellSeeded: runtimes.get(conversationIdRef.current)?.shellSeeded,
      rowCount: 5,
      error,
    }),
  };
}

for (const failure of [
  Object.assign(new Error('conversation restore failed: 500'), { status: 500 }),
  new TypeError('Failed to fetch'),
  new SyntaxError('Invalid JSON'),
]) {
  test(`detail failure stops loading: ${failure.message}`, async () => {
    const h = createHarness();
    h.failWith(failure);
    const selection = h.select('a');
    assert.equal(h.loading(), true);
    await assert.rejects(selection, failure);
    assert.equal(h.error(), failure.message);
    assert.equal(h.loading(), false);
    assert.equal(h.runtime('a').shellSeeded, true, 'failure must not pretend history was hydrated');
    assert.equal(h.controller(), null);
  });
}

test('clicking the failed selection retries and clears its error before loading', async () => {
  const h = createHarness();
  h.failWith(new Error('failed'));
  await assert.rejects(h.select('a'), /failed/);
  h.respondWith(async (id) => ({ conversation_id: id }));
  const retry = h.select('a');
  assert.equal(h.error(), '');
  assert.equal(h.loading(), true);
  await retry;
  assert.equal(h.requests(), 2);
  assert.equal(h.loading(), false);
  assert.equal(h.runtime('a').shellSeeded, false);
  await h.select('a');
  assert.equal(h.requests(), 2, 'ready same-conversation clicks must remain no-ops');
});

test('switching to a cached conversation clears the previous error without refetching', async () => {
  const h = createHarness();
  await h.select('b');
  h.failWith(new Error('failed'));
  await assert.rejects(h.select('a'), /failed/);
  await h.select('b');
  assert.equal(h.error(), '');
  assert.equal(h.loading(), false);
  assert.equal(h.requests(), 2);
});

test('a late failure from an abandoned selection cannot mark the new conversation failed', async () => {
  const h = createHarness();
  let rejectOld;
  h.respondWith(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
  const oldSelection = h.select('a');
  h.respondWith(async (id) => ({ conversation_id: id }));
  await h.select('b');
  rejectOld(new Error('late failure'));
  await oldSelection;
  assert.equal(h.error(), '');
  assert.equal(h.loading(), false);
});

test('intentional cancellation does not become a conversation load error', async () => {
  const h = createHarness();
  h.failWith(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  await h.select('a');
  assert.equal(h.error(), '');
});

test('404 recovery is not reported as a conversation load failure', async () => {
  const h = createHarness();
  h.failWith(Object.assign(new Error('missing'), { status: 404 }));
  await h.select('a');
  assert.equal(h.error(), '');
});
