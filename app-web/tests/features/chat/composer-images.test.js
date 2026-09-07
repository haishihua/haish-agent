import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createComposerHandlers } from '../../../src/features/chat/hooks/createComposerHandlers.js';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

test('image upload never creates a server conversation for a draft', async () => {
  const handlers = createComposerHandlers({
    conversationIdRef: { current: 'draft-local' },
    ensureServerConversationForActiveDraft: () => assert.fail('must not materialize before send'),
    apiFetch: () => assert.fail('must not upload into local draft'),
  });
  await assert.rejects(handlers.uploadChatImage(new Blob(['image'])), /No active conversation/);
});

test('image files upload on send into the captured conversation before task execution', async () => {
  const events = [];
  const conversationIdRef = { current: 'original' };
  const runtime = { taskRuntimeState: { tasksById: {}, taskOrder: [] } };
  const file = new Blob(['image']);
  const handlers = createDeployHandlers({
    conversationIdRef, selectedConversationId: 'original', conversationReady: true,
    draftConversationRef: { current: null }, viewModeRef: { current: 'chat' },
    getRuntime: () => runtime,
    isTaskActuallyActive: () => false,
    createPendingTaskDraft: (title, attachment, imageAttachments) => ({ id: 'pending', title, attachment, imageAttachments, status: 'queued' }),
    defaultAgentId: 'agent', titleFromTaskText: (value) => value,
    findConversationById: () => null,
    setComposerAttachment: () => {}, setWorkspaceState: () => {},
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    setRuntimeBusy: (busy) => { runtime.busy = busy; },
    setRuntimeFetchController: (controller) => { runtime.fetchController = controller; },
    uploadChatImage: async (input, _signal, target) => {
      events.push(['upload', input, target]);
      return { image_id: 'image', path: '/image.png', mime: 'image/png' };
    },
    executeQuest: async (task, target) => { events.push(['execute', task.imageAttachments, target]); },
    showToast: () => assert.fail('unexpected error'),
  });
  assert.equal(handlers.handleDeploy('hello', null, 'model', 'high', [{ file, previewUrl: 'blob:preview' }], 'agent'), true);
  conversationIdRef.current = 'other';
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [
    ['upload', file, 'original'],
    ['execute', [{ image_id: 'image', path: '/image.png', mime: 'image/png', previewUrl: 'blob:preview' }], 'original'],
  ]);
});

test('composer uses scoped image storage and native Lexical undo history', () => {
  const panel = fs.readFileSync(new URL('../../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
  const editor = fs.readFileSync(new URL('../../../src/features/chat/components/LexicalComposerInput.jsx', import.meta.url), 'utf8');
  assert.match(panel, /imageStore\.get\(composerScopeId\)/);
  assert.match(panel, /imageStore\.set\(composerScopeId, next\)/);
  assert.doesNotMatch(panel, /onUploadImage/);
  assert.match(panel, /key=\{composerScopeId\}/);
  assert.match(editor, /<HistoryPlugin\s*\/>/);
});
