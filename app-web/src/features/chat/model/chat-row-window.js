// 会话正文的行窗口：首屏只渲染最近 N 行，向上滚到接近列表顶再按页往前补。
//
// 挂载那一刻的成本（Markdown 解析 + 代码高亮）只跟「渲染了多少行」有关，跟屏幕
// 上能看到多少无关：长会话一次性铺全量，屏幕上只有最后一屏有用，屏幕外的部分是
// 白付的。窗口把这份成本改成按页支付——首批 + 每次向上滚一页。批注、↑ 历史回填、
//「最后一轮才能重试/编辑」这些判据仍然拿全量 messages，只有渲染被窗口化。
export const CHAT_ROW_WINDOW_INITIAL = 24;
export const CHAT_ROW_WINDOW_PAGE = 24;
// 离列表顶还有这么多像素就开始补页：等滚到 0 再补，用户会先看到一片空白。
export const CHAT_ROW_WINDOW_TRIGGER_PX = 400;
// 记住最近几个会话各自渲染到第几行：切回来接着看，而不是又退回最近 24 行。
export const CHAT_ROW_WINDOW_MEMORY = 4;

/** 窗口行数是计数，不是索引：负数、小数、Infinity 都收拢成合法值（Infinity = 全部）。 */
export function clampRowWindow(count, total) {
  const limit = Array.isArray(total) ? total.length : Number(total);
  const size = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  const requested = Number(count);
  if (!Number.isFinite(requested)) return size;
  return Math.min(Math.max(0, Math.floor(requested)), size);
}

/** 取最后 count 行（最新的一批）；窗口盖住全量时原样返回，避免白白复制数组。 */
export function windowRows(rows, count) {
  const list = Array.isArray(rows) ? rows : [];
  const size = clampRowWindow(count, list);
  return size >= list.length ? list : list.slice(list.length - size);
}

/** 补一页，最多到全量。 */
export function growRowWindow(count, total) {
  const size = clampRowWindow(count, total);
  return Math.min(size + CHAT_ROW_WINDOW_PAGE, Array.isArray(total) ? total.length : Math.max(size, Number(total) || size));
}

// 批注、搜索命中这类「跳到某一行」的目标可能落在窗口外：窗口只盖尾部，所以一次补到
// 盖住目标行即可（index 是 0 基行号，从尾部往前数）。找不到就维持原窗口。
export function rowWindowCovering(index, total) {
  const limit = Array.isArray(total) ? total.length : Number(total);
  const line = Number(index);
  if (!Number.isFinite(line) || line < 0) return clampRowWindow(total, total);
  return clampRowWindow(Math.ceil(limit) - Math.floor(line), limit);
}

/** 滚动位置是否已经进入补页区间。 */
export function shouldGrowRowWindow(scrollTop, triggerPx = CHAT_ROW_WINDOW_TRIGGER_PX) {
  const top = Number(scrollTop);
  const trigger = Number(triggerPx);
  if (!Number.isFinite(top) || !Number.isFinite(trigger)) return false;
  return top <= trigger;
}

// 视口里那几行「执行记录还没回拉」的任务（行上有 data-trace-pending）。
//
// 回拉要看的是这几行，而不是待补水队列里最新的一页：两者在长会话里是反的——
// 最新一页永远在视口下方。以前在会话顶部也按队列从新往旧翻，看得见的行一直补不到，
// 于是一个手势之后整条历史被一页页翻完（界面上就是一直转圈 + 内容抽搐）。
// 留在原地的上一会话行组是 display:none，没有布局盒子，自然不算可见。
export function visiblePendingTaskIdsIn(container, viewport, taskIdByRowId, lookaheadPx = CHAT_ROW_WINDOW_TRIGGER_PX) {
  if (!container || !viewport) return [];
  const lookahead = Number.isFinite(Number(lookaheadPx)) ? Number(lookaheadPx) : 0;
  const ids = [];
  for (const row of container.querySelectorAll('[data-trace-pending]')) {
    if (!row.getClientRects().length) continue;
    const rect = row.getBoundingClientRect();
    if (rect.bottom < viewport.top || rect.top > viewport.bottom + lookahead) continue;
    const taskId = taskIdByRowId?.get?.(String(row.dataset?.messageId || ''));
    if (taskId && !ids.includes(taskId)) ids.push(taskId);
  }
  return ids;
}

/** 记住某个会话渲染到第几行（超出 limit 的老会话被丢掉，内存有界）。 */
export function rememberRowWindow(memory, conversationId, count, limit = CHAT_ROW_WINDOW_MEMORY) {
  if (!memory || typeof memory.set !== 'function' || !conversationId) return memory;
  const size = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : CHAT_ROW_WINDOW_INITIAL;
  memory.delete(conversationId);
  memory.set(conversationId, size);
  const max = Number.isFinite(Number(limit)) ? Math.max(1, Math.floor(Number(limit))) : CHAT_ROW_WINDOW_MEMORY;
  while (memory.size > max) memory.delete(memory.keys().next().value);
  return memory;
}

/** 读回某个会话的行窗口；没记过（或记的是坏值）就回到首屏窗口。 */
export function recallRowWindow(memory, conversationId, fallback = CHAT_ROW_WINDOW_INITIAL) {
  const value = memory && typeof memory.get === 'function' ? Number(memory.get(conversationId)) : Number.NaN;
  return Number.isFinite(value) && value >= CHAT_ROW_WINDOW_INITIAL ? value : fallback;
}
