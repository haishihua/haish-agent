import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.window = {};
const { isPendingTaskId, buildTaskRuntimeRecord } = await import('../../../src/features/tasks/model/task-runtime.js');
const shell = fs.readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const removeSource = shell.slice(shell.indexOf('  function removeMissingTask('), shell.indexOf('  const panelWorkspaceState'));

test('a late 404 cannot discard the uploading draft before its server task arrives', () => {
  const images = [{ image_id: 'image', path: '/test.png', previewUrl: 'blob:test' }];
  const runtime = { taskRuntimeState: { pendingTask: { id: 'local-id', imageAttachments: images } } };
  const remove = new Function('getRuntime', 'isPendingTaskId', 'updateTaskRuntimeState', `${removeSource}; return removeMissingTask;`)(
    () => runtime, isPendingTaskId, () => assert.fail('local draft must not be removed'),
  );
  assert.equal(isPendingTaskId(runtime, 'local-id'), true);
  remove('conversation', 'local-id');
  const formalTask = buildTaskRuntimeRecord({ task_id: 'server-id' }, runtime.taskRuntimeState.pendingTask);
  assert.deepEqual(formalTask.imageAttachments, images);
  assert.equal(isPendingTaskId(runtime, 'server-id'), false);
  runtime.taskRuntimeState.pendingTask = null;
  assert.equal(isPendingTaskId(runtime, 'local-id'), false);
  assert.equal(isPendingTaskId(null, 'local-id'), false);
});
