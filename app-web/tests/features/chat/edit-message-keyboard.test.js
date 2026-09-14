import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The editing surface is keyboard-driven, so the contract lives in the JSX
// binding itself. Both the real `save` guard and the real `onKeyDown` body are
// extracted from the component source and evaluated, so the test cannot drift
// from production by copying the logic.
const source = readFileSync(new URL('../../../src/shared/ui/agent-elements/EditMessage.jsx', import.meta.url), 'utf8');

function buildHandler({ value = 'Edited text', busy = false, disabled = false } = {}) {
  const saveSource = source.match(/const save = \(\) => \{[\s\S]*?\};/);
  const keySource = source.match(/onKeyDown=\{\(event\) => \{([\s\S]*?)\n\s*\}\}/);
  assert.ok(saveSource, 'the component must guard saving through a local save()');
  assert.ok(keySource, 'the edit textarea must bind onKeyDown');
  const calls = [];
  const handler = new Function('onSave', 'onCancel', 'value', 'busy', 'disabled', `
    ${saveSource[0]}
    return (event) => {${keySource[1]}};
  `)(() => calls.push('save'), () => calls.push('cancel'), value, busy, disabled);
  return { handler, calls, press: (key, extra = {}) => {
    const event = {
      key, shiftKey: false, metaKey: false, ctrlKey: false, nativeEvent: { isComposing: false },
      defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra,
    };
    handler(event);
    return event;
  } };
}

test('the edit box sends on Enter and keeps Shift+Enter as a newline', () => {
  const { press, calls } = buildHandler();
  assert.equal(press('Enter').defaultPrevented, true, 'plain Enter must not insert a newline');
  assert.deepEqual(calls, ['save'], 'plain Enter must save');
  assert.equal(press('Enter', { shiftKey: true }).defaultPrevented, false, 'Shift+Enter must keep the newline');
  assert.deepEqual(calls, ['save'], 'Shift+Enter must not save');
  // The previous modifier shortcut and Escape cancellation still work.
  assert.equal(press('Enter', { metaKey: true }).defaultPrevented, true);
  assert.equal(press('Enter', { ctrlKey: true }).defaultPrevented, true);
  assert.deepEqual(calls, ['save', 'save', 'save']);
  assert.equal(press('a').defaultPrevented, false, 'other keys must stay inert');
  assert.deepEqual(calls, ['save', 'save', 'save']);
});

test('Escape cancels, IME confirmation never sends, and empty text never reaches the send handler', () => {
  const { press, calls } = buildHandler();
  press('Escape');
  assert.deepEqual(calls, ['cancel']);
  assert.equal(press('Enter', { nativeEvent: { isComposing: true } }).defaultPrevented, false, 'IME confirmation must not send');
  assert.deepEqual(calls, ['cancel']);
  const busy = buildHandler({ busy: true });
  busy.press('Escape');
  busy.press('Enter');
  assert.deepEqual(busy.calls, [], 'a sending message cannot be cancelled or re-sent');
  const blank = buildHandler({ value: '   ' });
  blank.press('Enter');
  assert.deepEqual(blank.calls, [], 'the local save guard owns the empty-text rule');
  const disabledEdit = buildHandler({ disabled: true });
  disabledEdit.press('Enter');
  assert.deepEqual(disabledEdit.calls, [], 'a disabled action must not send');
});

test('the send button keeps mirroring the same save path and busy states', () => {
  assert.match(source, /onClick=\{save\} disabled=\{busy \|\| disabled \|\| !value\.trim\(\)\}/, 'the button must share save() and the same enable rule');
  assert.match(source, /\{busy \? 'Sending…' : 'Send'\}/);
  assert.match(source, /aria-label="Edit your message"/);
});
