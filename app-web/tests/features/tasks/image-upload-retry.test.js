import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

globalThis.window = {};
const { createPendingTaskDraft } = await import('../../../src/features/tasks/model/task-runtime.js');
const { createConversationHandlers } = await import('../../../src/features/conversations/hooks/createConversationHandlers.js');

test('retry after image upload failure uploads again and starts the same conversation', async () => {
  const conversationId = 'existing-conversation';
  const imageFile = new File(['image'], 'test.png', { type: 'image/png' });
  const uploadedImage = { image_id: 'uploaded-image', path: 'test.png', mime: 'image/png' };
  const runtime = { taskRuntimeState: { tasksById: {}, taskOrder: [], pendingTask: null } };
  const uploads = [];
  const executions = [];
  const noop = () => {};
  const context = {
    createPendingTaskDraft,
    viewModeRef: { current: 'chat' },
    draftConversationRef: { current: null },
    conversationIdRef: { current: conversationId },
    selectedConversationId: conversationId,
    conversationReady: true,
    titleFromTaskText: () => '',
    findConversationById: () => ({ tasks: [] }),
    getRuntime: () => runtime,
    setComposerAttachment: noop,
    setWorkspaceState: noop,
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    setRuntimeBusy: (busy) => { runtime.busy = busy; },
    setRuntimeFetchController: (controller) => { runtime.fetchController = controller; },
    uploadChatImage: async (file, _signal, target) => {
      uploads.push({ file, target });
      if (uploads.length === 1) throw new Error('Image upload failed');
      return uploadedImage;
    },
    executeQuest: async (task, target) => { executions.push({ task, target }); },
    showToast: noop,
  };
  const deploy = createDeployHandlers(context);
  const request = deploy.buildDeployRequest('test message', null, 'model', 'high', [
    { file: imageFile, previewUrl: 'blob:test' },
  ], 'agent', 'provider');
  deploy.startDeploy(request, conversationId);
  await setImmediate();
  const failedTask = runtime.taskRuntimeState.pendingTask;
  assert.equal(failedTask.status, 'failed');
  assert.equal(runtime.busy, false);
  assert.equal(executions.length, 0);

  const { handleRetryTask } = createConversationHandlers({
    ...context,
    buildDeployRequest: deploy.buildDeployRequest,
    canStartDeployForConversation: deploy.canStartDeployForConversation,
    startDeploy: deploy.startDeploy,
    setViewMode: noop,
  });
  await handleRetryTask(failedTask);
  await setImmediate();
  assert.equal(uploads.length, 2, 'retry must upload the retained file again');
  assert.ok(uploads.every(({ file, target }) => file === imageFile && target === conversationId));
  assert.equal(executions.length, 1);
  assert.equal(executions[0].target, conversationId);
  assert.equal(executions[0].task.conversationId, conversationId);
  assert.deepEqual(executions[0].task.imageAttachments, [{ ...uploadedImage, previewUrl: 'blob:test' }]);
});
