import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const source = read('src/features/chat/components/ChatComposer.jsx');
const status = read('src/features/chat/components/ConfigSaveStatus.jsx');
const css = read('styles/chat.css');

test('save feedback is delayed, accessible and cannot change composer layout', () => {
  assert.match(status, /CONFIG_SAVE_STATUS_DELAY_MS = 700/);
  assert.match(status, /window\.setTimeout/);
  assert.match(status, /window\.clearTimeout\(timer\)/);
  assert.match(status, /if \(!pending \|\| !visible\) return null/);
  assert.match(status, /role="status" aria-label="Saving configuration"/);
  assert.doesNotMatch(status, /LoadingState|setInterval|animation/);
  assert.match(css, /\.chat-config-save-status\s*\{[^}]*position: absolute/);
  assert.match(css, /\.chat-config-save-status\s*\{[^}]*pointer-events: none/);
});

test('background saving alone never disables Send; submit keeps the commit barrier', () => {
  const send = source.match(/<button type="submit"[^>]*aria-label=\{goal \? 'Run Goal Loop' : 'Send'\}/)?.[0];
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
