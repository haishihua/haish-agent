import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const source = read('src/features/chat/components/ChatComposer.jsx');
const sendControlsSource = read('src/features/chat/components/composer/SendControls.jsx');
const css = read('styles/chat.css');

test('background configuration saving has no composer status label or leftover styles', () => {
  assert.doesNotMatch(source, /ConfigSaveStatus|chat-config-save-status|Saving…/);
  assert.doesNotMatch(css, /\.chat-config-save-status/);
});

test('background saving alone never disables Send; submit keeps the commit barrier', () => {
  const send = sendControlsSource.match(/<button type="submit"[^>]*aria-label=\{goal \? 'Run Goal Loop' : 'Send'\}/)?.[0];
  assert.ok(send);
  assert.doesNotMatch(send, /configSync\.pending/);
  assert.match(send, /waitingForSend/);
  assert.match(send, /aria-busy=\{waitingForSend\}/);
  assert.match(source, /savedConfig = await configSync\.ensureSaved\(\)/);
  assert.match(source, /submissionRef\.current\?\.owner === submissionOwner/);
  assert.match(source, /current\.owner !== owner/);
  assert.match(source, /!submissionMountedRef\.current/);
  assert.doesNotMatch(source, /setPathNotice\(failure\.message\)/);
});

test('typing during save preserves the next draft and only consumes submitted images', () => {
  assert.match(source, /if \(currentDraftRef\.current !== draft\) return/);
  assert.match(source, /previous\.filter\(\(image\) => !composerImages\.some/);
  assert.match(source, /disabled=\{disabled \|\| goalPending\}/, 'saving does not disable the editor');
});
