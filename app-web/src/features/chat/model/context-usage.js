import { CONTEXT_USAGE_STORAGE_KEY } from '../../../shared/api/client.js';

let runtimeContextTotalTokens = 0;

export function configureContextTotalTokens(value) {
  runtimeContextTotalTokens = Math.max(0, Math.round(Number(value) || 0));
  return runtimeContextTotalTokens;
}

export function normalizeContextUsage(value, fallbackConversationId = null) {
  const rawUsedValue = Number(value?.contextUsedTokens ?? value?.context_used_tokens ?? value?.usedTokens ?? value?.used_tokens ?? 0);
  const rawUsedTokens = Math.max(0, Math.round(rawUsedValue || 0));
  const totalTokens = Math.max(0, Math.round(Number(value?.contextTotalTokens ?? value?.context_total_tokens ?? value?.totalTokens ?? value?.total_tokens ?? value?.effective_budget ?? runtimeContextTotalTokens) || runtimeContextTotalTokens));
  const valid = value?.valid !== false && Number.isFinite(rawUsedValue) && rawUsedValue >= 0;
  const usedTokens = valid ? rawUsedTokens : 0;
  const compressedCount = Math.max(0, Math.round(Number(value?.compressedCount ?? value?.compressed_count ?? 0) || 0));
  // 估算值是按消息正文长度猜的（还会把消息正文和任务答复重复计一遍），长会话必然
  // 虚高；它只能当占位展示，不能当"真的超了"的证据。
  const estimated = Boolean(value?.estimated);
  return {
    conversationId: value?.conversationId || value?.conversation_id || fallbackConversationId || null,
    usedTokens,
    totalTokens,
    ratio: Math.max(0, Math.min(1, totalTokens > 0 ? usedTokens / totalTokens : 0)),
    overLimit: totalTokens > 0 && usedTokens > totalTokens && !estimated,
    compressed: Boolean(value?.compressed) || compressedCount > 0,
    compressedCount,
    valid,
    estimated,
    // 读数从哪来（仲裁时要用）：sample = 本会话里看到的实测采样（流 / 任务快照）；
    // conversation = 服务端会话级落盘值（没有采样时刻）；stored = 本地缓存的上一次读数；
    // estimate = 按正文长度猜的。
    source: value?.source || (estimated ? 'estimate' : null),
    updatedAt: value?.updatedAt || value?.updated_at || null,
  };
}

export function createEmptyContextUsage(conversationId = null) {
  return normalizeContextUsage({
    conversationId,
    usedTokens: 0,
    totalTokens: runtimeContextTotalTokens,
  }, conversationId);
}

export function contextUsageFromRuntimeEvent(event, fallbackConversationId = null) {
  const compacted = event.type === 'context_compaction_completed';
  // 压缩开始只表示“即将压缩”，其中的 projected/total_prompt_tokens 不是实际
  // 发给模型的输入，不能写入表盘；保持压缩前最后一次真实值。
  if (event.type === 'context_compaction_started') return null;
  if (!compacted && event.type !== 'context_usage_updated') return null;

  // 表盘只认 provider 实测输入量（prompt_tokens）；used_tokens 只是同一份
  // 数据的别名。其它 source（含构建阶段的估算）没有真实输入量，一律不更新。
  const usedTokens = compacted
    ? event.prompt_tokens_after_compaction
    : event.source === 'provider_usage'
      ? event.prompt_tokens
      : null;
  if (usedTokens == null || !Number.isFinite(Number(usedTokens)) || Number(usedTokens) < 0) return null;
  if (event.source === 'provider_usage' && Number(usedTokens) === 0) return null;
  if (compacted && (event.skipped || event.business_llm_blocked || Number(usedTokens) === 0)) return null;
  return normalizeContextUsage({
    conversationId: event.conversation_id || fallbackConversationId,
    usedTokens,
    totalTokens: event.context_total_tokens ?? event.totalTokens ?? event.total_tokens ?? event.context_window_tokens,
    compressed: compacted || event.compressed,
    compressedCount: compacted
      ? event.message_count ?? event.compacted_messages ?? event.compressed_count
      : event.compressed_count,
    updatedAt: event.created_at || event.timestamp || new Date().toISOString(),
    source: 'sample',
  }, fallbackConversationId);
}

export function loadStoredContextUsage(conversationId) {
  if (!conversationId) return createEmptyContextUsage(null);
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const stored = parsed?.[conversationId] || {};
    return normalizeContextUsage({
      ...stored,
      totalTokens: runtimeContextTotalTokens,
      // 本地存的是“上一次会话看到的读数”（缓存）：它可能已经过期好几天，所以仲裁时
      // 不冒充本会话的实测样本，服务端会话级实测值可以压过它。
      source: 'stored',
      // 只有真正落在 provider 采样上的读数才带时间戳；旧版本把无时间戳的历史估算
      // 也存进来过，这里把这类脏数据降级成"没有读数"（既有的 valid=false 保持不服从）。
      valid: stored?.valid !== false && Boolean(stored?.updatedAt),
    }, conversationId);
  } catch (error) {
    console.warn('Failed to load context usage:', error);
    return createEmptyContextUsage(conversationId);
  }
}

export function saveStoredContextUsage(usage) {
  // 存档只放“下次真能读回来的读数”：估算值会在下次打开会话时冒充真实读数，空读数
  // 没东西可记；没有采样时刻的读数（服务端会话级落盘值）读回来会被 loadStoredContextUsage
  // 判成“没有读数”——把它写进去只会顶掉上一次能用的真实读数，让表盘下次读成 0k。
  if (!usage?.conversationId || usage?.estimated || !(usage?.usedTokens > 0)) return;
  if (!usage?.updatedAt) return;
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[usage.conversationId] = usage;
    window.localStorage.setItem(CONTEXT_USAGE_STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.warn('Failed to save context usage:', error);
  }
}

function estimateTextTokens(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  let cjk = 0;
  let latin = 0;
  for (const char of value) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) cjk += 1;
    else if (!/\s/u.test(char)) latin += 1;
  }
  return Math.ceil(cjk + (latin / 4));
}

export function estimateContextUsageFromConversationDetail(detail) {
  if (!detail?.conversation_id) return createEmptyContextUsage(null);
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : [];
  let usedTokens = messages.reduce((total, message) => (
    total + estimateTextTokens(message?.content) + 24
  ), 0);
  usedTokens += tasks.reduce((total, task) => (
    total
    + estimateTextTokens(task?.title)
    + estimateTextTokens(task?.description)
    + estimateTextTokens(task?.answer_text)
    + 16
  ), 0);
  return normalizeContextUsage({
    conversationId: detail.conversation_id,
    usedTokens,
    totalTokens: runtimeContextTotalTokens,
    // 标成估算：可以在没有实测值时展示（前缀 ~），但不参与超限判定。
    estimated: true,
    source: 'estimate',
  }, detail.conversation_id);
}

/**
 * 服务端落盘的最后一次实测输入量（任务收尾写入，fork 会继承分叉点那一轮的采样）。
 * 这份读数没有采样时刻（它可能来自 fork 继承，不是本会话刚跑出来的），所以只当
 * “没有带时刻的读数可用”时的兜底；没有实测值时返回空表盘。
 */
export function contextUsageFromConversationDetail(detail, fallbackConversationId = null) {
  const conversationId = detail?.conversation_id || fallbackConversationId || null;
  const measured = Number(detail?.context_used_tokens ?? detail?.contextUsedTokens);
  if (!Number.isFinite(measured) || measured <= 0) return createEmptyContextUsage(conversationId);
  return normalizeContextUsage({
    conversationId,
    usedTokens: measured,
    totalTokens: runtimeContextTotalTokens,
    // 服务端会话级落盘值没有采样时刻（它可能来自 fork 继承）：只当“没有带时刻的
    // 读数可用”时的服务端真相，压过本地缓存，但压不过本会话里看到的实测采样。
    source: 'conversation',
  }, conversationId);
}

/**
 * 任务记录上的实测快照（服务端在流、轮询、恢复、详情各条通道上都带这一份）：
 * 值 + 采样时刻。没有采样过的任务返回空表盘，由调用方决定退回哪个来源。
 */
export function contextUsageFromTask(task, fallbackConversationId = null) {
  const conversationId = task?.conversation_id || task?.conversationId || fallbackConversationId || null;
  const measured = Number(task?.context_used_tokens ?? task?.contextUsedTokens);
  if (!Number.isFinite(measured) || measured <= 0) return createEmptyContextUsage(conversationId);
  return normalizeContextUsage({
    conversationId,
    usedTokens: measured,
    totalTokens: runtimeContextTotalTokens,
    updatedAt: task?.context_used_tokens_at || task?.contextUsedTokensAt || null,
    source: 'sample',
  }, conversationId);
}

/** 一组任务里最新的那一份实测读数（同一会话内的任务，按采样时刻取新）。 */
export function latestContextUsageFromTasks(tasks, fallbackConversationId = null) {
  let latest = createEmptyContextUsage(fallbackConversationId);
  for (const task of Array.isArray(tasks) ? tasks : []) {
    latest = preferNewerContextUsage(latest, contextUsageFromTask(task, fallbackConversationId));
  }
  return latest;
}

/**
 * 表盘读数仲裁（唯一出口）：
 * - 估算永远压不过实测，实测永远压过估算；
 * - 两边都带采样时刻 → 新的胜（压缩后的回落因此天然生效，旧响应永远盖不住新值）；
 * - 一边带时刻：带时刻的胜，除非“带时刻”的那一侧只是本地缓存、而对面是服务端
 *   会话级实测值——缓存可能已经过期好几天（200k / 256k 那次就是这样），
 *   服务端会话级值则是服务端自己的最后一次实测；
 * - 两边都没时刻：保持现有读数（不拿没证据的值换来换去）。
 */
export function preferNewerContextUsage(current, candidate) {
  const candidateConversationId = candidate?.conversationId
    || candidate?.conversation_id
    || null;
  const currentConversationId = current?.conversationId
    || current?.conversation_id
    || null;
  const next = normalizeContextUsage(candidate, candidateConversationId || currentConversationId);
  // prev 保留自己的会话 id（可能是 null）：空读数不靠一次比较就偷偷换上别人的 id，
  // 否则“读数没变”的判定会被一次归一化动作打破，“换会话”由调用方显式处理。
  const prev = normalizeContextUsage(current, currentConversationId);
  if (currentConversationId && next.conversationId && currentConversationId !== next.conversationId) {
    return next;
  }
  const nextHasReading = next.valid && next.usedTokens > 0;
  const prevHasReading = prev.valid && prev.usedTokens > 0;
  if (!nextHasReading) return prev;
  if (!prevHasReading) return next;
  if (prev.estimated !== next.estimated) return next.estimated ? prev : next;
  const nextTime = Date.parse(next.updatedAt) || 0;
  const prevTime = Date.parse(prev.updatedAt) || 0;
  if (nextTime && prevTime) {
    if (nextTime < prevTime) return prev;
    // 同一时刻：值也一样就保留原来那一份（调用方据此判断"读数没变"，不会白重渲染）。
    if (nextTime === prevTime && sameContextReading(prev, next)) return prev;
    return next;
  }
  if (nextTime && !prevTime) {
    // 对面是服务端会话级值、而这一侧只是本地缓存时，让服务端的赢。
    return prev.source === 'conversation' && next.source === 'stored' ? prev : next;
  }
  if (!nextTime && prevTime) {
    return next.source === 'conversation' && prev.source === 'stored' ? next : prev;
  }
  return prev;
}

/** 两条读数是不是同一条（值 + 采样时刻 + 估算标记）：用来跳过重复落盘。 */
function sameContextReading(left, right) {
  return Boolean(left && right)
    && left.conversationId === right.conversationId
    && left.usedTokens === right.usedTokens
    && left.totalTokens === right.totalTokens
    && left.updatedAt === right.updatedAt
    && left.estimated === right.estimated;
}

/**
 * 表盘读数的唯一写入入口。渲染层（AppShell）只负责把 React state 和
 * localStorage 接上：当前会话的读数改 state + 落盘，后台会话只落盘，等切回去时
 * 复用同一份。所有通道（实时流 / 任务轮询 / 恢复分页 / 会话激活 / fork）都调
 * apply，仲裁全在 preferNewerContextUsage 里——旧响应、陈旧本地值都盖不住新读数，
 * 压缩后的回落天然生效。
 */
export function createContextUsageTracker({
  getActiveConversationId = () => null,
  onChange = () => {},
  persist = saveStoredContextUsage,
  load = loadStoredContextUsage,
} = {}) {
  let current = createEmptyContextUsage(null);

  function commit(next) {
    current = next;
    onChange(next);
    return next;
  }

  function read() {
    return current;
  }

  function apply(candidate, { ownerConversationId = null } = {}) {
    if (!candidate) return current;
    const activeConversationId = getActiveConversationId?.() || null;
    const targetConversationId = candidate.conversationId
      || candidate.conversation_id
      || ownerConversationId
      || activeConversationId;
    if (!targetConversationId) return current;
    const normalizedCandidate = normalizeContextUsage(candidate, targetConversationId);
    const candidateHasReading = normalizedCandidate.valid && normalizedCandidate.usedTokens > 0;
    if (targetConversationId !== activeConversationId) {
      // 不是当前显示的会话：只把读数记下来（没有读数不写），已经落盘的是同一条
      // 就不再重复写 localStorage（后台轮询两秒一次）。
      if (!candidateHasReading) return current;
      const stored = load(targetConversationId);
      const merged = preferNewerContextUsage(stored, normalizedCandidate);
      if (!sameContextReading(stored, merged)) persist(merged);
      return current;
    }
    if (current.conversationId && current.conversationId !== targetConversationId) {
      // 换会话：无条件替换（新会话没读数就是空表盘）。上一个会话的数字不能留在屏幕上，
      // 这不受“后到的读数更新”约束。
      if (!candidateHasReading || normalizedCandidate.estimated) return commit(normalizedCandidate);
      persist(normalizedCandidate);
      return commit(normalizedCandidate);
    }
    const merged = preferNewerContextUsage(current, normalizedCandidate);
    // 读数没变就不写 state：两秒一次的轮询不该把界面重渲染一遍。preferNewerContextUsage
    // 返回的是新对象（比较用的是里面的读数），所以这里按内容判，不按引用判。
    if (sameContextReading(current, merged)) return current;
    // 估算值只做占位展示：落盘会在下次打开会话时冒充真实读数。
    if (merged.estimated) return commit(merged);
    persist(merged);
    return commit(merged);
  }

  /** 新建/切到空白会话：换一块空表盘（不写存储，历史会话的读数不受影响）。 */
  function reset(conversationId = null) {
    return commit(createEmptyContextUsage(conversationId));
  }

  /** 配置里的上下文窗口变了：只换分母，分子还是上一次实测值。 */
  function setTotalTokens(value) {
    configureContextTotalTokens(value);
    const totalTokens = Math.max(0, Math.round(Number(value) || 0));
    if (!(totalTokens > 0)) return current;
    const splitByTotalTokens = (usage) => normalizeContextUsage({ ...usage, totalTokens }, usage?.conversationId || null);
    if (current.estimated) {
      // 估算值不落盘：它只是现场算出来的占位数字。
      return commit(splitByTotalTokens(current));
    }
    const next = commit(splitByTotalTokens(current));
    persist(next);
    return next;
  }

  return { apply, read, reset, setTotalTokens };
}
