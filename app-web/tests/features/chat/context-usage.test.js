import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureContextTotalTokens, createEmptyContextUsage, mergeContextUsage,
  normalizeContextUsage, loadStoredContextUsage, saveStoredContextUsage,
  estimateContextUsageFromConversationDetail, contextUsageFromRuntimeEvent,
} from '../../../src/features/chat/model/context-usage.js';
import { createTaskStreamHandlers } from '../../../src/features/tasks/hooks/createTaskStreamHandlers.js';
import {
  normalizeRuntimeEvent, STREAM_IMMEDIATE_EVENT_TYPES, STREAM_EVENT_BATCH_MS,
  CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
} from '../../../src/features/tasks/model/runtime-events.js';

const CONVERSATION_ID = 'compaction-conversation';
const CONTEXT_LIMIT = 256000;
const BEFORE_TOKENS = 228140;
const AFTER_TOKENS = 32883;
const PROVIDER_TOKENS = 34515;
const STALE_TOKENS = 80846;
const PROJECTED_TOKENS = 350874;
const EARLIER = '2026-01-01T00:00:00Z';
const LATER = '2026-01-01T00:01:00Z';
const recordedUsage = (overrides = {}) => normalizeContextUsage({
  conversationId: CONVERSATION_ID, usedTokens: AFTER_TOKENS,
  totalTokens: CONTEXT_LIMIT, compressed: true, updatedAt: LATER, ...overrides,
});
const usageEvent = (usedTokens, timestamp = EARLIER) => ({
  type: 'context_usage_updated', created_at: timestamp,
  payload: {
    source: 'provider_usage', prompt_tokens: usedTokens,
    used_tokens: usedTokens + 668, total_tokens: CONTEXT_LIMIT,
  },
});
const compactedEvent = (overrides = {}) => ({
  type: 'context_compaction_completed', created_at: LATER,
  payload: { used_tokens: BEFORE_TOKENS, prompt_tokens_after_compaction: AFTER_TOKENS,
    total_tokens: CONTEXT_LIMIT, skipped: false, message_count: 341, ...overrides },
});

// Exercise the public stream consumer with an offline realtime bridge, not a copied reducer.
async function replayUsageEvents(events, { background = false } = {}) {
  let task = { taskId: 'compaction-task', title: 'Continue', originViewMode: 'chat', eventLog: [] };
  const runtime = { cancelledRunIds: new Set(), taskRuntimeState: {} };
  const displayed = [];
  const saved = [];
  const handlers = createTaskStreamHandlers({
    API_BASE: '', conversationId: CONVERSATION_ID,
    conversationIdRef: { current: background ? 'another-conversation' : CONVERSATION_ID },
    streamTargetConvIdRef: { current: null },
    userCancelledTaskIdsRef: { current: new Set() }, chatFinalizedTaskIdsRef: { current: new Set() },
    STREAM_IMMEDIATE_EVENT_TYPES, STREAM_EVENT_BATCH_MS, CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    activeRuntimeTargetConvId: (id) => id,
    getRuntime: () => runtime, mutateRuntime: (_id, update) => update(runtime),
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    setRuntimeFetchController: (controller) => { runtime.fetchController = controller; },
    setRuntimeActiveTaskId: (id) => { runtime.activeTaskId = id; },
    ensureTaskForEvent: () => task.taskId, getTaskById: () => task,
    updateTaskById: (_id, update) => { task = update(task); },
    getChatProgressLine: () => '', batchRuntimeMutations: (_id, update) => update(),
    normalizeRuntimeEvent, normalizeContextUsage, buildApiHeaders: () => ({}),
    setContextUsage: (usage) => displayed.push(usage), saveStoredContextUsage: (usage) => saved.push(usage),
    runTaskStream: async (_command, onEvent) => {
      for (const event of events) onEvent({
        ...event, task_id: task.taskId, conversation_id: CONVERSATION_ID,
      });
    },
  });
  await handlers.executeQuest(task, CONVERSATION_ID);
  return { displayed, saved };
}

test('compaction updates the live meter before the next provider usage calibrates it', async () => {
  const { displayed, saved } = await replayUsageEvents([
    usageEvent(BEFORE_TOKENS), compactedEvent(), usageEvent(PROVIDER_TOKENS, LATER),
  ]);
  assert.deepEqual(displayed.map(usage => usage.usedTokens), [BEFORE_TOKENS, AFTER_TOKENS, PROVIDER_TOKENS]);
  assert.deepEqual(saved, displayed);
  assert.equal(displayed[1].ratio, AFTER_TOKENS / CONTEXT_LIMIT);
  assert.equal(displayed[1].compressed, true);
});

test('compaction start never replaces the last actual provider measurement', async () => {
  const started = { type: 'context_compaction_started', created_at: LATER, payload: {
    total_prompt_tokens: PROJECTED_TOKENS, context_window_tokens: CONTEXT_LIMIT,
  } };
  const { displayed, saved } = await replayUsageEvents([usageEvent(STALE_TOKENS), started, compactedEvent()]);
  assert.deepEqual(displayed.map(usage => usage.usedTokens), [STALE_TOKENS, AFTER_TOKENS]);
  assert.equal(displayed[1].totalTokens, CONTEXT_LIMIT);
  assert.equal(displayed[1].compressed, true);
  assert.deepEqual(saved, displayed);
  const background = await replayUsageEvents([started], { background: true });
  assert.deepEqual(background.displayed, []);
  assert.deepEqual(background.saved, []);
});

test('compaction start is not a context measurement', () => {
  for (const counts of [
    { total_prompt_tokens: PROJECTED_TOKENS, used_tokens: STALE_TOKENS },
    { projected_input_tokens: PROJECTED_TOKENS, used_tokens: STALE_TOKENS },
    { used_tokens: PROJECTED_TOKENS },
  ]) {
    assert.equal(contextUsageFromRuntimeEvent({ type: 'context_compaction_started', ...counts }), null);
  }
});

test('background compaction persists its meter without changing the active conversation', async () => {
  const { displayed, saved } = await replayUsageEvents([compactedEvent()], { background: true });
  assert.deepEqual(displayed, []);
  assert.equal(saved[0]?.conversationId, CONVERSATION_ID);
  assert.equal(saved[0]?.usedTokens, AFTER_TOKENS);
});

test('skipped, failed, blocked or invalid compaction never resets the meter', async () => {
  const { saved } = await replayUsageEvents([
    usageEvent(BEFORE_TOKENS), compactedEvent({ skipped: true }),
    { ...compactedEvent(), type: 'context_compaction_failed' },
    compactedEvent({ business_llm_blocked: true }),
    ...[null, 0, -1, 'invalid'].map(value => compactedEvent({ prompt_tokens_after_compaction: value })),
  ]);
  assert.deepEqual(saved.map(usage => usage.usedTokens), [BEFORE_TOKENS]);
});

test('pre-flight compaction uses the configured context window when the event omits it', async () => {
  configureContextTotalTokens(CONTEXT_LIMIT);
  try {
    const { saved } = await replayUsageEvents([compactedEvent({ total_tokens: undefined })]);
    assert.equal(saved[0]?.totalTokens, CONTEXT_LIMIT);
    assert.equal(saved[0]?.usedTokens, AFTER_TOKENS);
  } finally { configureContextTotalTokens(0); }
});

test('restoring a conversation preserves recorded usage instead of the larger history estimate', () => {
  const latest = recordedUsage();
  const estimate = estimateContextUsageFromConversationDetail({
    conversation_id: CONVERSATION_ID,
    messages: [{ content: '文'.repeat(BEFORE_TOKENS) }, {}],
    tasks: [{ title: 'Inspect', description: 'History', answer_text: 'Verified' }, {}],
  });
  assert.ok(estimate.usedTokens > latest.usedTokens);
  assert.equal(mergeContextUsage(latest, estimate).usedTokens, AFTER_TOKENS);
  assert.equal(mergeContextUsage(latest, estimate).compressed, true);
});

test('recorded snapshots are ordered by timestamp rather than their token count', () => {
  const earlier = recordedUsage({ usedTokens: BEFORE_TOKENS, updatedAt: EARLIER });
  const latest = recordedUsage();
  assert.equal(mergeContextUsage(earlier, latest).usedTokens, AFTER_TOKENS);
  assert.equal(mergeContextUsage(latest, earlier).usedTokens, AFTER_TOKENS);
});

test('empty or invalid saved usage falls back to the current estimate', () => {
  const estimate = normalizeContextUsage({ usedTokens: AFTER_TOKENS, totalTokens: CONTEXT_LIMIT });
  for (const primary of [null, createEmptyContextUsage(CONVERSATION_ID), recordedUsage({ usedTokens: -1 }),
    { ...recordedUsage(), valid: false }, recordedUsage({ updatedAt: 'invalid' })]) {
    assert.equal(mergeContextUsage(primary, estimate).usedTokens, AFTER_TOKENS);
  }
});

test('a recorded zero is valid and survives local storage and restore', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } };
  configureContextTotalTokens(CONTEXT_LIMIT);
  try {
    saveStoredContextUsage(recordedUsage({ usedTokens: 0 }));
    const restored = mergeContextUsage(loadStoredContextUsage(CONVERSATION_ID), recordedUsage({ updatedAt: null }));
    assert.equal(restored.usedTokens, 0);
    assert.equal(restored.totalTokens, CONTEXT_LIMIT);
    assert.equal(restored.updatedAt, LATER);
    saveStoredContextUsage(recordedUsage({ usedTokens: -1 }));
    assert.equal(loadStoredContextUsage(CONVERSATION_ID).valid, false);
  } finally {
    globalThis.window = previousWindow;
    configureContextTotalTokens(0);
  }
});

test('provider usage reports input only, so generated output tokens never inflate the meter', async () => {
  const completionTokens = 6986;
  const { displayed, saved } = await replayUsageEvents([
    { type: 'context_usage_updated', created_at: EARLIER, payload: {
      source: 'provider_usage', prompt_tokens: PROVIDER_TOKENS, completion_tokens: completionTokens,
      // 缓存命中的输入本来就算在 prompt_tokens 里（命中 + 未命中 = prompt_tokens），不能再加一遍。
      cached_tokens: PROVIDER_TOKENS - 1000, used_tokens: PROVIDER_TOKENS + completionTokens,
      total_tokens: CONTEXT_LIMIT,
    } },
  ]);
  assert.deepEqual(displayed.map(usage => usage.usedTokens), [PROVIDER_TOKENS]);
  assert.deepEqual(saved, displayed);
});

test('context builder estimates never become meter readings', () => {
  // 构建阶段的计数不含 provider tools 声明，也不等于真实输入量；表盘只认
  // provider prompt_tokens 与压缩后实测值，所以这种 source 一律不更新。
  for (const usedTokens of [STALE_TOKENS, 0, -1]) {
    assert.equal(contextUsageFromRuntimeEvent({
      type: 'context_usage_updated', source: 'context_builder', used_tokens: usedTokens,
    }), null);
  }
});

test('restored conversation estimate is pure character counting without a base offset', () => {
  const estimate = estimateContextUsageFromConversationDetail({
    conversation_id: CONVERSATION_ID, messages: [{ content: 'abcd' }],
  });
  // 'abcd' → 1 token，加每条消息 24 的固定开销；不再叠加恢复基线。
  assert.equal(estimate.usedTokens, 25);
});

test('missing usage and unrelated events do not become zero-valued measurements', () => {
  for (const event of [{ type: 'run_started' }, { type: 'context_usage_updated' },
    { type: 'context_usage_updated', source: 'provider_usage', prompt_tokens: -1, used_tokens: 1 },
    { type: 'context_usage_updated', source: 'provider_usage', prompt_tokens: Infinity, used_tokens: 1 },
    { type: 'context_usage_updated', source: 'unknown_source', used_tokens: STALE_TOKENS }]) {
    assert.equal(contextUsageFromRuntimeEvent(event), null);
  }
  assert.equal(estimateContextUsageFromConversationDetail(null).usedTokens, 0);
  assert.equal(estimateContextUsageFromConversationDetail({ conversation_id: CONVERSATION_ID }).usedTokens, 0);
  assert.equal(loadStoredContextUsage(null).usedTokens, 0);
  saveStoredContextUsage(null);
});

test('unavailable or malformed storage falls back without breaking conversation restore', (t) => {
  const previousWindow = globalThis.window;
  t.mock.method(console, 'warn', () => {});
  globalThis.window = { localStorage: {
    getItem: () => '{invalid JSON', setItem: () => { throw new Error('Storage unavailable'); },
  } };
  try {
    assert.equal(loadStoredContextUsage(CONVERSATION_ID).usedTokens, 0);
    assert.doesNotThrow(() => saveStoredContextUsage(recordedUsage()));
  } finally { globalThis.window = previousWindow; }
});
