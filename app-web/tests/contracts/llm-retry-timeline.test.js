import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {};
const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');
const { runtimeEventToLog } = await import('../../src/features/tasks/model/runtime-events.js');

function retryEvent(state, attempt = 2) {
  return runtimeEventToLog({
    type: 'llm_retry',
    event_id: `retry-${state}`,
    operation_id: 'operation-1',
    state,
    attempt,
    max_attempts: 4,
    reason: 'tls_error',
  });
}

test('retry lifecycle updates one English status row in place', () => {
  const retrying = buildChatTimeline({ eventLog: [retryEvent('retrying')] }, 'running').items;
  assert.equal(retrying.length, 1);
  assert.equal(retrying[0].summary, 'Connection interrupted · retrying 2/4');
  assert.equal(retrying[0].status, 'running');

  const recovered = buildChatTimeline({
    eventLog: [retryEvent('retrying'), retryEvent('recovered')],
  }, 'running').items;
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].summary, 'Connection restored on attempt 2/4');
  assert.equal(recovered[0].status, 'done');
});

test('exhausted retry uses the failed state without exposing raw errors', () => {
  const [item] = buildChatTimeline({ eventLog: [retryEvent('exhausted', 4)] }, 'failed').items;
  assert.equal(item.summary, 'Connection failed after 4 attempts');
  assert.equal(item.status, 'failed');
  assert.equal(item.errorMessage, undefined);
});

test('unfinished retries settle with terminal tasks on live updates and history rebuilds', () => {
  const task = { eventLog: [retryEvent('retrying')] };
  const running = buildChatTimeline(task, 'running');
  for (const [status, expected] of [['done', 'done'], ['completed', 'done'], ['failed', 'failed'], ['cancelled', 'cancelled'], ['aborted', 'cancelled']]) {
    const live = buildChatTimeline(task, status);
    assert.equal(live.items[0].status, expected, status);
    assert.equal(live.items[0].id, running.items[0].id);
    assert.equal(buildChatTimeline({ ...task, status }).items[0].status, expected);
  }
  assert.equal(running.items[0].status, 'running', 'cached running snapshot stays unchanged');
  assert.equal(task.eventLog[0].retryState, 'retrying', 'recorded event stays unchanged');
  assert.equal(buildChatTimeline(task, 'queued').items[0].status, 'running');
});

test('task termination preserves explicitly recovered and exhausted retries', () => {
  for (const taskStatus of ['done', 'failed', 'cancelled']) {
    for (const [retryState, expected] of [['recovered', 'done'], ['exhausted', 'failed']]) {
      const task = { eventLog: [retryEvent('retrying'), retryEvent(retryState)] };
      const [item] = buildChatTimeline(task, taskStatus).items;
      assert.equal(item.status, expected);
      assert.equal(item.retryState, retryState);
    }
  }
});

test('retry status is accessible and replaces generic activity while running', () => {
  const source = fs.readFileSync(
    new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(source, /<AppIcon name="retry" size=\{13\} className="chat-timeline-retry-icon" \/>/);
  assert.match(source, /activity && !retrying/);
  assert.match(source, /<ThinkingOrb\s+state=\{activity\.state === 'composing' \? 'working' : activity\.state === 'working' \? 'composing' : activity\.state\}/);
});

test('retry cards and actions use the shared vector icon', () => {
  const iconSource = fs.readFileSync(new URL('../../src/shared/ui/AppIcon.jsx', import.meta.url), 'utf8');
  const styleSource = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
  const taskCardSource = fs.readFileSync(new URL('../../src/features/conversations/components/ConversationTaskCards.jsx', import.meta.url), 'utf8');

  assert.match(iconSource, /retry: RefreshCw/);
  assert.match(taskCardSource, /<AppIcon name="retry" size=\{15\} \/>/);
  assert.doesNotMatch(styleSource, /\.chat-timeline-meta\.status-running \.chat-timeline-retry-icon/);
  assert.doesNotMatch(styleSource, /\.chat-bubble-rerun-icon/);
});

test('retry and compaction use shared tool rows with their own disclosure behavior', () => {
  const componentSource = fs.readFileSync(
    new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
    'utf8',
  );
  const styleSource = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

  assert.match(componentSource, /<ToolCall /);
  assert.match(componentSource, /<ToolTimeline /);
  assert.match(componentSource, /<ToolCall label=\{item\.summary \|\| 'Retrying model response…'\} status=\{item\.status \|\| 'done'\} expandable=\{false\}/);
  assert.match(componentSource, /open=\{open\} onOpenChange=\{setOpen\} expandable=\{expandable\}/);
  assert.doesNotMatch(componentSource, /chat-timeline-chip-head/);
  assert.doesNotMatch(styleSource, /\.chat-timeline-chip-head \{/);
});
