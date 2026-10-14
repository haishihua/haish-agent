import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const shell = read('features/app/AppShell.jsx');
const runtime = read('features/conversations/hooks/createConversationRuntime.js');
const panel = read('features/chat/components/ChatPanel.jsx');
const composer = read('features/chat/components/ChatComposer.jsx');

test('both composer entry points receive explicitly projected Stop failure state', () => {
  assert.match(runtime, /setConversationStopState\(\(current\) =>/);
  assert.match(shell, /setShellSeeded, setConversationStopState,/);
  assert.match(shell, /const submitPending = Boolean\(queuedDeploy \|\| conversationStopState.pending \|\| conversationRetryPending\)/);
  assert.equal((shell.match(/stopError=\{conversationStopState.error\}/g) || []).length, 2);
  assert.match(panel, /stopError=\{stopError\}/);
  assert.match(panel, /actionsDisabled:.*Boolean\(stopError\)/);
});

test('unverified Stop has a shared error surface, a Stop retry action and no submission bypass', () => {
  assert.match(composer, /<ErrorState variant="inline" title="Stop not verified" detail=\{stopError\}/);
  assert.match(composer, /onRetry=\{stopAndRestore\} disabled=\{submitPending\} retryLabel="Stop again"/);
  assert.match(composer, /\) : stopError \? \(/);
  assert.match(composer, /className="chat-send stop"[^\n]*aria-label="Stop again"/);
  assert.match(composer, /if \(stopError \|\| disabled \|\| submitPending/);
  assert.match(composer, /current\.submitPending \|\| current\.stopError/);
  assert.match(composer, /if \(!running && !submitPending && !stopError\) return undefined/);
});
