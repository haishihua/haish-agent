import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as lexical from 'lexical';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import * as paths from '../../../src/features/chat/model/path-references.js';
import { composerReferenceState } from '../../../src/features/chat/model/composer-reference-state.js';
import { GOAL_COMMAND, goalInvocation } from '../../../src/features/chat/model/goal-command.js';

// Exercise the actual controller and installed OnChangePlugin with real Lexical
// history. Hook scheduling is simulated; DOM/keyboard coverage lives in the fixture.
const source = readFileSync(new URL('../../../src/features/chat/components/LexicalComposerInput.jsx', import.meta.url), 'utf8');
const composer = readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
const plugin = readFileSync(new URL('../../../../node_modules/@lexical/react/src/LexicalOnChangePlugin.ts', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function harness() {
  const state = { draft: '', goal: false, skill: '', menuDismissed: false };
  const textChanges = [], tokenChanges = [];
  const selectedSkillNameRef = { current: '' }, skillSelectionPendingRef = { current: false };
  const handler = composer.match(/onTokenChange=\{\(token\) => \{([\s\S]*?)\n {10}\}\}/);
  assert.ok(handler, 'composer must consume token changes from the editor');
  const syncToken = new Function('token', 'setGoalSelected', 'setSelectedSkillName', 'selectedSkillNameRef', 'skillSelectionPendingRef', 'setSkillMenuDismissed', handler[1]);
  let editor, slots = [], cursor = 0, effects = [], unregisterChange;
  const React = {
    useRef(value) { const index = cursor++; return slots[index] || (slots[index] = { current: value }); },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous[i])) {
        slots[index] = dependencies;
        effects.push(callback);
      }
    },
    useCallback(callback) { cursor++; return callback; },
    createElement(type, props) { return { type, props }; },
  };
  const pluginCode = transformSync(plugin.slice(plugin.indexOf('export function OnChangePlugin')).replace('export function', 'function')
    + '\nexports.OnChangePlugin = OnChangePlugin;', { loader: 'ts' }).code;
  const pluginExports = {};
  new Function('exports', 'useLexicalComposerContext', 'useLayoutEffect', 'HISTORY_MERGE_TAG', pluginCode)(
    pluginExports, () => [editor], (callback) => { unregisterChange?.(); unregisterChange = callback(); }, lexical.HISTORY_MERGE_TAG,
  );
  const controllerCode = transformSync(source.slice(source.indexOf('class SkillTokenNode'), source.indexOf('export const LexicalComposerInput'))
    + '\nexports.SkillTokenNode = SkillTokenNode; exports.Controller = ComposerController;', { loader: 'jsx' }).code;
  const compiled = {};
  const bindings = { ...lexical, ...paths, composerReferenceState, React,
    useLexicalComposerContext: () => [editor], OnChangePlugin: pluginExports.OnChangePlugin, Target: null, BookOpen: null };
  new Function('exports', ...Object.keys(bindings), controllerCode)(compiled, ...Object.values(bindings));
  editor = lexical.createEditor({ namespace: 'composer-token-regression', nodes: [compiled.SkillTokenNode], onError: (error) => { throw error; } });
  editor.update(() => lexical.$getRoot().append(lexical.$createParagraphNode()), { discrete: true });
  const history = createEmptyHistoryState();
  const unregisterHistory = registerHistory(editor, history, 0);
  const apiRef = { current: null };
  const onTokenChange = (token) => {
    tokenChanges.push(token);
    syncToken(token, (value) => { state.goal = value; }, (value) => { state.skill = value; },
      selectedSkillNameRef, skillSelectionPendingRef, (value) => { state.menuDismissed = value; });
  };
  async function render() {
    cursor = 0; effects = [];
    const element = compiled.Controller({ value: state.draft, selectedCommand: state.goal ? GOAL_COMMAND : null,
      selectedSkill: state.skill ? { name: state.skill } : null, disabled: false, maxLength: 5000,
      onChange: (value) => { state.draft = value; textChanges.push(value); }, onTokenChange,
      onReferencesChange: () => {}, apiRef });
    element.type(element.props);
    effects.forEach((callback) => callback());
    await tick();
  }
  function snapshot() {
    return editor.getEditorState().read(() => {
      const token = lexical.$nodesOfType(compiled.SkillTokenNode)[0];
      const goal = state.goal ? { prompt: paths.splitPathReferenceDraft(state.draft).text.trim() } : goalInvocation(paths.splitPathReferenceDraft(state.draft).text);
      const payload = Boolean(state.goal || state.draft.trim());
      return { token: token ? { name: token.getSkillName(), command: token.isCommand() } : null,
        draft: state.draft, goal: Boolean(goal), prompt: goal?.prompt, disabledWithoutModel: !payload || !goal,
        routeWithModel: goal ? 'goal' : payload ? 'chat' : 'none', skill: state.skill };
    });
  }
  async function historyCommand(command) {
    editor.dispatchCommand(command, undefined);
    await tick();
    await render(); // Ensure the controlled effect does not overwrite restored history.
  }
  return { state, render, snapshot, historyCommand, tokenChanges, textChanges, apiRef, editor,
    close() { unregisterChange?.(); unregisterHistory(); } };
}

for (const text of ['', '继续远程桌面', '/tmp/evidence.log\n继续远程桌面']) {
  test(`Goal token removal, undo and redo keep send routing in sync (${text || 'bare token'})`, async () => {
    const h = harness();
    try {
      h.state.draft = `/goal${text ? ` ${text}` : ''}`; await h.render();
      h.state.goal = true; h.state.draft = text; await h.render();
      assert.equal(h.snapshot().disabledWithoutModel, false);
      h.state.goal = false; await h.render();
      const changes = h.textChanges.length;
      await h.historyCommand(lexical.UNDO_COMMAND);
      assert.deepEqual(h.snapshot().token, { name: 'goal', command: true });
      assert.equal(h.snapshot().goal, true);
      assert.equal(h.snapshot().disabledWithoutModel, false);
      assert.equal(h.snapshot().routeWithModel, 'goal');
      assert.equal(h.snapshot().draft, text);
      assert.equal(h.textChanges.length, changes, 'token-only history must not emit a fake text change');
      await h.historyCommand(lexical.REDO_COMMAND);
      assert.equal(h.snapshot().token, null);
      assert.equal(h.snapshot().goal, false);
      assert.equal(h.snapshot().draft, text);
      assert.equal(h.snapshot().routeWithModel, text ? 'chat' : 'none');
      assert.equal(h.snapshot().disabledWithoutModel, true);
    } finally { h.close(); }
  });
}

test('undoing Goal selection removes the hidden Goal route, redo restores it', async () => {
  const h = harness();
  try {
    h.state.draft = 'task'; await h.render();
    h.state.goal = true; await h.render();
    await h.historyCommand(lexical.UNDO_COMMAND);
    assert.equal(h.snapshot().token, null);
    assert.equal(h.snapshot().goal, false);
    assert.equal(h.snapshot().routeWithModel, 'chat');
    await h.historyCommand(lexical.REDO_COMMAND);
    assert.equal(h.snapshot().goal, true);
    assert.equal(h.snapshot().routeWithModel, 'goal');
  } finally { h.close(); }
});

test('ordinary Skill tokens also synchronize through history without becoming Goal', async () => {
  const h = harness();
  try {
    h.state.draft = 'task'; h.state.skill = 'Grill-Me'; await h.render();
    h.state.skill = ''; await h.render();
    await h.historyCommand(lexical.UNDO_COMMAND);
    assert.equal(h.snapshot().skill, 'Grill-Me');
    assert.deepEqual(h.snapshot().token, { name: 'Grill-Me', command: false });
    assert.equal(h.snapshot().goal, false);
    await h.historyCommand(lexical.REDO_COMMAND);
    assert.equal(h.snapshot().skill, '');
  } finally { h.close(); }
});

test('actual editor text insertion updates the draft while the Goal token stays selected', async () => {
  const h = harness();
  try {
    await h.render(); h.state.goal = true; await h.render();
    assert.equal(h.apiRef.current.insertText('继续远程桌面'), true);
    await tick(); await h.render();
    assert.equal(h.snapshot().draft, '继续远程桌面');
    assert.equal(h.snapshot().prompt, '继续远程桌面');
    assert.equal(h.snapshot().disabledWithoutModel, false);
    assert.equal(h.tokenChanges.length, 0, 'controlled updates must not echo selection callbacks');
  } finally { h.close(); }
});
