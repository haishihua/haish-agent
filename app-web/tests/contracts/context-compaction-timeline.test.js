import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {};
const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');
const { runtimeEventToLog } = await import('../../src/features/tasks/model/runtime-events.js');

test('completed context compaction keeps its summary snapshot and metrics', () => {
  const started = runtimeEventToLog({
    type: 'context_compaction_started',
    event_id: 'compact-start',
  });
  const event = runtimeEventToLog({
    type: 'context_compaction_completed',
    event_id: 'compact-1',
    summary_text: '## Goal\nKeep the implementation focused.',
    summary_tokens: 42,
    message_count: 7,
    prompt_tokens_before_compaction: 1200,
    prompt_tokens_after_compaction: 300,
  });
  const timeline = buildChatTimeline({ eventLog: [started, event] }, 'done').items;

  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].summaryText, '## Goal\nKeep the implementation focused.');
  assert.deepEqual(timeline[0].details, [
    '7 messages',
    '1,200 → 300 tokens',
    '42 summary tokens',
  ]);
});

test('context compaction summary is rendered only after expanding the card', () => {
  const source = fs.readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
  assert.match(source, /const expandable = isContextCompaction && Boolean\(summaryText\);/);
  assert.match(source, /<Markdown source=\{summaryText\} \/>/);
});

test('todo panel consumes todo_updated instead of tool response artifacts', () => {
  const event = runtimeEventToLog({
    type: 'todo_updated',
    event_id: 'todo-1',
    items: [
      { content: 'Inspect protocol', status: 'completed', activeForm: 'Inspecting protocol' },
      { content: 'Update frontend', status: 'in_progress', activeForm: 'Updating frontend' },
    ],
    counts: { pending: 0, in_progress: 1, completed: 1 },
    write_count: 2,
  });
  const timeline = buildChatTimeline({ eventLog: [event], toolCalls: [] }, 'running');

  assert.deepEqual(timeline.latestTodos, [
    { content: 'Inspect protocol', status: 'completed', activeForm: 'Inspecting protocol' },
    { content: 'Update frontend', status: 'in_progress', activeForm: 'Updating frontend' },
  ]);
  assert.deepEqual(timeline.items, []);
});

test('todo current state stays static and uses the neutral marker', () => {
  const component = fs.readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
  const stylesheet = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
  const currentIconRule = stylesheet.match(/\.chat-todo-icon\.in-progress \{[^}]*\}/)?.[0] || '';

  assert.match(component, /className="chat-todo-current-mark"/);
  assert.doesNotMatch(component, /chat-todo-spinner/);
  assert.doesNotMatch(currentIconRule, /animation:/);
});
