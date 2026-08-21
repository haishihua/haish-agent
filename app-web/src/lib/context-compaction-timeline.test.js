import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {};
const { buildChatTimeline } = await import('./chat-timeline.js');
const { worldEventToRuntimeLog } = await import('./world-events.js');

test('completed context compaction keeps its summary snapshot and metrics', () => {
  const started = worldEventToRuntimeLog({
    type: 'context_compaction_started',
    event_id: 'compact-start',
  });
  const event = worldEventToRuntimeLog({
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
  const source = fs.readFileSync(new URL('../panels/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
  assert.match(source, /const expandable = isContextCompaction && Boolean\(summaryText\);/);
  assert.match(source, /<Markdown source=\{summaryText\} \/>/);
});
