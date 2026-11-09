// 「这个 id 还是本地草稿」的判据只有 model/local-draft-conversation.js 一份。
// 这两种情况必须同时成立，否则上传会发到不存在的会话、或者把已经落地的会话挡掉：
// 1. 切走 / 草稿记录已清空，conversationIdRef 里还留着旧草稿 id → 必须拦住；
// 2. 草稿已经 materialize 成真会话（草稿记录的 id 就是服务端 id）→ 必须放行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalDraftConversationId } from '../../../src/features/chat/model/local-draft-conversation.js';
import { createComposerHandlers } from '../../../src/features/chat/hooks/createComposerHandlers.js';

function createHarness({ conversationId, draftId, isDraftConversationId }) {
  const requests = [];
  const handlers = createComposerHandlers({
    API_BASE: '',
    applyConversationSnapshot: () => {},
    apiFetch: async (url, options = {}) => {
      const target = options.body?.get?.('conversation_id');
      requests.push({ url: String(url), conversationId: target });
      return {
        ok: true,
        status: 200,
        json: async () => ({ attachment: { file_name: 'plan.md', conversation_id: target }, conversation: null }),
      };
    },
    conversationActivationSeqRef: { current: 0 },
    conversationId,
    conversationIdRef: { current: conversationId },
    draftConversationRef: { current: draftId ? { id: draftId } : null },
    ensureServerConversationForActiveDraft: async () => null,
    getRuntime: () => null,
    isDraftConversationId,
    markDraftConversationKept: () => {},
    mutateRuntime: () => {},
    setComposerAttachment: () => {},
    setRuntimeFetchController: () => {},
    setUploadState: () => {},
    showToast: () => {},
    viewMode: 'chat',
    viewModeRef: { current: 'chat' },
  });
  return { handlers, requests };
}

test('only ids minted as local drafts count as local drafts', () => {
  for (const id of ['draft-abc', 'draft-hex1', 'draft-']) assert.equal(isLocalDraftConversationId(id), true, id);
  for (const id of ['', null, undefined, 0, false, 'server-1', 'conversation-42', 'Draft-abc', 123]) {
    assert.equal(isLocalDraftConversationId(id), false, String(id));
  }
});

test('草稿记录已清空、id 还留在引用里：不往这个不存在的会话上传', async () => {
  const { handlers, requests } = createHarness({
    conversationId: 'draft-stale',
    draftId: null,
    // 身份判据这时候已经说不清（它只认当前那条草稿记录），拦住上传的必须是 id 形态。
    isDraftConversationId: () => false,
  });
  await handlers.handleAttachmentSelect(new Blob(['doc']), 'agent-1', 'chat');
  assert.deepEqual(requests, []);
});

test('已经 materialize 成真会话的草稿照常上传（身份判据在这里会误判成草稿）', async () => {
  const { handlers, requests } = createHarness({
    conversationId: 'server-1',
    draftId: 'server-1',
    isDraftConversationId: (id) => id === 'server-1',
  });
  await handlers.handleAttachmentSelect(new Blob(['doc']), 'agent-1', 'chat');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].conversationId, 'server-1');
});
