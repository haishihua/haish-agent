import { useCallback, useSyncExternalStore } from 'react';

/**
 * Keep unsent composer text scoped to a conversation id.
 * Switching conversations saves the previous draft and restores the next one
 * so typed-but-unsent messages never leak across chats.
 *
 * 草稿放在模块级外置 store 里，用 useSyncExternalStore 订阅，而不是挂在
 * AppShell 顶层的 React state：以前每敲一个字都会让整个 shell（侧边栏、
 * 消息面板、设置区）跟着重渲染，现在只有订阅草稿的 composer 自己重渲染。
 * AppShell 只拿 rekey/set 这类动作（不订阅值），打字完全不经过它。
 */

const drafts = new Map();
// draft-* 本地 id → 服务端 id 的别名（materialize 之后在途回调仍持旧 id）。
const aliases = new Map();
const listenersByConversation = new Map();
// useSyncExternalStore 要求快照引用稳定：按会话缓存字符串，写入时失效。
const snapshotCache = new Map();

function resolveId(id) {
  while (aliases.has(id)) id = aliases.get(id);
  return id;
}

function readSnapshot(id) {
  if (!snapshotCache.has(id)) snapshotCache.set(id, drafts.get(id) || '');
  return snapshotCache.get(id);
}

function emit(id) {
  snapshotCache.delete(id);
  listenersByConversation.get(id)?.forEach((listener) => listener());
}

function setConversationDraft(id, value) {
  const key = resolveId(id);
  const text = typeof value === 'function' ? value(drafts.get(key) || '') : value;
  if (text) drafts.set(key, text);
  else drafts.delete(key);
  emit(key);
}

function rekeyConversationDraft(fromId, toId) {
  fromId = resolveId(fromId);
  toId = resolveId(toId);
  if (!fromId || !toId || fromId === toId) return;
  // In-flight sends still hold the temporary ID after materialization.
  aliases.set(fromId, toId);
  // 注意不能再用 setConversationDraft(fromId, '')：它会被刚建立的 alias 解析到
  // toId 上，把刚搬过去的草稿又清掉。直接删旧键、写新键。
  const text = drafts.get(fromId);
  drafts.delete(fromId);
  snapshotCache.delete(fromId);
  if (text) drafts.set(toId, text);
  emit(fromId);
  emit(toId);
}

function clearConversationDraft(id) {
  setConversationDraft(id, '');
}

function subscribeConversationDraft(id, listener) {
  const key = String(id ?? '');
  let listeners = listenersByConversation.get(key);
  if (!listeners) {
    listeners = new Set();
    listenersByConversation.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      listenersByConversation.delete(key);
      snapshotCache.delete(key);
    }
  };
}

export function usePerConversationDraft(conversationId) {
  const subscribe = useCallback(
    (listener) => subscribeConversationDraft(conversationId, listener),
    [conversationId],
  );
  const getSnapshot = useCallback(() => readSnapshot(resolveId(conversationId)), [conversationId]);
  const draft = useSyncExternalStore(subscribe, getSnapshot, () => '');

  const setDraft = useCallback((value) => {
    const id = resolveId(conversationId);
    if (!id) return;
    setConversationDraft(id, value);
  }, [conversationId]);

  const rekeyDraft = useCallback((fromId, toId) => rekeyConversationDraft(fromId, toId), []);
  const clearDraftFor = useCallback((id) => clearConversationDraft(id), []);

  return { draft, setDraft, rekeyDraft, clearDraftFor };
}
