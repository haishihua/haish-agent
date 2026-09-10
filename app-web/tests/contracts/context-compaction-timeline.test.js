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

test('unfinished compactions settle with terminal tasks without changing active snapshots', () => {
  const task = { eventLog: [runtimeEventToLog({ type: 'context_compaction_started', event_id: 'compact-start' })] };
  const running = buildChatTimeline(task, 'running');
  for (const [status, expected] of [['done', 'done'], ['completed', 'done'], ['failed', 'failed'], ['cancelled', 'cancelled'], ['aborted', 'cancelled']]) {
    const live = buildChatTimeline(task, status);
    assert.equal(live.items[0].status, expected, status);
    assert.equal(live.items[0].id, running.items[0].id);
    assert.equal(buildChatTimeline({ ...task, status }).items[0].status, expected);
  }
  assert.equal(running.items[0].status, 'running');
  assert.equal(buildChatTimeline(task, 'queued').items[0].status, 'running');
});

test('compaction failure closes its running row even while the task continues', () => {
  const started = runtimeEventToLog({ type: 'context_compaction_started' });
  const failed = runtimeEventToLog({ type: 'context_compaction_failed', error: 'Provider unavailable' });
  for (const eventLog of [[started, failed], [failed]]) {
    for (const status of ['running', 'done', 'cancelled']) {
      const items = buildChatTimeline({ eventLog }, status).items;
      assert.equal(items.length, 1);
      assert.equal(items[0].status, 'failed');
    }
  }
});

test('later termination preserves completed compaction snapshots and settles only unfinished rows', () => {
  const eventLog = [
    runtimeEventToLog({ type: 'context_compaction_started' }),
    runtimeEventToLog({ type: 'context_compaction_completed', summary_text: 'Saved summary', summary_tokens: 42 }),
    runtimeEventToLog({ type: 'context_compaction_started' }),
    runtimeEventToLog({ type: 'context_compaction_started' }),
  ];
  const items = buildChatTimeline({ eventLog }, 'cancelled').items;
  assert.deepEqual(items.map((item) => item.status), ['done', 'cancelled', 'cancelled']);
  assert.equal(items[0].summaryText, 'Saved summary');
  assert.deepEqual(items[0].details, ['42 summary tokens']);
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

test('todo uses a static current arrow and a real completion-ratio header', () => {
  const component = fs.readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
  const stylesheet = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
  const currentIconRule = stylesheet.match(/\.chat-todo-icon\.in-progress \{[^}]*\}/)?.[0] || '';

  assert.match(component, /className="chat-todo-current-arrow"/);
  assert.match(component, /completedCount \/ safeTodos.length \* 100/);
  assert.match(component, /completedCount > 0 \|\| hasActiveTodo/);
  assert.match(stylesheet, /conic-gradient\(currentColor var\(--todo-progress\), transparent 0\)/);
  assert.doesNotMatch(component, /chat-todo-spinner/);
  assert.doesNotMatch(currentIconRule, /animation:/);
});
