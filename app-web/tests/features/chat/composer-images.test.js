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

test('one failed image upload is skipped without a duplicate frontend toast', async () => {
  const executions = [];
  const toasts = [];
  const runtime = { taskRuntimeState: { tasksById: {}, taskOrder: [] } };
  const bad = new Blob(['bad']);
  bad.name = 'bad.png';
  const good = new Blob(['good']);
  good.name = 'good.png';
  const handlers = createDeployHandlers({
    conversationIdRef: { current: 'conversation' }, selectedConversationId: 'conversation', conversationReady: true,
    draftConversationRef: { current: null }, viewModeRef: { current: 'chat' },
    getRuntime: () => runtime, isTaskActuallyActive: () => false,
    createPendingTaskDraft: (title, attachment, imageAttachments) => ({ id: 'pending', title, attachment, imageAttachments, status: 'queued' }),
    defaultAgentId: 'agent', titleFromTaskText: (value) => value,
    findConversationById: () => null, setComposerAttachment: () => {}, setWorkspaceState: () => {},
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    setRuntimeBusy: (busy) => { runtime.busy = busy; },
    setRuntimeFetchController: (controller) => { runtime.fetchController = controller; },
    uploadChatImage: async (input) => {
      if (input === bad) throw new Error('corrupt image');
      return { image_id: 'good', path: '/good.png', mime: 'image/png' };
    },
    executeQuest: async (task) => { executions.push(task); },
    showToast: (kind, message) => toasts.push([kind, message]),
  });

  assert.equal(handlers.handleDeploy('continue', null, 'model', 'high', [{ file: bad }, { file: good }], 'agent'), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(executions.length, 1);
  assert.deepEqual(executions[0].imageAttachments, [{ image_id: 'good', path: '/good.png', mime: 'image/png', previewUrl: null }]);
  assert.match(executions[0].requestText, /image could not be uploaded: bad\.png/);
  assert.match(executions[0].requestText, /continue with the remaining images and task/);
  assert.deepEqual(toasts, []);
});

test('composer uses scoped unlimited image storage and native Lexical undo history', () => {
  const panel = fs.readFileSync(new URL('../../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
  const composer = fs.readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
  const editor = fs.readFileSync(new URL('../../../src/features/chat/components/LexicalComposerInput.jsx', import.meta.url), 'utf8');
  assert.match(composer, /imageStoreRef\.get\(scopeId\)/);
  assert.match(composer, /imageStoreRef\.set\(scopeId, next\)/);
  assert.doesNotMatch(composer, /onUploadImage/);
  assert.match(composer, /key=\{scopeId\}/);
  assert.match(composer, /CHAT_IMAGE_MAX_BYTES = 20 \* 1024 \* 1024/);
  assert.doesNotMatch(composer, /CHAT_IMAGE_MAX_COUNT|Image limit reached/);
  assert.match(composer, /Unsupported image type\. Use PNG, JPEG, WebP, or GIF\./);
  // ChatPanel only passes storage into the shared composer; it does not duplicate image logic.
  assert.doesNotMatch(panel, /imageStoreRef|composerImages/);
  assert.match(panel, /imageStore=\{imageDrafts\}/);
  assert.match(editor, /<HistoryPlugin\s*\/>/);
});
