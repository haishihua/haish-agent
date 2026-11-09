// CSS Custom Highlight API 全局只有一张登记表：同名互相覆盖，按名删除，谁都能删谁的名字。
// 批注（MessageAnnotations）和会话搜索（ConversationSearch）都往这张表里写，过去各自
// 拿着字符串字面量 set / delete——名字或清理顺序改一处，一方的 cleanup 就会把另一方
// 的高亮一起擦掉。所以名字与读写入口都收在这里：每个名字只属于一个特性，清理按归属分组
// 进行，一组清不到另一组。

export const HIGHLIGHT_NAMES = Object.freeze({
  // 批注：跳转到某条批注时的高亮 / 全部批注的范围。
  annotationFocus: 'annotation-focus',
  messageAnnotations: 'message-annotations',
  // 会话搜索：全部命中的高亮 / 当前选中的那一条（优先级更高）。
  conversationMatches: 'conversation-matches',
  conversationActiveMatch: 'conversation-active-match',
});

// 归属表：一个名字只能出现在一个组里（测试锁住这条），所以一方整组清理时不可能碰到另一方的。
export const HIGHLIGHT_GROUPS = Object.freeze({
  annotations: Object.freeze([HIGHLIGHT_NAMES.annotationFocus, HIGHLIGHT_NAMES.messageAnnotations]),
  conversationSearch: Object.freeze([
    HIGHLIGHT_NAMES.conversationMatches,
    HIGHLIGHT_NAMES.conversationActiveMatch,
  ]),
});

/** 浏览器不支持 Custom Highlight API 时（旧内核 / 测试环境）所有登记都是无操作。 */
function highlightRegistry() {
  return globalThis.CSS?.highlights ?? null;
}

export function highlightSupported() {
  return Boolean(highlightRegistry()) && typeof globalThis.Highlight === 'function';
}

/**
 * 覆盖登记一个名字。ranges 为空时也登记一条空高亮——调用方刷新后一条范围都没有时，
 * 旧范围必须被顶掉，不能留在屏幕上。
 */
export function setHighlight(name, ranges = [], { priority = null } = {}) {
  if (!highlightSupported()) return false;
  const highlight = new globalThis.Highlight(...ranges);
  if (priority !== null) highlight.priority = priority;
  highlightRegistry().set(name, highlight);
  return true;
}

/** 只删给定的名字：调用方必须传自己登记过的名字（来自 HIGHLIGHT_NAMES）。 */
export function clearHighlights(names) {
  const registry = highlightRegistry();
  if (!registry) return;
  for (const name of names) registry.delete(name);
}

/** 按归属整组清理：组与组不相交，所以只可能清掉自己那几张高亮。 */
export function clearHighlightGroup(groupId) {
  clearHighlights(HIGHLIGHT_GROUPS[groupId] || []);
}
