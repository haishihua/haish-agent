import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationError, locateAnnotation, readAnnotationDraft, withoutAcknowledgedAnnotations, writeAnnotationDraft } from '../../../src/features/chat/model/message-annotations.js';

const quote = { id: 'q1', source_message_id: 'a1', text: 'gray', comment: 'Use #282828', start: 5, end: 9, prefix: 'dark ', suffix: ' background' };

test('anchors use rendered UTF-16 offsets, including emoji', () => {
  const text = '😀 dark gray background';
  assert.deepEqual(locateAnnotation(text, { ...quote, start: 8, end: 12 }), { start: 8, end: 12 });
  assert.deepEqual(locateAnnotation(text, quote), { start: 8, end: 12 });
});

test('repeated or missing quotes never jump to an arbitrary occurrence', () => {
  assert.equal(locateAnnotation('gray gray', { ...quote, start: 100, end: 104, prefix: '', suffix: '' }), null);
  assert.equal(locateAnnotation('blue background', quote), null);
  assert.deepEqual(locateAnnotation('gray dark gray background', { ...quote, start: 100, end: 104 }), { start: 10, end: 14 });
});

test('draft persistence is scoped, reloadable, removable and tolerates corrupt storage', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  writeAnnotationDraft(storage, 'chat-a', [quote]);
  assert.deepEqual(readAnnotationDraft(storage, 'chat-a'), [quote]);
  assert.deepEqual(readAnnotationDraft(storage, 'chat-b'), []);
  writeAnnotationDraft(storage, 'chat-a', []);
  assert.equal(values.size, 0);
  assert.deepEqual(readAnnotationDraft({ getItem: () => '{broken' }, 'chat-a'), []);
  assert.deepEqual(readAnnotationDraft({ getItem: () => '[{}]' }, 'chat-a'), []);
  assert.deepEqual(readAnnotationDraft({ getItem: () => { throw Error('storage blocked'); } }, 'chat-a'), []);
});

test('only server acknowledgement clears matching submitted snapshots', () => {
  const drafts = [quote];
  const pending = [{ role: 'user', annotations: [quote] }];
  assert.equal(withoutAcknowledgedAnnotations(drafts, pending), drafts);
  const confirmed = [{ ...pending[0], messageId: 'user-1' }];
  assert.deepEqual(withoutAcknowledgedAnnotations(drafts, confirmed), []);
  const added = { ...quote, id: 'q2' };
  const edited = { ...quote, comment: 'Changed while sending' };
  assert.deepEqual(withoutAcknowledgedAnnotations([quote, added], confirmed), [added]);
  assert.deepEqual(withoutAcknowledgedAnnotations([edited, added], confirmed), [edited, added]);
});

test('bounds and duplicate IDs are checked before send', () => {
  assert.equal(annotationError([quote]), '');
  assert.equal(annotationError([{ ...quote, comment: '' }]), '');
  for (const patch of [{ id: '' }, { text: '' }, { text: 'x'.repeat(4001) }, { start: -1 }, { end: 5 }, { end: 8.5 }, { comment: 'x'.repeat(2001) }]) {
    assert.ok(annotationError([{ ...quote, ...patch }]));
  }
  assert.ok(annotationError([quote, quote]));
  assert.ok(annotationError(Array.from({ length: 21 }, (_, i) => ({ ...quote, id: `q${i}` }))));
  assert.ok(annotationError([quote], 'x'.repeat(20000)));
});

test('runtime projections retain annotations and genuinely empty message text', async () => {
  globalThis.window = { HAISH_API_BASE: '' };
  const { buildTaskRuntimeRecord, taskSummaryToRuntimeTask } = await import('../../../src/features/tasks/model/task-runtime.js');
  const live = buildTaskRuntimeRecord({ task_id: 't1', user_message_id: 'u1', annotations: [quote], display_text: '' }, null);
  assert.deepEqual(live.annotations, [quote]);
  assert.equal(live.displayText, '');
  const restored = taskSummaryToRuntimeTask({ task_id: 't1', title: 'Comments on your answer', annotations: [quote], display_text: '', user_message_id: 'u1' });
  assert.deepEqual(restored.annotations, [quote]);
  assert.equal(restored.displayText, '');
  assert.equal(restored.userMessageId, 'u1');
  assert.deepEqual(taskSummaryToRuntimeTask({ task_id: 'old' }).annotations, []);
});
