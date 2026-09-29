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
});

test('a user-started run gets the card from its Check stage; the silent check stays a hint', () => {
  // 卡片第一阶段就是 Check：用户点出来的那次更新，checking 就该出卡并停在 Check。
  const checking = updateJobProgress({ status: 'checking' }, { userInitiated: true });
  assert.equal(checking.title, 'Checking updates');
  assert.equal(checking.stageIndex, 0);
  assert.equal(checking.stages[checking.stageIndex].name, 'Check');
  assert.equal(checking.indeterminate, true);
  // 没点过的 checking（启动那次后台静默对版本）不铺卡，只喂页脚那行字。
  assert.equal(updateJobProgress({ status: 'checking' }), null);
  // 下载/安装不管是谁起的，正在进行就得看得见。
  assert.equal(updateJobProgress({ status: 'downloading' }).stageIndex, 1);
  assert.equal(updateJobProgress({ status: 'downloaded' }).stageIndex, 2);
  for (const status of ['not-available', 'error', 'unsupported', 'available', 'idle', undefined]) {
    assert.equal(updateJobProgress({ status }), null);
    assert.equal(updateJobProgress({ status }, { userInitiated: true }), null);
  }
});
