import test from 'node:test';
import assert from 'node:assert/strict';
import { appendStreamEvent } from '../../../src/features/chat/model/stream-events.js';
import { buildSubAgentTimelineItems, buildToolView } from '../../../src/features/chat/model/tool-view.js';
import { skillTrigger } from '../../../src/features/chat/model/tool-presentation.js';

globalThis.window = {};
const { buildChatTimeline } = await import('../../../src/features/chat/model/chat-timeline.js');

const start = (id) => ({ type: 'tool_call_started', callId: id, toolName: 'dispatch_sub_agent', toolInput: { agent: id, task: 'Review' } });
const delta = (id, text) => ({ type: 'sub_agent_answer_delta', parentCallId: id, delta: text, message: text });
const tools = (items) => items.flatMap((item) => item.tools || [item, ...tools(item.children || [])]).filter((item) => item.kind === 'tool');
const delegate = (timeline, id) => tools(timeline.items).find((item) => item.callId === id);
const fresh = (task) => buildChatTimeline({ ...task, eventLog: task.eventLog.slice() });

function append(task, ...events) {
  return { ...task, eventLog: events.reduce((log, event) => appendStreamEvent(log, event), task.eventLog) };
}

test('merged and interleaved sub-agent deltas never replay main history or rebuild unrelated tools', () => {
  let reads = 0;
  const historical = { get type() { reads += 1; return 'agent_progress_delta'; }, message: 'Earlier commentary' };
  let task = { status: 'running', toolCalls: [], eventLog: [historical, start('a'), start('b'), delta('a', 'one ')] };
  let timeline = buildChatTimeline(task);
  const initial = timeline;
  const initialJSON = JSON.stringify(initial);
  for (const events of [[delta('a', ' ')], [delta('a', 'two'), delta('b', 'foo')], [delta('a', 'foo'), delta('b', 'foo')]]) {
    const previous = timeline;
    task = append(task, ...events);
    reads = 0;
    timeline = buildChatTimeline(task);
    assert.equal(reads, 0, 'only the changed suffix may be inspected');
    assert.equal(timeline.items[0], initial.items[0]);
    if (events.every((event) => event.parentCallId === 'a')) assert.equal(delegate(timeline, 'b'), delegate(previous, 'b'));
    assert.deepEqual(timeline, fresh(task));
    assert.equal(JSON.stringify(initial), initialJSON, 'published React props stay immutable');
  }
  assert.equal(buildToolView(delegate(timeline, 'a')).streamAnswerText, 'one  twofoo');
});

test('sub-agent tool lifecycle events reuse the main history, including a delegate nested under a Skill', () => {
  let reads = 0;
  const historical = { get type() { reads += 1; return 'agent_progress_delta'; }, message: 'Earlier' };
  let task = { status: 'running', toolCalls: [], eventLog: [historical,
    { type: 'tool_call_started', callId: 'skill', toolName: 'read_file', toolInput: { path: '/workspace/.haish/skills/review/SKILL.md' } },
    start('a'), start('b')] };
  let timeline = buildChatTimeline(task);
  const sibling = delegate(timeline, 'b');
  const events = [
    { type: 'sub_agent_started', parentCallId: 'a', message: 'Started' },
    { type: 'sub_agent_progress_delta', parentCallId: 'a', message: 'Reading' },
    { type: 'sub_agent_progress_delta', parentCallId: 'a', message: 'Reading' },
    { type: 'sub_agent_tool_call_started', parentCallId: 'a', callId: 'read', toolName: 'read_file', inputSummary: 'Read', toolInput: { path: 'a.js' } },
    { type: 'sub_agent_tool_call_completed', parentCallId: 'a', callId: 'read', toolName: 'read_file', outputSummary: 'Done' },
    { type: 'sub_agent_finished', parentCallId: 'a', message: 'Finished' },
  ];
  for (const event of events) {
    task = append(task, event);
    reads = 0;
    timeline = buildChatTimeline(task);
    assert.equal(reads, 0);
    assert.equal(delegate(timeline, 'b'), sibling);
    assert.deepEqual(timeline, fresh(task));
  }
});

test('expanded sub-agent text updates reuse completed child tools without reading their events', () => {
  let reads = 0;
  const child = { get type() { reads += 1; return 'sub_agent_tool_call_started'; }, parentCallId: 'a', callId: 'read', toolName: 'read_file', inputSummary: 'Read' };
  let task = { status: 'running', toolCalls: [], eventLog: [start('a'), child,
    { type: 'sub_agent_tool_call_completed', parentCallId: 'a', callId: 'read', toolName: 'read_file', outputSummary: 'Done' }, delta('a', 'one ')] };
  let timeline = buildChatTimeline(task);
  const originalItems = buildSubAgentTimelineItems(buildToolView(delegate(timeline, 'a')));
  const originalJSON = JSON.stringify(originalItems);
  for (let i = 0; i < 30; i += 1) {
    task = append(task, delta('a', i % 2 ? ' ' : 'word'));
    reads = 0;
    timeline = buildChatTimeline(task);
    const items = buildSubAgentTimelineItems(buildToolView(delegate(timeline, 'a')));
    assert.equal(reads, 0);
    assert.equal(items[0], originalItems[0]);
    const replay = buildSubAgentTimelineItems(buildToolView(delegate(fresh(task), 'a')));
    assert.deepEqual(items, replay);
    assert.equal(JSON.stringify(originalItems), originalJSON);
  }
});

test('skipped renders, whitespace-only tails and structural transitions match full replay', () => {
  let task = { status: 'running', toolCalls: [], eventLog: [start('a'), start('b'), delta('a', ' ')] };
  let timeline = buildChatTimeline(task);
  let items = buildSubAgentTimelineItems(buildToolView(delegate(timeline, 'a')));
  const sequences = [
    [delta('a', ' '), delta('b', 'other'), delta('a', 'first '), delta('b', ' more'), delta('a', ' words')],
    [{ type: 'sub_agent_tool_call_started', parentCallId: 'a', callId: 'read', toolName: 'read_file', inputSummary: 'Read' }],
    [{ type: 'sub_agent_tool_call_completed', parentCallId: 'a', callId: 'read', toolName: 'read_file', outputSummary: 'Done' }],
    [delta('a', ' after'), delta('b', 'x'), delta('a', ' tool ')],
  ];
  for (const events of sequences) {
    const before = items;
    const snapshot = JSON.stringify(before);
    task = append(task, ...events);
    timeline = buildChatTimeline(task);
    items = buildSubAgentTimelineItems(buildToolView(delegate(timeline, 'a')));
    assert.deepEqual(timeline, fresh(task));
    assert.deepEqual(items, buildSubAgentTimelineItems(buildToolView(delegate(fresh(task), 'a'))));
    assert.equal(JSON.stringify(before), snapshot);
    if (before.some((item) => item.kind === 'tool') && events.every((event) => event.type === 'sub_agent_answer_delta')) {
      assert.equal(items.find((item) => item.kind === 'tool'), before.find((item) => item.kind === 'tool'));
    }
  }
  for (const status of ['done', 'cancelled', 'failed']) {
    const settled = { ...task, status };
    const result = buildChatTimeline(settled);
    assert.deepEqual(result, fresh(settled));
    assert.deepEqual(buildSubAgentTimelineItems(buildToolView(delegate(result, 'a'))),
      buildSubAgentTimelineItems(buildToolView(delegate(fresh(settled), 'a'))));
  }
});

test('history replacements, tool-call snapshot changes and unknown parents safely fall back', () => {
  const backfill = { callId: 'backfill', toolName: 'dispatch_sub_agent', state: 'requested' };
  let task = { status: 'running', toolCalls: [backfill], eventLog: [start('a'), delta('a', 'one')] };
  buildChatTimeline(task);
  for (const event of [delta('missing', 'ignored'), delta('backfill', 'ignored'), delta('a', 'two')]) {
    task = append(task, event);
    assert.deepEqual(buildChatTimeline(task), fresh(task));
  }
  task = { ...task, toolCalls: [{ ...backfill, state: 'returned' }] };
  task = append(task, delta('a', 'three'));
  assert.deepEqual(buildChatTimeline(task), fresh(task));
  task = { ...task, eventLog: [start('a'), delta('a', 'replacement')] };
  assert.deepEqual(buildChatTimeline(task), fresh(task));
});

test('collapsed sub-agent summaries do not read progress entries or serialize detail payloads', () => {
  let progressReads = 0;
  let detailReads = 0;
  const item = { toolName: 'dispatch_sub_agent', category: 'subagent', status: 'running', label: 'Reviewer',
    toolInput: { agent: 'reviewer', task: 'Review', get context() { detailReads += 1; return 'large context'; } },
    progressEvents: [{ get type() { progressReads += 1; return 'sub_agent_answer_delta'; }, message: 'Partial' }] };
  const summary = buildToolView(item, { details: false });
  assert.equal(summary.label, 'Reviewer');
  assert.equal(summary.mode, 'process');
  assert.equal(summary.hasDetails, true);
  assert.equal(summary.detailsDeferred, true);
  assert.equal(progressReads, 0);
  assert.equal(detailReads, 0);
  const detail = buildToolView(item);
  assert.equal(detail.streamAnswerText, 'Partial');
  assert.match(detail.requestJson, /large context/);
  assert.ok(progressReads > 0);
  assert.ok(detailReads > 0);
  assert.equal(buildToolView({ ...item, status: 'failed' }, { details: false }).failed, true);
});

// 折叠时只算 header 所需的字段，靠的是「subagent 与 skill 分类互斥」：
// `skillTrigger` 只认 read_file / load_skill / skill，而这些名字永远不会被
// `categorizeToolCall` 归成 subagent。这里把这条前提钉住。
test('skill and sub-agent categories cannot overlap', () => {
  const subAgentNames = ['dispatch_sub_agent', 'sub_agent', 'subagent'];
  for (const toolName of subAgentNames) {
    const item = { category: 'subagent', toolName, toolInput: { path: '/w/.haish/skills/review/SKILL.md' } };
    assert.equal(skillTrigger(item), null, `${toolName} must not classify as a skill`);
    assert.equal(buildToolView(item, { details: false }).mode, 'process');
  }
});
