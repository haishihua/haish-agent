import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { annotationError, locateAnnotation, readAnnotationDraft, visibleAnnotationDrafts, withoutAcknowledgedAnnotations, writeAnnotationDraft } from '../../../src/features/chat/model/message-annotations.js';

const quote = { id: 'q1', source_message_id: 'a1', text: 'gray', comment: 'Use #282828', start: 5, end: 9, prefix: 'dark ', suffix: ' background' };

test('AppShell forwards the full composer payload and send result, including annotations', async () => {
  // Exercise the actual JSX binding: testing the deploy handler alone missed the dropped ninth argument.
  const shell = readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
  const binding = shell.match(/<ChatPanel\b[\s\S]*?\bonSend=\{([^\n]+)\}/);
  assert.ok(binding, 'ChatPanel must have an onSend binding');
  for (const payload of [
    { text: 'Please check these comments', annotations: [quote, { ...quote, id: 'q2', comment: 'Check contrast too' }] },
    { text: '', annotations: [quote] },
    { text: 'Plain message', annotations: [] },
  ]) {
    for (const accepted of [true, false]) {
      let received;
      const sendResult = Promise.resolve(accepted);
      const onSend = new Function('handleDeploy', `return (${binding[1]});`)((...args) => {
        received = args;
        return sendResult;
      });
      const args = [payload.text, null, 'model', 'high', [], 'agent', 'provider', payload.text, payload.annotations];
      const result = onSend(...args);
      assert.deepEqual(received, args, 'message and comment snapshots must reach the same send');
      assert.equal(result, sendResult, 'the composer must receive the original acknowledgement');
      assert.equal(await result, accepted);
    }
  }
});

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

test('submitted comments leave the composer immediately but remain recoverable until confirmation', () => {
  const drafts = [quote];
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  for (const status of ['queued', 'running']) {
    const pending = [{ role: 'user', status, annotations: [quote] }];
    assert.deepEqual(visibleAnnotationDrafts(drafts, pending), []);
    const recoverable = withoutAcknowledgedAnnotations(drafts, pending);
    writeAnnotationDraft(storage, 'sending', recoverable);
    const reloaded = readAnnotationDraft(storage, 'sending');
    assert.deepEqual(reloaded, drafts);
    assert.deepEqual(visibleAnnotationDrafts(reloaded, pending), []);
    const confirmed = [{ ...pending[0], messageId: 'saved-user' }];
    assert.deepEqual(visibleAnnotationDrafts(reloaded, confirmed), []);
    assert.deepEqual(withoutAcknowledgedAnnotations(reloaded, confirmed), []);
  }
});

test('rejection, unconfirmed failure and cancellation preserve comments for retry', () => {
  const drafts = [quote];
  assert.equal(visibleAnnotationDrafts(drafts, []), drafts, 'a rejected send has no submitted message');
  for (const status of ['failed', 'cancelled']) {
    const unconfirmed = [{ role: 'user', status, annotations: [quote] }];
    assert.equal(visibleAnnotationDrafts(drafts, unconfirmed), drafts);
    assert.equal(withoutAcknowledgedAnnotations(drafts, unconfirmed), drafts);
    const confirmed = [{ ...unconfirmed[0], messageId: 'saved-user' }];
    assert.deepEqual(visibleAnnotationDrafts(drafts, confirmed), [], 'a saved message is not an unsent draft even when execution fails');
  }
  assert.equal(visibleAnnotationDrafts(drafts, [{ role: 'agent', status: 'running', annotations: [quote] }]), drafts);
});

test('new and edited comments remain separate from the in-flight snapshot', () => {
  const pending = [{ role: 'user', status: 'running', annotations: [quote] }];
  const added = { ...quote, id: 'q2' };
  const edited = { ...quote, comment: 'Changed while sending' };
  assert.deepEqual(visibleAnnotationDrafts([quote, added], pending), [added]);
  assert.deepEqual(visibleAnnotationDrafts([edited, added], pending), [edited, added]);
  assert.deepEqual(visibleAnnotationDrafts([quote, added], []), [quote, added], 'pending state must not leak into another conversation');
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
