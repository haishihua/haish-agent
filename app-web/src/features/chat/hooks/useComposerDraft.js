import { usePerConversationDraft } from './usePerConversationDraft.js';

/**
 * 输入框的草稿：读和写必须来自同一处。
 *
 * 两种模式：
 * - 受控（调用方传 draft）：读写都走 props，这是测试夹具和「外部已经有一份草稿」的场景。
 * - 未受控（AppShell 的默认路径）：读写都走外置 store，击键只重渲染订阅它的组件。
 *
 * 之前这里是散在 ChatComposer 里的两个三元表达式，只把 store 的 draft 拿来当值、
 * 写入却继续落在组件内的 useState 上：屏幕上能回显文字，store 永远是空串，切走会话
 * 再切回来草稿就消失了——而且测试一条都不会红，因为没人渲染这条接线。
 * 抽成一个只会返回成对 { draft, onDraftChange } 的函数，读写的分叉在结构上就不成立。
 *
 * 受控模式下仍然调用 usePerConversationDraft：hook 不能条件调用，而且此时它的订阅
 * 是多余的（值不从这里取），保持与改动前一致的多一次订阅，不引入行为差异。
 */
export function useComposerDraft({
  conversationId, scopeId, draftProp, onDraftChangeProp,
}) {
  const store = usePerConversationDraft(conversationId || scopeId);
  // 以 draftProp 是否存在判定受控，而不是以「值是否为空」：传空串是合法的受控值。
  const controlled = draftProp !== undefined;
  return {
    draft: controlled ? draftProp : store.draft,
    onDraftChange: controlled ? onDraftChangeProp : store.setDraft,
  };
}
