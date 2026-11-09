import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modals = readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const delegation = readFileSync(new URL('../../styles/delegation.css', import.meta.url), 'utf8');

const SELECTED = '#8fb7ff';

test('selected agent rows and the check mark drop the gold accent', () => {
  const active = modals.match(/\.agent-picker-option\.is-active \{[^}]*\}/s)?.[0] || '';
  assert.match(active, new RegExp(`color: ${SELECTED};`));
  assert.doesNotMatch(active, /var\(--gold/);
  const check = modals.match(/\.agent-picker-check \{[^}]*\}/s)?.[0] || '';
  assert.match(check, new RegExp(`color: ${SELECTED};`));
  // 悬停也换成同一个冷蓝色，金色不再出现在选择器里。
  assert.match(modals, /\.agent-picker-option:hover \{[^}]*color: #8fb7ff;/s);
  assert.doesNotMatch(modals.match(/\.agent-picker-option:hover \{[^}]*\}/s)?.[0] || '', /var\(--gold/);
});

test('selected provider and model rows use the same cool blue', () => {
  assert.match(chat, new RegExp(`\\.chat-composer \\.model-picker-option\\.is-active \\{\\s*color: ${SELECTED};`));
  const check = chat.match(/\.chat-composer \.model-picker-check \{[^}]*\}/s)?.[0] || '';
  assert.match(check, new RegExp(`color: ${SELECTED};`));
  assert.match(delegation, new RegExp(`\\.model-picker-submenu-entry\\.is-active \\{[^}]*color: ${SELECTED};`, 's'));
  assert.match(delegation, new RegExp(`is-active \\{\\s*color: rgba\\(143, 183, 255, 0\\.72\\);`));
  // hover 也不留金色：行、子菜单入口都跟着选中色走。
  assert.match(chat, new RegExp(`\\.chat-composer \\.model-picker-option:hover \\{\\s*background: rgba\\(255, 255, 255, 0\\.08\\);\\s*color: ${SELECTED};`));
  const subHover = delegation.match(/\.chat-composer \.model-picker-submenu-entry:hover \{[^}]*\}/s)?.[0] || '';
  assert.match(subHover, new RegExp(`color: ${SELECTED};`));
  assert.doesNotMatch(subHover, /var\(--gold\)/);
});
