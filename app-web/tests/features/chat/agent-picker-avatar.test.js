import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../../styles/modals.css', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
const chatCss = readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');

test('composer agent avatars have complete geometry outside Settings scope', () => {
  assert.match(css, /\.agent-picker \.agent-avatar-frame\s*\{[^}]*width:\s*26px;[^}]*height:\s*26px;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.agent-picker \.agent-avatar-frame > img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*image-rendering:\s*auto;/s);
  assert.match(picker, /<AgentAvatar agentId=\{current\.id\}/);
  assert.match(picker, /<AgentAvatar agentId=\{option\.id\}/);
});

test('agent menu uses a neutral border beside the permission control', () => {
  const menu = css.match(/\.agent-picker-menu\s*\{([^}]*)\}/)[1];
  assert.match(menu, /border:\s*1px solid var\(--line/);
  assert.doesNotMatch(menu, /239,\s*191,\s*100/);
  assert.match(chatCss, /\.chat-composer-tools\s*\{[^}]*gap:\s*4px;/);
  assert.match(css, /\.approval-mode-segments \.dissolve-segmented-icon\s*\{[^}]*width:\s*21px[^}]*height:\s*21px/);
});
