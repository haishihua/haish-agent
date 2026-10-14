import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubAgentTimelineItems, buildToolView } from '../../../src/features/chat/model/tool-view.js';
import { compactStreamEvents, appendStreamEvent } from '../../../src/features/chat/model/stream-events.js';
import { deduplicateRuntimeEvents } from '../../../src/features/chat/model/event-identity.js';

globalThis.window = {};
const { buildChatTimeline } = await import('../../../src/features/chat/model/chat-timeline.js');

const start = (parent) => ({ type: 'tool_call_started', callId: parent, toolName: 'dispatch_sub_agent' });
const delta = (parent, text, eventId) => ({ type: 'sub_agent_answer_delta', parentCallId: parent, message: text, delta: text, eventId });
function appendAcceptedEvents(events) {
  return deduplicateRuntimeEvents(events).reduce((log, event) => appendStreamEvent(log, event), []);
}
function projection(eventLog, status = 'cancelled') {
  return buildChatTimeline({ eventLog, status }).items.filter((item) => item.kind === 'tool').map((item) => {
    const view = buildToolView(item);
    return { parent: item.callId, answer: view.streamAnswerText,
      text: buildSubAgentTimelineItems(view).filter((child) => child.kind === 'text').map((child) => child.text).join(''),
      status: item.status };
  });
}

for (const interleaved of [false, true]) {
  test(`sub-agent literal repeat and overlap survive ${interleaved ? 'A/B interleaving' : 'adjacent compaction'} without a final`, () => {
    const fragments = ['foo', 'foo', 'foobar', 'bar baz ', ' tail'];
    const events = [start('a'), start('b')];
    fragments.forEach((text, index) => {
      events.push(delta('a', text, `a-${index}`));
      if (interleaved) events.push(delta('b', text, `b-${index}`));
    });
    const expected = [{ parent: 'a', answer: fragments.join(''), text: fragments.join(''), status: 'cancelled' },
      { parent: 'b', answer: interleaved ? fragments.join('') : '', text: interleaved ? fragments.join('') : '', status: 'cancelled' }];
    assert.deepEqual(projection(deduplicateRuntimeEvents(events)), expected);
    assert.deepEqual(projection(compactStreamEvents(events)), expected);
    assert.deepEqual(projection(appendAcceptedEvents(events)), expected);
  });
}

test('only event identity suppresses replay; matching text and cross-parent event ids remain independent', () => {
  const a = delta('a', 'foo', 'same-id');
  const events = [start('a'), start('b'), a, delta('b', 'foo', 'same-id'), { ...a },
    delta('a', 'foo', 'new-id'), delta('a', 'foo'), delta('a', 'foo')];
  const expected = [
    { parent: 'a', answer: 'foofoofoofoo', text: 'foofoofoofoo', status: 'cancelled' },
    { parent: 'b', answer: 'foo', text: 'foo', status: 'cancelled' },
  ];
  assert.deepEqual(projection(deduplicateRuntimeEvents(events)), expected);
  assert.deepEqual(projection(compactStreamEvents(events)), expected);
  assert.deepEqual(projection(appendAcceptedEvents(events)), expected);
});

test('replay identities survive adjacent compaction and later intervening progress', () => {
  const a = delta('a', 'foo', 'a-1'), b = delta('a', 'foo', 'a-2');
  const events = [start('a'), a, { ...a }, b,
    { type: 'sub_agent_progress_delta', parentCallId: 'a', message: 'Working' }, { ...b }];
  for (const log of [deduplicateRuntimeEvents(events), compactStreamEvents(events), appendAcceptedEvents(events)]) {
    const [row] = projection(log);
    assert.equal(row.answer, 'foofoo');
  }
});

test('sub-agent whitespace fragments survive tool boundaries in cancelled partial output', () => {
  const events = [start('a'), delta('a', 'one '), delta('a', ' '),
    { type: 'sub_agent_tool_call_started', parentCallId: 'a', callId: 'read', toolName: 'read_file' },
    delta('a', 'two '), delta('a', ' words')];
  const [row] = projection(events);
  assert.equal(row.answer, 'one  two  words');
  assert.equal(row.text, 'onetwo  words', 'display segments trim at tool boundaries, never within deltas');
});
