import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 草稿现在是模块级外置 store（useSyncExternalStore 订阅）：测试不再用 fake React
// hooks 驱动，改为直接驱动 store + 模拟「每次渲染读快照」的订阅循环，断言语义
// 与旧版完全一致（切会话同步、旧回调不串写、rekey 交接、清空只清目标）。
const source = readFileSync(new URL('../../../src/features/chat/hooks/usePerConversationDraft.js', import.meta.url), 'utf8');

function createHarness() {
  // store 是模块级的：每次 hook(id).draft 都直接读当前快照，无需模拟订阅。
  // 订阅路径由浏览器 fixture（composer-message-history）覆盖。
  const hook = new Function(
    'useCallback', 'useSyncExternalStore',
    source.replace(/^import .*;\n/, '').replace('export function', 'function') + '\nreturn usePerConversationDraft;',
  )(
    (callback) => callback,
    (_subscribe, getSnapshot) => getSnapshot(),
  );
  const api = (id) => hook(id);
  const mount = (id) => ({ get draft() { return hook(id).draft; } });
  return { mount, api };
}

test('switching drafts is synchronous and old callbacks cannot overwrite another conversation', () => {
  const { mount, api } = createHarness();
  const a = mount('A');
  api('A').setDraft('A draft');
  assert.equal(a.draft, 'A draft');
  const b = mount('B');
  assert.equal(b.draft, '', 'a different conversation starts empty');
  api('B').setDraft('B draft');
  api('A').setDraft((text) => text + ' delayed');
  assert.equal(b.draft, 'B draft', "A's stale callback must not leak into B");
  assert.equal(a.draft, 'A draft delayed');
  api('B').clearDraftFor('A');
  assert.equal(a.draft, '');
  assert.equal(b.draft, 'B draft');
});

test('materialization transfers the draft and old send callbacks clear only the materialized draft', () => {
  const { mount, api } = createHarness();
  api('temporary').setDraft('send me');
  api('temporary').rekeyDraft('temporary', 'real');
  const real = mount('real');
  assert.equal(real.draft, 'send me', 'materialization moves the text to the server id');
  mount('B');
  api('B').setDraft('keep me');
  api('temporary').setDraft('');
  assert.equal(real.draft, '', 'old send callbacks clear the materialized draft via the alias');
  const b = mount('B');
  assert.equal(b.draft, 'keep me');
  api('temporary').rekeyDraft('temporary', 'real');
  assert.equal(mount('real').draft, '', 're-rekeying an already-transferred draft keeps it cleared');
});
