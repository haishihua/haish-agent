import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../../src/features/chat/hooks/usePerConversationDraft.js', import.meta.url), 'utf8');

function createHarness() {
  let state;
  let refIndex = 0;
  const refs = [];
  const hook = new Function('useState', 'useRef', 'useCallback',
    source.replace(/^import .*;\n/, '').replace('export function', 'function') + '\nreturn usePerConversationDraft;',
  )(
    (initial) => {
      if (state === undefined) state = typeof initial === 'function' ? initial() : initial;
      return [state, (update) => {
        const before = [...state];
        const result = typeof update === 'function' ? update(state) : update;
        assert.deepEqual([...state], before, 'updaters do not mutate the previous state');
        if (typeof update === 'function') assert.deepEqual(update(state), result, 'updaters can be replayed');
        state = result;
      }];
    },
    (initial) => refs[refIndex++] ||= { current: initial },
    (callback) => callback,
  );
  return (id) => { refIndex = 0; return hook(id); };
}

test('switching drafts is synchronous and old callbacks cannot overwrite another conversation', () => {
  const render = createHarness();
  const a = render('A');
  a.setDraft('A draft');
  const b = render('B');
  assert.equal(b.draft, '');
  b.setDraft('B draft');
  a.setDraft((text) => text + ' delayed');
  assert.equal(render('B').draft, 'B draft');
  assert.equal(render('A').draft, 'A draft delayed');
  b.clearDraftFor('A');
  assert.equal(render('A').draft, '');
  assert.equal(render('B').draft, 'B draft');
});

test('materialization transfers the draft and old send callbacks clear only the materialized draft', () => {
  const render = createHarness();
  const temporary = render('temporary');
  temporary.setDraft('send me');
  temporary.rekeyDraft('temporary', 'real');
  assert.equal(render('real').draft, 'send me');
  render('B').setDraft('keep me');
  temporary.setDraft('');
  assert.equal(render('real').draft, '');
  assert.equal(render('B').draft, 'keep me');
  temporary.rekeyDraft('temporary', 'real');
  assert.equal(render('real').draft, '');
});
