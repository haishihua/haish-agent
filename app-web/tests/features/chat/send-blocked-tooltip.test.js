import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');

test('configuration hints belong to the send-button tooltip, not composer notices', () => {
  assert.match(source, /<PortalTooltip text=\{sendBlockedReason\} position="above">\s*<span className="chat-send-tooltip-trigger"/);
  assert.doesNotMatch(source, /setPathNotice\((?:modelConfigError|savedError)\)/);
  assert.doesNotMatch(source, /<p[^>]*>\{modelConfigError\}<\/p>/);
  assert.doesNotMatch(source, /Configure an LLM provider in Settings first/);
  assert.match(source, /\{pathNotice && <p/, 'Unrelated attachment/path notices remain intact');
});

test('missing execution configuration still blocks the button and submit handler', () => {
  assert.match(source, /if \(\(!running \|\| goal\) && \(!goal \|\| goal\.prompt\) && modelConfigError\) return;/);
  assert.match(source, /if \(savedError\) return;/);
  assert.match(source, /disabled=\{[^}]*Boolean\(\(!goal \|\| goal\.prompt\) && modelConfigError\)/);
  assert.match(source, /savedConfig = await configSync\.ensureSaved\(\)/);
});

test('disabled native send buttons leave hover to a focusable, same-size wrapper', () => {
  assert.match(source, /tabIndex=\{sendBlockedReason \? 0 : undefined\}/);
  assert.match(css, /\.chat-send-tooltip-trigger\s*\{\s*display: inline-flex;\s*flex: 0 0 auto;/);
  assert.match(css, /\.chat-send-tooltip-trigger \.chat-send:disabled\s*\{\s*pointer-events: none;/);
});
