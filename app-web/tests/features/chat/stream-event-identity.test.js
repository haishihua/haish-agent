import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRuntimeEventIngest } from '../../../src/features/chat/model/event-identity.js';
import { appendStreamEvent, compactStreamEvents, mergeAdjacentStreamEvent } from '../../../src/features/chat/model/stream-events.js';
import { normalizeRuntimeEvents, runtimeEventToLog } from '../../../src/features/tasks/model/runtime-events.js';

const types = ['llm_answer_delta', 'llm_thinking_delta', 'tool_output_delta', 'sub_agent_answer_delta'];
const delta = (type, eventId, text, callId = 'call') => ({
  type, event_id: eventId, delta: text, call_id: callId,
  task_id: 'task', conversation_id: 'conversation',
});

for (const type of types) {
  test(`${type}: compacted identities survive partial raw replay and immutable appends`, () => {
    const a = delta(type, 'a', 'foo'), b = delta(type, 'b', 'bar');
    const previous = compactStreamEvents([a, b]);
    assert.equal(previous.length, 1);
    assert.deepEqual(previous[0].deltaEventIds, ['a', 'b']);
    Object.freeze(previous[0].deltaEventIds);
    Object.freeze(previous[0]);
    Object.freeze(previous);

    const accept = createRuntimeEventIngest(previous);
    assert.equal(accept(b), false, 'the non-leading compacted identity must seed ingest');
    assert.equal(accept(delta(type, 'c', 'bar')), true, 'equal text with a new id is output');
    assert.equal(accept(delta(type, 'c', 'bar')), false);
    assert.equal(accept(delta(type, 'b', 'bar', 'another-call')), true, 'call scope is independent');
    assert.equal(accept(delta(type, null, 'bar')), true);
    assert.equal(accept(delta(type, null, 'bar')), true, 'id-less output is not text-deduplicated');

    const next = compactStreamEvents([...previous, b, delta(type, 'c', 'baz')]);
    assert.equal(next[0].delta, 'foobarbaz');
    assert.deepEqual(next[0].deltaEventIds, ['a', 'b', 'c']);
    const appended = appendStreamEvent(previous, delta(type, 'c', 'baz'));
    assert.deepEqual(appended[0].deltaEventIds, ['a', 'b', 'c']);
    assert.equal(appended[0].delta, 'foobarbaz');
    assert.deepEqual(previous[0].deltaEventIds, ['a', 'b']);
    assert.equal(previous[0].delta, 'foobar');
    assert.equal(a.deltaEventIds, undefined, 'compaction does not decorate raw inputs');

    const queued = mergeAdjacentStreamEvent(a, b);
    assert.deepEqual(queued.deltaEventIds, ['a', 'b']);
    const [log] = normalizeRuntimeEvents([queued]).map(runtimeEventToLog);
    assert.deepEqual(log.deltaEventIds, ['a', 'b'], 'raw-to-log conversion carries every identity');
    assert.equal(createRuntimeEventIngest([log])(b), false);
  });

  for (const interleaved of [false, true]) {
    test(`${type}: 10000 ${interleaved ? 'interleaved' : 'adjacent'} deltas retain linear compaction/seed work`, (t) => {
      const count = 10000;
      let idReads = 0;
      const events = Array.from({ length: count }, (_, index) => ({
        ...delta(type, `id-${index}`, 'foo', interleaved ? `call-${index % 2}` : 'call'),
        get event_id() { idReads += 1; return `id-${index}`; },
      }));
      const started = performance.now();
      const compacted = compactStreamEvents(events);
      const accept = createRuntimeEventIngest(compacted);
      const elapsed = performance.now() - started;
      t.diagnostic(`${count} deltas compacted and seeded in ${elapsed.toFixed(1)}ms; ${idReads} identity reads`);
      assert.ok(elapsed < 1500, `linear compaction/seed took ${elapsed.toFixed(1)}ms`);
      assert.ok(idReads < count * 12, `${idReads} identity reads must remain O(n)`);
      assert.equal(compacted.length, interleaved ? count : 1);
      assert.equal(compacted.map((event) => event.delta).join(''), 'foo'.repeat(count));
      assert.equal(compacted.flatMap((event) => event.deltaEventIds).length, count);
      assert.equal(accept(delta(type, 'id-9999', 'foo', interleaved ? 'call-1' : 'call')), false);
      assert.equal(accept(delta(type, 'fresh', 'foo')), true);
    });
  }
}

test('event identity is scoped by type, not shared text or the metadata field', () => {
  const accept = createRuntimeEventIngest(compactStreamEvents([
    delta('llm_answer_delta', 'a', 'foo'), delta('llm_answer_delta', 'b', 'bar'),
  ]));
  assert.equal(accept(delta('llm_answer_delta', 'b', 'bar')), false);
  assert.equal(accept(delta('llm_thinking_delta', 'b', 'bar')), true);
});
