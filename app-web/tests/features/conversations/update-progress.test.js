import test from 'node:test';
import assert from 'node:assert/strict';
import { updateJobProgress } from '../../../src/features/conversations/model/update-progress.js';

test('download progress is real, bounded, and unknown is not shown as zero', () => {
  assert.equal(updateJobProgress({ status: 'downloading', progressPercent: 5 }).stageProgress, 0.05);
  assert.equal(updateJobProgress({ status: 'downloading', progressPercent: 0 }).eta, '0%');
  assert.equal(updateJobProgress({ status: 'downloading' }).indeterminate, true);
  assert.equal(updateJobProgress({ status: 'downloading', progressPercent: NaN }).eta, '…');
  assert.equal(updateJobProgress({ status: 'downloading', progressPercent: 110 }).stageProgress, 1);
});

test('download completion is an indeterminate install stage, not job completion', () => {
  const installing = updateJobProgress({ status: 'downloaded', progressPercent: 100 });
  assert.equal(installing.stageIndex, 2);
  assert.ok(installing.stageIndex < installing.stages.length);
  assert.equal(installing.indeterminate, true);
  assert.equal(updateJobProgress({ status: 'checking' }).stageIndex, 0);
  for (const status of ['error', 'unsupported', 'available']) {
    assert.equal(updateJobProgress({ status }), null);
  }
  const current = updateJobProgress({ status: 'not-available' });
  assert.equal(current.stageIndex, current.stages.length);
  assert.equal(current.title, 'Up to date');
  assert.deepEqual(current.stages.map((stage) => stage.name), ['Check']);
});
