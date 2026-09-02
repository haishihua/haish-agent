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

test('retry status is accessible and replaces generic activity while running', () => {
  const source = fs.readFileSync(
    new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /role=\{isRetry \? 'status' : undefined\}/);
  assert.match(source, /aria-live=\{isRetry \? 'polite' : undefined\}/);
  assert.match(source, /<AppIcon name="retry" size=\{13\} className="chat-timeline-retry-icon" \/>/);
  assert.match(source, /streaming && !retrying/);
});

test('retry cards and actions use the shared vector icon', () => {
  const iconSource = fs.readFileSync(new URL('../../src/shared/ui/AppIcon.jsx', import.meta.url), 'utf8');
  const styleSource = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
  const taskCardSource = fs.readFileSync(new URL('../../src/features/conversations/components/ConversationTaskCards.jsx', import.meta.url), 'utf8');

  assert.match(iconSource, /retry: RefreshCw/);
  assert.match(taskCardSource, /<AppIcon name="retry" size=\{15\} \/>/);
  assert.match(styleSource, /\.chat-timeline-meta\.status-running \.chat-timeline-retry-icon/);
  assert.doesNotMatch(styleSource, /\.chat-bubble-rerun-icon/);
});

test('tool and retry cards share the same timeline chip primitive', () => {
  const componentSource = fs.readFileSync(
    new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
    'utf8',
  );
  const styleSource = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

  assert.match(componentSource, /chat-timeline-chip-head chat-timeline-tool-head/);
  assert.match(componentSource, /chat-timeline-chip-head chat-timeline-meta-head/);
  assert.match(styleSource, /\.chat-timeline-chip-head \{/);
});
