import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const picker = readFileSync(new URL('../../src/features/chat/components/DraftProjectPicker.jsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

test('the project menu caps itself to the space above the trigger', () => {
  // .chat-workspace 是 overflow: clip，菜单超出面板上沿就会被裁掉。
  assert.match(picker, /React\.useLayoutEffect\(\(\) => \{/);
  assert.match(picker, /rootRef\.current\?\.closest\('\.chat-workspace'\)/);
  assert.match(picker, /const available = trigger\.getBoundingClientRect\(\)\.top - clipTop - 12;/);
  assert.match(picker, /Math\.max\(180, Math\.min\(360, Math\.round\(available\)\)\)/);
  assert.match(picker, /window\.addEventListener\('resize', measure\)/);
  assert.match(picker, /style=\{menuMaxHeight \? \{ maxHeight: `\$\{menuMaxHeight\}px` \} : undefined\}/);
});

test('project rows scroll inside a fixed menu instead of growing it', () => {
  const menu = chat.match(/\.draft-project-menu \{[^}]*\}/s)?.[0] || '';
  assert.match(menu, /display: flex; flex-direction: column;/);
  assert.match(menu, /max-height: 360px; overflow: hidden;/);
  const options = chat.match(/\.draft-project-options \{[^}]*\}/s)?.[0] || '';
  assert.match(options, /flex: 1 1 auto;/);
  assert.match(options, /min-height: 0;/);
  assert.match(options, /max-height: none;/);
  assert.match(options, /overflow-y: auto;/);
  assert.match(options, /overscroll-behavior: contain;/);
  // 搜索框与 Add Project 固定在两端。
  assert.match(chat, /\.draft-project-search \{ flex: 0 0 auto;/);
  assert.match(chat, /\.draft-project-option, \.draft-project-add \{ flex: 0 0 auto;/);
});
