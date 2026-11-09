// 草稿读写的接线契约：受控走 props，未受控走外置 store，两侧必须同源。
//
// 这里测的是「输入框从哪读、往哪写」这件事本身，不是 store 的内部行为
// （那是 per-conversation-draft.test.js 的职责）。之所以单独钉住：曾经有一版
// 只把 store 的 draft 拿来当值、写入仍落在组件内的 useState 上，屏幕上能回显，
// store 永远是空串，切走会话再回来草稿就没了——而当时全部测试都是绿的。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const source = [
  read('../../../src/features/chat/hooks/usePerConversationDraft.js'),
  read('../../../src/features/chat/hooks/useComposerDraft.js'),
]
  .map((text) => text.replace(/^import .*;\n/m, '').replace(/export function/g, 'function'))
  .join('\n');

function createHarness() {
  // 与 per-conversation-draft.test.js 同一套路：hook 本体从源码里取，React 的两只
  // 钩子换成同步实现（useSyncExternalStore 直接读快照），这样能在 node 里驱动真实实现。
  const factory = new Function(
    'useCallback', 'useSyncExternalStore',
    `${source}\nreturn { useComposerDraft, setConversationDraft, clearConversationDraft };`,
  );
  const { useComposerDraft, setConversationDraft, clearConversationDraft } = factory(
    (callback) => callback,
    (_subscribe, getSnapshot) => getSnapshot(),
  );
  return {
    useComposerDraft,
    setConversationDraft,
    clearConversationDraft,
  };
}

test('未受控：读 store、写也进 store', () => {
  const h = createHarness();
  const composer = h.useComposerDraft({ conversationId: 'c1', scopeId: 'c1' });
  assert.equal(composer.draft, '', '空 store 起步');

  composer.onDraftChange('hello');
  assert.equal(h.useComposerDraft({ conversationId: 'c1', scopeId: 'c1' }).draft, 'hello',
    '写入必须落在 store 上：只读 store 不写 store 会让草稿在切会话后消失');
});

test('未受控：切会话各持一份，互换后不串写', () => {
  const h = createHarness();
  h.useComposerDraft({ conversationId: 'a', scopeId: 'a' }).onDraftChange('from A');
  h.useComposerDraft({ conversationId: 'b', scopeId: 'b' }).onDraftChange('from B');
  assert.equal(h.useComposerDraft({ conversationId: 'a', scopeId: 'a' }).draft, 'from A');
  assert.equal(h.useComposerDraft({ conversationId: 'b', scopeId: 'b' }).draft, 'from B');
});

test('未受控：conversationId 为空时用 scopeId 当键', () => {
  const h = createHarness();
  h.useComposerDraft({ conversationId: '', scopeId: 'project-1' }).onDraftChange('scoped');
  assert.equal(h.useComposerDraft({ conversationId: '', scopeId: 'project-1' }).draft, 'scoped');
  assert.equal(h.useComposerDraft({ conversationId: 'other', scopeId: 'project-1' }).draft, '',
    '有会话 id 时按会话分桶，不能读到项目草稿');
});

test('受控：读写都走 props，store 完全不被碰', () => {
  const h = createHarness();
  const written = [];
  const composer = h.useComposerDraft({
    conversationId: 'c1', scopeId: 'c1', draftProp: 'controlled', onDraftChangeProp: (v) => written.push(v),
  });
  assert.equal(composer.draft, 'controlled');
  composer.onDraftChange('typed');
  assert.deepEqual(written, ['typed'], '受控模式下写入必须交给调用方');
  assert.equal(h.useComposerDraft({ conversationId: 'c1', scopeId: 'c1' }).draft, '',
    '受控模式下不能顺手往 store 里写：那会让下一次未受控挂载读到幽灵草稿');
});

test('受控：传空串仍是受控，不回落 store', () => {
  const h = createHarness();
  // store 里先有一份脏值，模拟从别的路径写进来的草稿。
  h.setConversationDraft('c1', 'stale');
  const composer = h.useComposerDraft({
    conversationId: 'c1', scopeId: 'c1', draftProp: '', onDraftChangeProp: () => {},
  });
  assert.equal(composer.draft, '', '空串是合法的受控值，不能当成「未传」而回落到 store');
});

test('未受控：同一会话的另一个订阅者重渲染后读到新值', () => {
  const h = createHarness();
  // draft 是每次渲染读出的值快照（不是 getter），所以另一边要重新渲染才能看见。
  const first = h.useComposerDraft({ conversationId: 'shared', scopeId: 'shared' });
  const second = h.useComposerDraft({ conversationId: 'shared', scopeId: 'shared' });
  assert.equal(second.draft, '', '写入前两边都是空');
  first.onDraftChange('written by first');
  assert.equal(h.useComposerDraft({ conversationId: 'shared', scopeId: 'shared' }).draft, 'written by first',
    '两个订阅者共享同一份草稿，不是各拿一份拷贝');
});
