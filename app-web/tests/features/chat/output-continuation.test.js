import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window = {};
const { buildChatTimeline, llmRetrySummary } = await import('../../../src/features/chat/model/chat-timeline.js');

test('output continuation reuses the retry card with English state labels', () => {
  const expected = {
    retrying: 'Output limit reached · continuing response',
    recovered: 'Response continuation completed',
    exhausted: 'Response incomplete · partial output preserved',
  };
  for (const [retryState, summary] of Object.entries(expected)) {
    assert.equal(llmRetrySummary({ reason: 'output_truncated', retryState }), summary);
  }
  const eventLog = ['retrying', 'exhausted'].map(retryState => ({
    type: 'llm_retry', operationId: 'continuation', reason: 'output_truncated', retryState,
  }));
  const timeline = buildChatTimeline({ eventLog, toolCalls: [] }, 'failed');
  const cards = timeline.items.filter(item => item.metaType === 'llm_retry');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].summary, expected.exhausted);
});
