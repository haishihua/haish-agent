import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREVIEW, nextExtraVisible, previewWhenHidden } from '../../../src/features/conversations/model/list-preview.js';

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

test('hiding a list drops its "Show more" expansion back to the default preview', () => {
  const expanded = { chat: 5, bot: 3 };
  assert.equal(previewWhenHidden(expanded, true), expanded, 'a visible list keeps what the user expanded');
  assert.deepEqual(previewWhenHidden(expanded, false), { chat: 0, bot: 0 });
  assert.equal(previewWhenHidden(DEFAULT_PREVIEW, false), DEFAULT_PREVIEW, 'an already-default preview keeps its reference, so React can bail out');
  assert.deepEqual(DEFAULT_PREVIEW, { chat: 0, bot: 0 });
});

test('a collapsed and reopened project previews the default three conversations again', () => {
  const total = 8;
  const initial = 3;
  // The reported flow: "Show more" twice, then the project icon folds the list away.
  let extra = nextExtraVisible(0, total - initial);
  extra = nextExtraVisible(extra, total - initial - extra);
  assert.equal(initial + extra, total, 'the expanded list showed every conversation');
  const reopened = previewWhenHidden({ chat: extra, bot: 0 }, false);
  assert.equal(initial + reopened.chat, initial, 'reopening must not restore the expanded list');
  // Expanding again after the reset still steps three rows at a time.
  assert.equal(initial + nextExtraVisible(reopened.chat, total - initial - reopened.chat), 6);
});
