import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inputSource = readFileSync(new URL('../../../src/features/chat/components/LexicalComposerInput.jsx', import.meta.url), 'utf8');
const composerSource = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
const boundarySource = inputSource.slice(inputSource.indexOf('function selectionAtBoundary('), inputSource.indexOf('function ComposerController('));
const selectionAtBoundary = new Function(`${boundarySource}; return selectionAtBoundary;`)();
const binding = composerSource.slice(composerSource.indexOf('onKeyDown={(event) => {'), composerSource.indexOf('          placeholder={placeholder}'));
const keyboardSource = binding.slice(binding.indexOf('(event) => {'), binding.lastIndexOf('}'));

function harness({ contentBefore = '', contentAfter = '', breakBefore = false, breakAfter = false } = {}) {
  const node = {}, outside = {};
  let selection = { isCollapsed: true, anchorNode: node, focusNode: node, anchorOffset: 0 };
  const root = {
    contains: (target) => target === node,
    ownerDocument: {
      defaultView: { getSelection: () => selection },
      createRange: () => {
        let direction;
        return {
          selectNodeContents() {},
          setEnd() { direction = 'before'; },
          setStart() { direction = 'after'; },
          cloneContents: () => ({
            textContent: direction === 'before' ? contentBefore : contentAfter,
            querySelector: () => (direction === 'before' ? breakBefore : breakAfter) ? {} : null,
            querySelectorAll: () => [],
          }),
        };
      },
    },
  };
  const effects = [];
  const inputRef = { current: {
    isSelectionAtStart: () => selectionAtBoundary(root, 'before'),
    isSelectionAtEnd: () => selectionAtBoundary(root, 'after'),
  } };
  function keyboard(command = false) {
    const dependencies = {
      inputRef, selectedSkill: command ? null : { name: 'Skill' }, selectedCommand: command ? { name: 'goal' } : null,
      setGoalSelected: () => effects.push('clear-goal'), setSkillMenuDismissed: () => {},
      selectedSkillNameRef: { current: 'Skill' }, skillSelectionPendingRef: { current: false },
      setSelectedSkillName: () => effects.push('clear-skill'), skillMenuOpen: false,
      restoreHistory: () => false, running: false, navigateHistory: (direction) => { effects.push(direction); return true; },
      requestAnimationFrame: () => {},
    };
    return new Function(...Object.keys(dependencies), `return ${keyboardSource};`)(...Object.values(dependencies));
  }
  function press(key, command = false) {
    const event = { key, nativeEvent: {}, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    keyboard(command)(event);
    return event;
  }
  return { inputRef, effects, press, node, outside, select: (value) => { selection = value; } };
}

for (const command of [false, true]) {
  test(`${command ? 'Goal' : 'Skill'} range selection lets Backspace delete text and never enters message history`, () => {
    const h = harness();
    h.select({ isCollapsed: false, anchorNode: h.node, focusNode: h.node, anchorOffset: 0 });
    assert.equal(h.inputRef.current.isSelectionAtStart(), false);
    assert.equal(h.inputRef.current.isSelectionAtEnd(), false);
    for (const key of ['Backspace', 'ArrowUp', 'ArrowDown']) assert.equal(h.press(key, command).defaultPrevented, false);
    assert.deepEqual(h.effects, []);
  });
}

test('token and managed caret placeholders are ignored, but actual text and newlines are not', () => {
  // Exercise the production fragment filter, not a second boundary algorithm.
  const state = { token: 'goal', placeholder: true };
  const fragment = {
    get textContent() { return state.token; },
    querySelector: () => state.placeholder ? {} : null,
    querySelectorAll(selector) {
      assert.match(selector, /data-lexical-managed-linebreak/);
      assert.match(selector, /data-command-token/);
      return [{ remove() { state.token = ''; } }, { remove() { state.placeholder = false; } }];
    },
  };
  const node = {};
  const root = { contains: () => true, ownerDocument: {
    defaultView: { getSelection: () => ({ isCollapsed: true, anchorNode: node, focusNode: node, anchorOffset: 0 }) },
    createRange: () => ({ selectNodeContents() {}, setEnd() {}, cloneContents: () => fragment }),
  } };
  assert.equal(selectionAtBoundary(root, 'before'), true);
});

test('missing, outside and another editor selections are not composer boundaries', () => {
  const h = harness();
  for (const selection of [null, { isCollapsed: true, anchorNode: h.outside, focusNode: h.outside, anchorOffset: 0 }]) {
    h.select(selection);
    assert.equal(h.inputRef.current.isSelectionAtStart(), false);
    assert.equal(h.inputRef.current.isSelectionAtEnd(), false);
    assert.equal(h.press('Backspace').defaultPrevented, false);
    assert.equal(h.press('ArrowUp').defaultPrevented, false);
  }
  assert.equal(selectionAtBoundary(null, 'before'), false);
  assert.deepEqual(h.effects, []);
});

test('only a valid collapsed caret reaches a text boundary; line breaks count as content', () => {
  const start = harness({ contentAfter: 'task' });
  assert.equal(start.inputRef.current.isSelectionAtStart(), true);
  assert.equal(start.inputRef.current.isSelectionAtEnd(), false);
  assert.equal(start.press('Backspace', true).defaultPrevented, true);
  const end = harness({ contentBefore: 'task' });
  assert.equal(end.inputRef.current.isSelectionAtStart(), false);
  assert.equal(end.inputRef.current.isSelectionAtEnd(), true);
  assert.equal(end.press('Backspace').defaultPrevented, false);
  const middle = harness({ breakBefore: true, breakAfter: true });
  assert.equal(middle.inputRef.current.isSelectionAtStart(), false);
  assert.equal(middle.inputRef.current.isSelectionAtEnd(), false);
  assert.equal(middle.press('ArrowUp').defaultPrevented, false);
  assert.equal(middle.press('ArrowDown').defaultPrevented, false);
});
