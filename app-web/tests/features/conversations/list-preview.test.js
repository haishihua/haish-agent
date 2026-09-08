import test from 'node:test';
import assert from 'node:assert/strict';
import { nextExtraVisible } from '../../../src/features/conversations/model/list-preview.js';

test('show more reveals three additional rows until all are visible, then collapses', () => {
  const total = 11;
  const initial = 3;
  let extra = 0;
  const counts = [initial];
  for (let click = 0; click < 4; click += 1) {
    extra = nextExtraVisible(extra, total - initial - extra);
    counts.push(initial + extra);
  }
  assert.deepEqual(counts, [3, 6, 9, 11, 3]);
});

test('short lists and newly added records do not force a full expansion', () => {
  assert.equal(nextExtraVisible(0, 0), 0);
  assert.equal(nextExtraVisible(0, 1), 1);
  assert.equal(nextExtraVisible(3, 100), 6);
  assert.equal(nextExtraVisible(6, -1), 0);
});
