import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contextUsageFromConversationDetail,
  contextUsageFromTask,
  createContextUsageTracker,
  createEmptyContextUsage,
  estimateContextUsageFromConversationDetail,
  latestContextUsageFromTasks,
  loadStoredContextUsage,
  normalizeContextUsage,
  preferNewerContextUsage,
  saveStoredContextUsage,
} from '../../../src/core/context-usage.js';

const ID = 'context-window';
const WINDOW = 200000;

function withLocalStorage(run) {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } };
  try { return run(values); } finally { globalThis.window = previousWindow; }
}

test('各读数转换使用显式传入的窗口，未传时不借用其他实例的值', () => {
  const task = { conversation_id: ID, context_used_tokens: WINDOW / 4 };
  const detail = { conversation_id: ID, context_used_tokens: WINDOW / 4, messages: [{ content: 'hi' }] };
  assert.equal(createEmptyContextUsage(ID).totalTokens, 0);
  assert.equal(createEmptyContextUsage(ID, WINDOW).totalTokens, WINDOW);
  assert.equal(normalizeContextUsage({ usedTokens: WINDOW / 2 }, null, WINDOW).ratio, 0.5);
  assert.equal(contextUsageFromTask(task, null, WINDOW).ratio, 0.25);
  assert.equal(contextUsageFromConversationDetail(detail, null, WINDOW).ratio, 0.25);
  assert.equal(estimateContextUsageFromConversationDetail(detail, WINDOW).totalTokens, WINDOW);
  assert.equal(latestContextUsageFromTasks([task], null, WINDOW).ratio, 0.25);
  assert.equal(preferNewerContextUsage(createEmptyContextUsage(ID, WINDOW),
    normalizeContextUsage({ conversationId: ID, usedTokens: 1000 }), WINDOW).ratio, 1000 / WINDOW);
  withLocalStorage(() => {
    saveStoredContextUsage(normalizeContextUsage({ conversationId: ID, usedTokens: 1000, totalTokens: 999, updatedAt: '2026-01-01T00:00:00Z' }));
    assert.equal(loadStoredContextUsage(ID, WINDOW).ratio, 1000 / WINDOW);
  });
});

test('不同 tracker 的窗口互不干扰，更新后立刻可用于后续转换', () => {
  const options = { getActiveConversationId: () => ID, persist: () => {} };
  const first = createContextUsageTracker({ ...options, initialContextWindowTokens: WINDOW });
  const second = createContextUsageTracker(options);
  assert.equal(first.read().totalTokens, WINDOW);
  assert.equal(second.getTotalTokens(), 0);
  second.setTotalTokens(100000);
  assert.equal(first.getTotalTokens(), WINDOW);
  assert.equal(second.getTotalTokens(), 100000);
  const task = { conversation_id: ID, context_used_tokens: 25000 };
  second.apply(latestContextUsageFromTasks([task], ID, second.getTotalTokens()));
  assert.equal(second.read().ratio, 0.25);
  first.reset(ID);
  assert.equal(first.read().totalTokens, WINDOW);
  assert.equal(contextUsageFromTask(null, ID, 0).totalTokens, 0);
  assert.equal(contextUsageFromConversationDetail(null, ID, 0).totalTokens, 0);
  assert.equal(estimateContextUsageFromConversationDetail(null, 0).totalTokens, 0);
  assert.equal(latestContextUsageFromTasks([], ID, 0).totalTokens, 0);
  assert.equal(loadStoredContextUsage(null, 0).totalTokens, 0);
});
