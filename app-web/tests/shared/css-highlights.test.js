import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const {
  HIGHLIGHT_GROUPS,
  HIGHLIGHT_NAMES,
  clearHighlightGroup,
  clearHighlights,
  highlightSupported,
  setHighlight,
} = await import('../../src/shared/lib/css-highlights.js');

// CSS Custom Highlight API 是全应用共用的一张登记表。改前两个特性各拿字符串字面量
// set / delete（'annotation-focus'、'message-annotations' 属于批注，
// 'conversation-matches'、'conversation-active-match' 属于会话搜索），
// 名字或清理顺序改一处，一方的 cleanup 就会把另一方的高亮擦掉。
// 这里钉住：名字集合与改前一致（用户看到的高亮不变），归属互不相交，整组清理清不到另一组。

class FakeHighlight {
  constructor(...ranges) {
    this.ranges = ranges;
    this.priority = 0;
  }
}

function withFakeRegistry(run) {
  const previousCSS = globalThis.CSS;
  const previousHighlight = globalThis.Highlight;
  const registry = new Map();
  globalThis.CSS = { highlights: registry };
  globalThis.Highlight = FakeHighlight;
  try {
    return run(registry);
  } finally {
    globalThis.CSS = previousCSS;
    globalThis.Highlight = previousHighlight;
  }
}

test('the registered names are exactly the ones the two features already used', () => {
  // 改前基线：来自两个组件的字面量。名字变了，styles/chat.css 里的 ::highlight() 规则
  // 和 fixtures 里按名字取的断言都会静默失配。
  assert.deepEqual({ ...HIGHLIGHT_NAMES }, {
    annotationFocus: 'annotation-focus',
    messageAnnotations: 'message-annotations',
    conversationMatches: 'conversation-matches',
    conversationActiveMatch: 'conversation-active-match',
  });
});

test('every name belongs to exactly one feature', () => {
  const owned = Object.values(HIGHLIGHT_GROUPS).flat();
  assert.deepEqual([...owned].sort(), Object.values(HIGHLIGHT_NAMES).sort());
  assert.equal(new Set(owned).size, owned.length, 'a name in two groups could be wiped by either feature');
});

test('clearing the annotation group leaves the conversation search highlights alone', () => {
  withFakeRegistry((registry) => {
    for (const name of Object.values(HIGHLIGHT_NAMES)) setHighlight(name, [{ name }]);
    assert.equal(registry.size, 4);

    clearHighlightGroup('annotations');

    assert.equal(registry.has(HIGHLIGHT_NAMES.conversationMatches), true);
    assert.equal(registry.has(HIGHLIGHT_NAMES.conversationActiveMatch), true);
    assert.equal(registry.has(HIGHLIGHT_NAMES.annotationFocus), false);
    assert.equal(registry.has(HIGHLIGHT_NAMES.messageAnnotations), false);
  });
});

test('clearing the conversation search group leaves the annotation highlights alone', () => {
  withFakeRegistry((registry) => {
    for (const name of Object.values(HIGHLIGHT_NAMES)) setHighlight(name, [{ name }]);

    clearHighlightGroup('conversationSearch');

    assert.equal(registry.has(HIGHLIGHT_NAMES.annotationFocus), true);
    assert.equal(registry.has(HIGHLIGHT_NAMES.messageAnnotations), true);
    assert.equal(registry.has(HIGHLIGHT_NAMES.conversationMatches), false);
    assert.equal(registry.has(HIGHLIGHT_NAMES.conversationActiveMatch), false);
  });
});

test('one feature clearing its own name leaves the other feature registered', () => {
  withFakeRegistry((registry) => {
    setHighlight(HIGHLIGHT_NAMES.messageAnnotations, [{ id: 'quote' }]);
    setHighlight(HIGHLIGHT_NAMES.conversationMatches, [{ id: 'hit' }]);

    // 会话搜索关掉了：它只收自己那张。
    clearHighlights([HIGHLIGHT_NAMES.conversationMatches]);

    assert.equal(registry.has(HIGHLIGHT_NAMES.messageAnnotations), true);
    assert.equal(registry.has(HIGHLIGHT_NAMES.conversationMatches), false);
  });
});

test('setting a name overwrites it instead of stacking, and keeps the priority', () => {
  withFakeRegistry((registry) => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    setHighlight(HIGHLIGHT_NAMES.conversationMatches, [first]);
    setHighlight(HIGHLIGHT_NAMES.conversationMatches, [second]);
    assert.equal(registry.get(HIGHLIGHT_NAMES.conversationMatches).ranges.length, 1);
    assert.equal(registry.get(HIGHLIGHT_NAMES.conversationMatches).ranges[0], second);

    setHighlight(HIGHLIGHT_NAMES.conversationActiveMatch, [second], { priority: 1 });
    assert.equal(registry.get(HIGHLIGHT_NAMES.conversationActiveMatch).priority, 1);
  });
});

test('an empty range list still replaces the old highlight', () => {
  withFakeRegistry((registry) => {
    setHighlight(HIGHLIGHT_NAMES.messageAnnotations, [{ id: 'quote' }]);
    setHighlight(HIGHLIGHT_NAMES.messageAnnotations, []);
    assert.equal(registry.get(HIGHLIGHT_NAMES.messageAnnotations).ranges.length, 0);
  });
});

test('without the Custom Highlight API every call is a no-op', () => {
  const previousCSS = globalThis.CSS;
  const previousHighlight = globalThis.Highlight;
  globalThis.CSS = undefined;
  globalThis.Highlight = undefined;
  try {
    assert.equal(highlightSupported(), false);
    assert.equal(setHighlight(HIGHLIGHT_NAMES.annotationFocus, [{ id: 'range' }]), false);
    clearHighlights([HIGHLIGHT_NAMES.annotationFocus]);
    clearHighlightGroup('annotations');
  } finally {
    globalThis.CSS = previousCSS;
    globalThis.Highlight = previousHighlight;
  }
});

test('both features take their names from the shared registry, not from literals', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const annotations = read('../../src/features/chat/components/MessageAnnotations.jsx');
  const search = read('../../src/features/chat/components/ConversationSearch.jsx');

  for (const [name, source] of [['annotations', annotations], ['conversation search', search]]) {
    assert.match(source, /from '\.\.\/\.\.\/\.\.\/shared\/lib\/css-highlights\.js';/, `${name} imports the registry`);
    // 一处字面量都不许留：留着就等于又开了一个能改名的入口。
    assert.doesNotMatch(source, /CSS\.highlights/, `${name} must go through the registry helpers`);
    for (const literal of Object.values(HIGHLIGHT_NAMES)) {
      assert.doesNotMatch(source, new RegExp(`'${literal}'`), `${name} must not spell '${literal}' again`);
    }
  }
});
