import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureContextTotalTokens,
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

// 表盘的分母（当前上下文窗口）过去是一个模块级 `let`：只有 configureContextTotalTokens
// 写它，所有读取者把它当默认值——谁先设值决定表盘数字，而参数里完全看不出来。
// 下面先钉住改前行为：默认分母就是那个注入值，读回来的存档也按当前窗口归一。

const CONVERSATION_ID = 'context-window';
const WINDOW = 200000;
const STALE_WINDOW = 999;

function withLocalStorage(run) {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    return run(values);
  } finally {
    globalThis.window = previousWindow;
  }
}

test('the injected window is the denominator every reader falls back to', () => {
  configureContextTotalTokens(0);
  // 还没人注入窗口：空表盘分母是 0，比例 0，不判超限。
  const unconfigured = createEmptyContextUsage(CONVERSATION_ID);
  assert.equal(unconfigured.totalTokens, 0);
  assert.equal(unconfigured.ratio, 0);
  assert.equal(unconfigured.overLimit, false);

  configureContextTotalTokens(WINDOW);
  try {
    assert.equal(createEmptyContextUsage(CONVERSATION_ID).totalTokens, WINDOW);
    assert.equal(normalizeContextUsage({ usedTokens: WINDOW / 2 }).totalTokens, WINDOW);
    assert.equal(normalizeContextUsage({ usedTokens: WINDOW / 2 }).ratio, 0.5);
    assert.equal(normalizeContextUsage({ usedTokens: WINDOW + 1 }).overLimit, true);

    // 各条通道的读数都拿到同一个分母。
    assert.equal(contextUsageFromTask({ conversation_id: CONVERSATION_ID, context_used_tokens: 10 }).totalTokens, WINDOW);
    assert.equal(contextUsageFromConversationDetail({ conversation_id: CONVERSATION_ID, context_used_tokens: 10 }).totalTokens, WINDOW);
    assert.equal(estimateContextUsageFromConversationDetail({ conversation_id: CONVERSATION_ID, messages: [{ content: 'hi' }] }).totalTokens, WINDOW);
    assert.equal(latestContextUsageFromTasks([{ conversation_id: CONVERSATION_ID, context_used_tokens: 10 }]).totalTokens, WINDOW);

    // 存档里的分母是上一次的窗口：读回来按当前窗口重算，比例跟着变。
    withLocalStorage(() => {
      saveStoredContextUsage(normalizeContextUsage({
        conversationId: CONVERSATION_ID,
        usedTokens: 1000,
        totalTokens: STALE_WINDOW,
        updatedAt: '2026-01-01T00:00:00Z',
      }));
      const stored = loadStoredContextUsage(CONVERSATION_ID);
      assert.equal(stored.usedTokens, 1000);
      assert.equal(stored.totalTokens, WINDOW);
      assert.equal(stored.ratio, 1000 / WINDOW);
    });
  } finally {
    configureContextTotalTokens(0);
  }
});

test('the window reaches arbitration too, not just the producers', () => {
  configureContextTotalTokens(WINDOW);
  try {
    const withoutWindow = normalizeContextUsage({ conversationId: CONVERSATION_ID, usedTokens: 1000 });
    const merged = preferNewerContextUsage(createEmptyContextUsage(CONVERSATION_ID), withoutWindow);
    assert.equal(merged.totalTokens, WINDOW);
    assert.equal(merged.ratio, 1000 / WINDOW);
  } finally {
    configureContextTotalTokens(0);
  }
});

test('a caller can state the window in its own signature instead of inheriting the injected one', () => {
  // 没注入任何窗口，所有分母只能来自参数：读代码就能看出谁定的分母。
  configureContextTotalTokens(0);
  const task = { conversation_id: CONVERSATION_ID, context_used_tokens: WINDOW / 4 };
  const detail = { conversation_id: CONVERSATION_ID, context_used_tokens: WINDOW / 4, messages: [{ content: 'hi' }] };
  try {
    assert.equal(createEmptyContextUsage(CONVERSATION_ID, WINDOW).totalTokens, WINDOW);
    assert.equal(normalizeContextUsage({ usedTokens: WINDOW / 2 }, null, WINDOW).ratio, 0.5);
    assert.equal(contextUsageFromTask(task, null, WINDOW).ratio, 0.25);
    assert.equal(contextUsageFromConversationDetail(detail, null, WINDOW).ratio, 0.25);
    assert.equal(estimateContextUsageFromConversationDetail(detail, WINDOW).totalTokens, WINDOW);
    assert.equal(latestContextUsageFromTasks([task], null, WINDOW).ratio, 0.25);
    assert.equal(
      preferNewerContextUsage(
        createEmptyContextUsage(CONVERSATION_ID, WINDOW),
        normalizeContextUsage({ conversationId: CONVERSATION_ID, usedTokens: 1000 }),
        WINDOW,
      ).totalTokens,
      WINDOW,
    );

    withLocalStorage(() => {
      saveStoredContextUsage(normalizeContextUsage({
        conversationId: CONVERSATION_ID,
        usedTokens: 1000,
        updatedAt: '2026-01-01T00:00:00Z',
      }));
      assert.equal(loadStoredContextUsage(CONVERSATION_ID, WINDOW).totalTokens, WINDOW);
    });
  } finally {
    configureContextTotalTokens(0);
  }
});

test('the tracker keeps the window it was assembled with', () => {
  configureContextTotalTokens(WINDOW);
  try {
    const tracker = createContextUsageTracker({
      getActiveConversationId: () => CONVERSATION_ID,
      onChange: () => {},
      persist: () => {},
      load: (conversationId, contextWindowTokens) => createEmptyContextUsage(conversationId, contextWindowTokens),
    });
    // 装配之后再有人改模块里的默认值，也不该换掉这个表盘的分母。
    configureContextTotalTokens(0);
    tracker.reset(CONVERSATION_ID);
    assert.equal(tracker.read().totalTokens, WINDOW);

    tracker.setTotalTokens(100000);
    assert.equal(tracker.read().totalTokens, 100000);
    assert.equal(tracker.read().ratio, 0);
  } finally {
    configureContextTotalTokens(0);
  }
});
