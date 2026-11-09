import test from 'node:test';
import assert from 'node:assert/strict';

const { isDraftEntrySelected, newEntryLabel } = await import(
  '../../../src/features/conversations/model/new-entry.js'
);

test('each panel names its own new entry: conversation vs task', () => {
  assert.equal(newEntryLabel('chat'), 'New Conversation');
  assert.equal(newEntryLabel('bot'), 'New Task');
  assert.equal(newEntryLabel(), 'New Conversation');
});

test('the blank entry highlights its button only while it owns the selection', () => {
  const draft = { id: 'draft-1', executionMode: 'bot' };

  assert.equal(isDraftEntrySelected(draft, 'draft-1', 'bot'), true);
  // 切到另一边：草稿不是这个模式的，那条按钮不能亮。
  assert.equal(isDraftEntrySelected(draft, 'draft-1', 'chat'), false);
  assert.equal(isDraftEntrySelected(draft, 'other', 'bot'), false);
  assert.equal(isDraftEntrySelected(null, 'draft-1', 'bot'), false);
  assert.equal(isDraftEntrySelected(draft, null, 'bot'), false);
  // 没记模式的草稿由当前面板认领。
  assert.equal(isDraftEntrySelected({ id: 'draft-1' }, 'draft-1', 'chat'), true);
});
