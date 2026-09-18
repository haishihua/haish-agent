import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureContextTotalTokens, createEmptyContextUsage, createContextUsageTracker,
  preferNewerContextUsage, latestContextUsageFromTasks, contextUsageFromTask,
  normalizeContextUsage, loadStoredContextUsage, saveStoredContextUsage,
  estimateContextUsageFromConversationDetail, contextUsageFromRuntimeEvent,
  contextUsageFromConversationDetail,
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
  // 表盘唯一写入入口（AppShell 里的那个工厂）：线上流、后台流都走它。
  const tracker = createContextUsageTracker({
    getActiveConversationId: () => (background ? 'another-conversation' : CONVERSATION_ID),
    onChange: (usage) => displayed.push(usage),
    persist: (usage) => saved.push(usage),
    load: () => createEmptyContextUsage(CONVERSATION_ID),
  });
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
    applyContextUsage: (candidate, options) => tracker.apply(candidate, options),
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
  assert.equal(preferNewerContextUsage(latest, estimate).usedTokens, AFTER_TOKENS);
  assert.equal(preferNewerContextUsage(latest, estimate).compressed, true);
});

test('recorded snapshots are ordered by timestamp rather than their token count', () => {
  const earlier = recordedUsage({ usedTokens: BEFORE_TOKENS, updatedAt: EARLIER });
  const latest = recordedUsage();
  assert.equal(preferNewerContextUsage(earlier, latest).usedTokens, AFTER_TOKENS);
  assert.equal(preferNewerContextUsage(latest, earlier).usedTokens, AFTER_TOKENS);
});

test('empty or invalid saved usage falls back to the current estimate', () => {
  const estimate = normalizeContextUsage({ usedTokens: AFTER_TOKENS, totalTokens: CONTEXT_LIMIT });
  for (const primary of [null, createEmptyContextUsage(CONVERSATION_ID), recordedUsage({ usedTokens: -1 }),
    { ...recordedUsage(), valid: false }, recordedUsage({ updatedAt: 'invalid' })]) {
    assert.equal(preferNewerContextUsage(primary, estimate).usedTokens, AFTER_TOKENS);
  }
});

test('a zero or negative reading is not a reading and never lands in storage', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } };
  configureContextTotalTokens(CONTEXT_LIMIT);
  try {
    // provider 报 0 只说明这次没采到数，不是"上下文空了"。
    saveStoredContextUsage(recordedUsage({ usedTokens: 0 }));
    saveStoredContextUsage(recordedUsage({ usedTokens: -1 }));
    assert.equal(values.size, 0);
    assert.equal(loadStoredContextUsage(CONVERSATION_ID).usedTokens, 0);
    assert.equal(loadStoredContextUsage(CONVERSATION_ID).valid, false);

    // 真读数才落盘，并且分母按当前窗口归一。
    saveStoredContextUsage(recordedUsage());
    const restored = loadStoredContextUsage(CONVERSATION_ID);
    assert.equal(restored.usedTokens, AFTER_TOKENS);
    assert.equal(restored.totalTokens, CONTEXT_LIMIT);
    assert.equal(restored.updatedAt, LATER);
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

test('history estimates are marked as estimates and never read as over limit', () => {
  configureContextTotalTokens(CONTEXT_LIMIT);
  try {
    const estimate = estimateContextUsageFromConversationDetail({
      conversation_id: CONVERSATION_ID, messages: [{ content: '文'.repeat(CONTEXT_LIMIT) }],
    });
    assert.equal(estimate.estimated, true);
    assert.ok(estimate.usedTokens > CONTEXT_LIMIT);
    assert.equal(estimate.totalTokens, CONTEXT_LIMIT);
    assert.equal(estimate.overLimit, false);
  } finally { configureContextTotalTokens(0); }

  // 只有 provider 实测值才可能把表盘标红。
  assert.equal(normalizeContextUsage({ usedTokens: CONTEXT_LIMIT + 1, totalTokens: CONTEXT_LIMIT }).overLimit, true);
  assert.equal(normalizeContextUsage(
    { usedTokens: CONTEXT_LIMIT + 1, totalTokens: CONTEXT_LIMIT, estimated: true },
  ).overLimit, false);
});

test('the measurement the backend persisted is a reading, an absent one is not zero', () => {
  configureContextTotalTokens(CONTEXT_LIMIT);
  try {
    const measured = contextUsageFromConversationDetail({
      conversation_id: CONVERSATION_ID, context_used_tokens: 71859,
      updated_at: '2026-09-18T02:07:28Z',
    });
    assert.equal(measured.usedTokens, 71859);
    assert.equal(measured.estimated, false);
    assert.equal(measured.totalTokens, CONTEXT_LIMIT);
    assert.equal(measured.overLimit, false);
    // 会话级落盘值没有采样时刻（可能是 fork 继承来的），只当"没有带时刻的读数"时的
    // 兜底；采样时刻只认任务记录里的 context_used_tokens_at。
    assert.equal(measured.updatedAt, null);

    // 没有实测值的会话（从没跑过、或老数据）给空表盘，由调用方去掉回估算。
    for (const detail of [
      { conversation_id: CONVERSATION_ID },
      { conversation_id: CONVERSATION_ID, context_used_tokens: 0 },
      { conversation_id: CONVERSATION_ID, context_used_tokens: null },
      { conversation_id: CONVERSATION_ID, context_used_tokens: 'unknown' },
      null,
    ]) {
      assert.equal(contextUsageFromConversationDetail(detail, CONVERSATION_ID).usedTokens, 0);
    }
  } finally { configureContextTotalTokens(0); }
});

test('estimates never reach local storage and legacy stored ones stop counting', () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } };
  configureContextTotalTokens(CONTEXT_LIMIT);
  try {
    saveStoredContextUsage(estimateContextUsageFromConversationDetail({
      conversation_id: CONVERSATION_ID, messages: [{ content: '文'.repeat(CONTEXT_LIMIT) }],
    }));
    assert.equal(values.size, 0);

    saveStoredContextUsage(recordedUsage());
    const [storageKey] = values.keys();
    // 旧版本存下来的历史估算：没有 provider 时间戳，不能当读数。
    values.set(storageKey, JSON.stringify({ [CONVERSATION_ID]: { usedTokens: 279256, totalTokens: CONTEXT_LIMIT } }));
    const restored = loadStoredContextUsage(CONVERSATION_ID);
    assert.equal(restored.usedTokens, 0);
    assert.equal(restored.valid, false);
    assert.equal(restored.overLimit, false);
  } finally {
    globalThis.window = previousWindow;
    configureContextTotalTokens(0);
  }
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

// —— 表盘唯一写入入口（所有通道都进这里）——

const TASK_SNAPSHOT_AT = '2026-09-18T06:06:18.704000Z';
const STALE_LOCAL_AT = '2026-09-17T18:04:22.077484Z';
const STALE_LOCAL_TOKENS = 199844;
const MEASURED_TASK_TOKENS = 50217;
const PRE_COMPACTION_AT = '2026-09-18T06:04:33.000000Z';
const PRE_COMPACTION_TOKENS = 229211;
const taskSnapshot = (tokens, at) => ({
  conversation_id: CONVERSATION_ID, context_used_tokens: tokens, context_used_tokens_at: at,
});
const createTracker = ({ activeConversationId = CONVERSATION_ID } = {}) => {
  const displayed = [];
  const persisted = [];
  const stored = new Map();
  let active = activeConversationId;
  const tracker = createContextUsageTracker({
    getActiveConversationId: () => active,
    onChange: (usage) => displayed.push(usage),
    // 和线上一样：persist 写进存储，load 从存储读回来——读回来的那份一定被降级成
    // “本地缓存”（source: stored），否则缓存会冒充本会话刚采到的样本。
    persist: (usage) => { persisted.push(usage); stored.set(usage.conversationId, usage); },
    load: (conversationId) => {
      const record = stored.get(conversationId);
      if (!record) return createEmptyContextUsage(conversationId);
      return normalizeContextUsage({ ...record, source: 'stored' }, conversationId);
    },
  });
  return { tracker, displayed, persisted, stored, setActive: (value) => { active = value; } };
};

test('a task snapshot carries its sampling time and only the newest one is a reading', () => {
  const tasks = [
    taskSnapshot(PRE_COMPACTION_TOKENS, PRE_COMPACTION_AT),
    taskSnapshot(MEASURED_TASK_TOKENS, TASK_SNAPSHOT_AT),
    { conversation_id: CONVERSATION_ID },
  ];
  const latest = latestContextUsageFromTasks(tasks, CONVERSATION_ID);
  assert.equal(latest.usedTokens, MEASURED_TASK_TOKENS);
  assert.equal(latest.updatedAt, TASK_SNAPSHOT_AT);
  // 没采样过的任务不是读数，也不会被当成 0。
  assert.equal(contextUsageFromTask({ conversation_id: CONVERSATION_ID }, CONVERSATION_ID).usedTokens, 0);
  assert.equal(latestContextUsageFromTasks(null, CONVERSATION_ID).usedTokens, 0);
});

test('the tracker lets a newer server snapshot replace a stale local record', () => {
  const { tracker, displayed, persisted } = createTracker();
  // 本地存着前一天的 200k（用户截图上的那个数）。
  tracker.apply(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: STALE_LOCAL_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: STALE_LOCAL_AT,
  }));
  assert.equal(tracker.read().usedTokens, STALE_LOCAL_TOKENS);

  // 服务端这一轮的实测快照（值更小、但更新）——盖掉旧读数。
  tracker.apply(latestContextUsageFromTasks([taskSnapshot(MEASURED_TASK_TOKENS, TASK_SNAPSHOT_AT)]));
  assert.equal(tracker.read().usedTokens, MEASURED_TASK_TOKENS);

  // 分页翻出更早的快照：表盘不动（旧值永远盖不住新值）。
  tracker.apply(latestContextUsageFromTasks([taskSnapshot(PRE_COMPACTION_TOKENS, PRE_COMPACTION_AT)]));
  assert.equal(tracker.read().usedTokens, MEASURED_TASK_TOKENS);

  // 没有采样过的任务：空候选不改变读数。
  tracker.apply(latestContextUsageFromTasks([{ conversation_id: CONVERSATION_ID }]));
  assert.equal(tracker.read().usedTokens, MEASURED_TASK_TOKENS);

  assert.deepEqual(displayed.map((usage) => usage.usedTokens), [STALE_LOCAL_TOKENS, MEASURED_TASK_TOKENS]);
  assert.deepEqual(persisted.map((usage) => usage.usedTokens), [STALE_LOCAL_TOKENS, MEASURED_TASK_TOKENS]);
});

test('a compaction that lowers the reading is accepted because it is newer', () => {
  const { tracker } = createTracker();
  tracker.apply(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: PRE_COMPACTION_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: PRE_COMPACTION_AT,
  }));
  tracker.apply(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: MEASURED_TASK_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: TASK_SNAPSHOT_AT, compressed: true,
  }));
  assert.equal(tracker.read().usedTokens, MEASURED_TASK_TOKENS);
  assert.equal(tracker.read().compressed, true);
});

test('background readings are only stored, then reused when that conversation is shown', () => {
  const { tracker, displayed, persisted, setActive } = createTracker({ activeConversationId: 'visible-conversation' });
  tracker.apply(
    latestContextUsageFromTasks([taskSnapshot(MEASURED_TASK_TOKENS, TASK_SNAPSHOT_AT)]),
    { ownerConversationId: CONVERSATION_ID },
  );
  assert.deepEqual(displayed, [], '后台会话不改当前表盘');
  assert.equal(persisted.at(-1).usedTokens, MEASURED_TASK_TOKENS);

  // 后台轮询每两秒回来一次：同一条读数不会反复落盘。
  const writesAfterFirstPoll = persisted.length;
  tracker.apply(latestContextUsageFromTasks([taskSnapshot(MEASURED_TASK_TOKENS, TASK_SNAPSHOT_AT)]));
  assert.equal(persisted.length, writesAfterFirstPoll);

  // 切回这个会话：直接复用同一份读数（激活时就地读本地存储）。
  setActive(CONVERSATION_ID);
  tracker.apply(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: MEASURED_TASK_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: TASK_SNAPSHOT_AT,
  }));
  assert.equal(displayed.at(-1).usedTokens, MEASURED_TASK_TOKENS);
  assert.equal(tracker.read().usedTokens, MEASURED_TASK_TOKENS);
});

test('the tracker shows an estimate as a placeholder but never stores it', () => {
  const { tracker, displayed, persisted } = createTracker();
  tracker.apply(estimateContextUsageFromConversationDetail({
    conversation_id: CONVERSATION_ID, messages: [{ content: '文'.repeat(CONTEXT_LIMIT) }],
  }));
  assert.equal(displayed.at(-1).estimated, true);
  assert.equal(displayed.at(-1).overLimit, false);
  assert.deepEqual(persisted, [], '估算不落盘');
});

test('a stale local cache never hides the newer measurement the server holds', () => {
  const { tracker, displayed, persisted, setActive } = createTracker({ activeConversationId: 'other-conversation' });
  // 上一次会话留下的本地读数：前一天晚上记下的 200k（截图上的那个数字）。
  setActive(CONVERSATION_ID);
  tracker.apply(normalizeContextUsage({
    conversationId: CONVERSATION_ID, usedTokens: STALE_LOCAL_TOKENS,
    totalTokens: CONTEXT_LIMIT, updatedAt: STALE_LOCAL_AT, source: 'stored',
  }));
  assert.equal(tracker.read().usedTokens, STALE_LOCAL_TOKENS);

  // 服务端会话级实测值（没有采样时刻）：服务端自己最后一次实测＝169,033。
  tracker.apply(contextUsageFromConversationDetail({
    conversation_id: CONVERSATION_ID, context_used_tokens: 169033,
    updated_at: '2026-09-18T06:23:41Z',
  }));
  assert.equal(tracker.read().usedTokens, 169033);
  assert.equal(persisted.at(-1).usedTokens, 169033);
  assert.deepEqual(displayed.map((usage) => usage.usedTokens), [STALE_LOCAL_TOKENS, 169033]);
});

test('but a sample seen in this session still outranks the server conversation value', () => {
  const { tracker, displayed } = createTracker();
  // 远端在跑、本机只是轮询/重连：会话级值还是压缩前的 229k，
  // 任务快照（压缩后实测 50k）一到就必须盖过它。
  tracker.apply(contextUsageFromConversationDetail({
    conversation_id: CONVERSATION_ID, context_used_tokens: PRE_COMPACTION_TOKENS,
    updated_at: '2026-09-18T06:06:30Z',
  }));
  tracker.apply(latestContextUsageFromTasks([taskSnapshot(MEASURED_TASK_TOKENS, TASK_SNAPSHOT_AT)]));
  assert.equal(tracker.read().usedTokens, MEASURED_TASK_TOKENS);
  assert.equal(displayed.at(-1).usedTokens, MEASURED_TASK_TOKENS);
});

test('a draft or empty conversation resets the meter without writing storage', () => {
  const { tracker, displayed, persisted } = createTracker();
  tracker.reset();
  assert.equal(tracker.read().usedTokens, 0);
  assert.equal(tracker.read().conversationId, null);
  assert.equal(displayed.at(-1).usedTokens, 0);
  assert.deepEqual(persisted, []);
});
