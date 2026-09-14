import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression 1: the inline message editor used to size itself from the message it
// belongs to (it measured the rendered bubble, clamped to 220px, and pinned that
// as an inline width). A short message therefore opened a ~220px editor while a
// long one opened a 680px editor. The measurement is gone: the editor is a fixed
// width that fills the message area, exactly like the composer input box.
//
// Regression 2: the first fix derived that width arithmetically — `calc(100% + 12px)`
// from the chat list's 28px padding against the composer's 22px margin. That spilled
// 6px outside the row on both sides, so in the app the box ran into the panel edges
// and both ends looked cut off (chopped rounded corners). The workflow detail pane
// proves the same arithmetic is not portable: it renders the same message list with
// `padding: 16px 18px 28px`. Equality must therefore come from one shared gutter,
// never from an overflow.
const rowSource = readFileSync(new URL('../../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const editStyles = readFileSync(new URL('../../../src/shared/ui/agent-elements/edit-message.css', import.meta.url), 'utf8');
const chatStyles = readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');
const workflowStyles = readFileSync(new URL('../../../styles/workflow-runtime.css', import.meta.url), 'utf8');

const editingShellRule = editStyles.match(
  /\.chat-message-row\.user > \.chat-bubble\.message-shell:has\(> \.message-speech-body\.is-editing\)\s*\{([^}]*)\}/,
);
// Declarations only: the comment above the rule explains the rejected formula and
// would otherwise trip the "no arithmetic widening" assertion below.
const editDeclarations = editStyles.replace(/\/\*[\s\S]*?\*\//g, '');

test('the inline editor no longer measures the message it edits', () => {
  assert.doesNotMatch(rowSource, /editWidth/, 'the pinned per-message width state must stay deleted');
  assert.doesNotMatch(rowSource, /shellRef/, 'the editor must not measure its bubble before opening');
  assert.doesNotMatch(rowSource, /style=\{\s*editing \? \{ width: editWidth \}/, 'the shell must not take an inline width while editing');
});

test('the inline editor fills the message area instead of overflowing it', () => {
  assert.ok(editingShellRule, 'the editing shell needs its own width rule');
  const rule = editingShellRule[1];
  assert.match(rule, /width:\s*100%/, 'the editor takes the row width, it does not add to it');
  // .chat-bubble caps every bubble at min(680px, 72%); the editor opts out.
  assert.match(rule, /max-width:\s*none/, 'the bubble max-width would otherwise shrink the editor again');
  assert.match(rule, /align-self:\s*stretch/, 'stretching the row keeps the editor on the composer columns');
  // Widening past the row is what pushed the box into the panel edges and got the
  // ends visually cut. Overflowing the row is never acceptable: the hosted list
  // padding is not ours to assume (workflow detail list: 16px 18px 28px).
  assert.doesNotMatch(editDeclarations, /calc\(100% \+/, 'no arithmetic overflow');
  assert.doesNotMatch(editDeclarations, /width:\s*calc\([^)]*\+\s*\d/, 'the editor width must not be padded by a hardcoded gutter delta');
});

test('the editor and the composer share one gutter, so they are always the same width', () => {
  // The value lives on the panel; the message list padding and the composer margin
  // both read it, so they cannot drift apart (they used to be 28px vs 22px).
  assert.match(chatStyles, /\.chat-workspace\s*\{[^}]*--chat-gutter:\s*\d+px/, 'the panel must declare the shared gutter');
  assert.match(chatStyles, /\.chat-message-list\s*\{[^}]*padding:\s*24px var\(--chat-gutter, 28px\)/, 'the message list must use the shared gutter');
  assert.match(chatStyles, /\.chat-composer\s*\{[^}]*margin:\s*0 var\(--chat-gutter, 28px\) 16px/, 'the composer must use the shared gutter');
  // Proof that a second container exists and does not follow the chat gutters: that
  // is exactly why the editor must never be widened arithmetically.
  assert.match(
    workflowStyles,
    /\.workflow-detail-body\.chat-message-list\s*\{[^}]*padding:\s*16px 18px 28px/,
    'the workflow detail list keeps its own padding; the editor must stay inside it',
  );
});

test('editing drops the avatar gutter so the visible box really spans the row', () => {
  // User bubbles reserve a 38px right gutter for the speaker avatar; the visible
  // editing box would otherwise stop 38px short of the composer's right edge.
  const shellGutter = Number(chatStyles.match(/\.chat-message-row\.user \.chat-bubble\.message-shell\s*\{[^}]*padding:\s*4px\s+(\d+)px/)?.[1]);
  assert.equal(shellGutter, 38, 'the user bubble gutter changed; recheck the editing width');
  assert.match(editingShellRule[1], /padding-right:\s*0/);
  assert.match(
    editStyles,
    /:has\(> \.message-speech-body\.is-editing\)[^{]*\.user-speaker-meta\s*\{\s*margin-right:\s*0/,
    'the speaker meta row must follow the box instead of hanging outside it',
  );
});
