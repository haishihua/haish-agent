import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseFullTaskAttempts } from '../../../src/features/chat/model/task-attempts.js';

test('retries and edits replace the source turn without removing independent workflow runs', () => {
  const tasks = [
    { taskId: 'failed' },
    { taskId: 'cancelled', sourceTaskId: 'failed' },
    { taskId: 'edited', sourceTaskId: 'cancelled' },
    { taskId: 'node', sourceTaskId: 'edited', rerunFromNodeId: 'node-1' },
  ];
  assert.deepEqual(collapseFullTaskAttempts(tasks).map((task) => task.taskId), ['edited', 'node']);
  assert.equal(tasks.length, 4);
});
