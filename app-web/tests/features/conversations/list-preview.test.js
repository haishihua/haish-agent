import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREVIEW, PREVIEW_PAGE_SIZE, nextExtraVisible, previewWhenHidden } from '../../../src/features/conversations/model/list-preview.js';

test('the sidebar previews five rows and every "Show more" adds five more', () => {
  // 用户看到的契约就这两条：默认先放 5 行，每点一次 “Show more” 再加 5 行。
  assert.equal(PREVIEW_PAGE_SIZE, 5);
  const total = 22;
  const initial = 5;
  let extra = 0;
  const counts = [initial];
  for (let click = 0; click < 5; click += 1) {
    extra = nextExtraVisible(extra, total - initial - extra);
    counts.push(initial + extra);
  }
  // 最后一跳只补到总数；再点一次（按钮已是 “Show less”）收回到默认预览。
  assert.deepEqual(counts, [5, 10, 15, 20, 22, 5]);
});

test('short lists and newly added records do not force a full expansion', () => {
  assert.equal(nextExtraVisible(0, 0), 0);
  assert.equal(nextExtraVisible(0, 1), 1);
  assert.equal(nextExtraVisible(0, 100), 5);
  assert.equal(nextExtraVisible(5, 100), 10);
  assert.equal(nextExtraVisible(10, -1), 0);
});

test('hiding a list drops its "Show more" expansion back to the default preview', () => {
  const expanded = { chat: 10, bot: 5 };
  assert.equal(previewWhenHidden(expanded, true), expanded, 'a visible list keeps what the user expanded');
  assert.deepEqual(previewWhenHidden(expanded, false), { chat: 0, bot: 0 });
  assert.equal(previewWhenHidden(DEFAULT_PREVIEW, false), DEFAULT_PREVIEW, 'an already-default preview keeps its reference, so React can bail out');
  assert.deepEqual(DEFAULT_PREVIEW, { chat: 0, bot: 0 });
});

test('a collapsed and reopened project previews the default five conversations again', () => {
  const total = 13;
  const initial = 5;
  // The reported flow: "Show more" twice, then the project icon folds the list away.
  let extra = nextExtraVisible(0, total - initial);
  extra = nextExtraVisible(extra, total - initial - extra);
  assert.equal(initial + extra, total, 'the expanded list showed every conversation');
  const reopened = previewWhenHidden({ chat: extra, bot: 0 }, false);
  assert.equal(initial + reopened.chat, initial, 'reopening must not restore the expanded list');
  // Expanding again after the reset still steps five rows at a time.
  assert.equal(initial + nextExtraVisible(reopened.chat, total - initial - reopened.chat), 10);
});
