import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 会话详情里的日期分隔（对照 assistant-ui 的 day-separator 元素）：
// 日期来自每条消息自己的时间戳（后端 task.created_at → task.createdAt），
// 相邻两条跨天时插一条「rule + label + rule」；组件不自己算日期、也不按条数插。
const chatPanel = readFileSync(new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
const daySeparator = readFileSync(new URL('../../src/features/chat/components/DaySeparator.jsx', import.meta.url), 'utf8');
const daySeparators = readFileSync(new URL('../../src/features/chat/model/day-separators.js', import.meta.url), 'utf8');
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

test('the message list derives day headers from message timestamps', () => {
  assert.match(chatPanel, /const listRows = React\.useMemo\(\(\) => withDaySeparators\(messages\), \[messages\]\);/);
  assert.match(chatPanel, /row\.kind === 'day' \? \(\s*<ChatDaySeparator key=\{row\.id\} label=\{row\.label\} \/>/);
  // 判据只认消息自己的 createdAt —— 不按条数、不按时长插。
  assert.match(daySeparators, /message\?\.createdAt/);
  assert.doesNotMatch(daySeparators, /from ['"]react['"]/, 'the grouping model stays React-free');
  assert.doesNotMatch(daySeparators, /Math\.random|messages\.length/, 'positions and list length must not decide a date');
});

test('the day separator renders a rule around the label and computes nothing itself', () => {
  assert.match(daySeparator, /className="chat-day-separator" role="separator" aria-label=\{text\}/);
  assert.match(daySeparator, /className="chat-day-separator-label"/);
  assert.doesNotMatch(daySeparator, /new Date|Date\.now\(/, 'the label is handed in by the model');
});

test('the day separator is styled as two fading rules around a mono label', () => {
  assert.match(chatStyles, /\.chat-day-separator \{[^}]*align-self: stretch;/);
  assert.match(chatStyles, /\.chat-day-separator::before,\s*\.chat-day-separator::after \{[^}]*height: 1px;/);
  assert.match(chatStyles, /\.chat-day-separator-label \{\s*flex: 0 0 auto;/);
});

test('only the render list gains rows; annotations and last-turn gating keep the raw messages', () => {
  assert.match(chatPanel, /selectAnnotationMessages\(messages, conversationId\)/);
  assert.match(chatPanel, /row\.taskId === messages\.at\(-1\)\?\.taskId/);
});
