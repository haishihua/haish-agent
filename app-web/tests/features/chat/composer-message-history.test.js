import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../src/features/chat/hooks/useComposerHistory.js', import.meta.url), 'utf8');
const makeHook = new Function('useState', `${source.replace("import { useState } from 'react';", '').replace('export function', 'function')}\nreturn useComposerHistory;`);
function harness() {
  let preview = null;
  const drafts = new Map([['a', 'Unsent draft\nwith lots of text'], ['b', 'Other draft']]);
  const writes = [];
  const hook = makeHook(() => [preview, value => { preview = value; }]);
  const h = { scope: 'a', history: ['Latest user', 'Older user'], drafts, writes };
  h.render = () => hook({ scopeId: h.scope, draft: drafts.get(h.scope) || '', history: h.history,
    onDraftChange: value => { drafts.set(h.scope, value); writes.push(value); } });
  return h;
}

test('Up previews all user history while Down returns to the unchanged cached draft', () => {
  const h = harness();
  const original = h.render().draft;
  assert.equal(h.render().navigate('older'), true);
  assert.equal(h.render().draft, 'Latest user');
  h.render().navigate('older');
  assert.equal(h.render().draft, 'Older user');
  h.render().navigate('newer');
  assert.equal(h.render().draft, 'Latest user');
  h.render().navigate('newer');
  assert.equal(h.render().draft, original);
  assert.equal(h.drafts.get('a'), original);
  assert.deepEqual(h.writes, []);
});

test('Down without browsing and an empty history never clear the draft', () => {
  const h = harness(), original = h.render().draft;
  assert.equal(h.render().navigate('newer'), false);
  h.history = [];
  assert.equal(h.render().navigate('older'), false);
  assert.equal(h.render().draft, original);
  assert.deepEqual(h.writes, []);
});

test('Escape cancels the preview; editing and clearing explicitly update the current draft', () => {
  const h = harness(), original = h.render().draft;
  h.render().navigate('older');
  assert.equal(h.render().restore(), true);
  assert.equal(h.render().draft, original);
  h.render().navigate('older');
  h.render().setDraft('Edited history as new draft');
  assert.equal(h.render().browsing, false);
  assert.equal(h.render().draft, 'Edited history as new draft');
  h.render().navigate('older'); h.render().navigate('newer');
  assert.equal(h.render().draft, 'Edited history as new draft');
  h.render().setDraft('');
  assert.equal(h.render().draft, '');
});

test('conversation switching or remounting preserves the unsent draft instead of the history preview', () => {
  const h = harness(), original = h.render().draft;
  h.render().navigate('older');
  h.scope = 'b';
  assert.equal(h.render().draft, 'Other draft');
  h.scope = 'a';
  assert.equal(h.render().draft, original);
  assert.deepEqual(h.writes, []);
});

test('updates to the conversation history do not change an in-progress navigation order', () => {
  const h = harness(); h.render().navigate('older');
  h.history = ['Just arrived', ...h.history];
  h.render().navigate('older');
  assert.equal(h.render().draft, 'Older user');
});
