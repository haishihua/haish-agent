import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

const report = document.getElementById('checks');
const checks = [];
// React 只在开发构建告警：同一个父节点里两个兄弟用同一个 key 时，key 映射会漏删旧
// 节点。把它变成一条断言，僵尸 DOM 才不会又静默通过。
const duplicateKeyWarnings = [];
const consoleError = console.error;
console.error = (...args) => {
  if (String(args[0]).includes('same key')) duplicateKeyWarnings.push(args.join(' '));
  else consoleError(...args);
};
const check = (condition, name) => {
  const line = `${condition ? 'PASS' : 'FAIL'} ${name}`;
  checks.push(line);
  report.textContent = checks.join('\n');
  if (!condition) throw new Error(name);
};
const tick = async () => {
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise(resolve => setTimeout(resolve, 80));
};
const wait = async (condition) => {
  for (let i = 0; i < 40; i += 1) { if (condition()) return; await tick(); }
  throw new Error('Timed out waiting for search UI');
};
// 每个会话都长到超过视口：右缘导轨（ConversationMap）只有在内容溢出时才渲染，
// 而它正是和搜索面板撞 key 的那个兄弟，必须真的在 DOM 里。
const conversationRows = (id, needle) => Array.from({ length: 8 }, (_, index) => ({
  conversationId: id,
  id: `${id}-row-${index}`,
  messageId: `${id}-m-${index}`,
  taskId: `${id}-task-${index}`,
  role: index % 2 === 0 ? 'user' : 'agent',
  status: 'done',
  text: index === 3
    ? `Body with the ${needle} word in ${id}.`
    : `Message ${index} of ${id} keeps the conversation long enough to overflow.`,
  traceTimeline: [],
}));
const messages = { alpha: conversationRows('alpha', 'alpha-needle'), beta: conversationRows('beta', 'beta-needle') };
const root = createRoot(document.getElementById('root'));
const draw = (id, { loading = false } = {}) => flushSync(() => root.render(
  <AppTooltipProvider><ChatPanel conversationId={id} messages={loading ? [] : messages[id]} loading={loading} providerOptions={[]} /></AppTooltipProvider>,
));
const list = () => document.querySelector('.chat-message-list');
const input = () => document.querySelector('[aria-label="Find in conversation"]');
const panel = () => document.querySelector('.haish-conversation-search-panel');
const searchRoots = () => document.querySelectorAll('.haish-conversation-search').length;
const count = () => document.querySelector('.haish-search-count')?.textContent;
const find = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
const type = (text) => {
  const field = input();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
};
const escape = () => input()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const closeButton = () => document.querySelector('[aria-label="Close search"]');
async function main() {
  draw('alpha'); await tick(); await tick();
  check(document.querySelectorAll('.conversation-map').length === 1, 'the overflowing conversation shows one conversation map');
  find(); await tick();
  check(Boolean(input()), 'Ctrl+F opens the search field');
  type('alpha-needle'); await wait(() => count() === '1 / 1');
  check(list().textContent.includes('alpha-needle'), 'searching finds the visible conversation text');

  // 用户报的问题：开着搜索（有关键词）切会话。以前搜索面板和右缘导轨都拿
  // conversationId 当 key，同一个父节点里两个兄弟撞 key，React 漏删搜索面板的
  // 旧节点：留下一个没有事件处理器的僵尸 DOM——看着还开着、0 matches、× 不关、
  // 输入框也打不了字。
  draw('beta'); await tick(); await tick();
  check(searchRoots() === 1, 'switching conversations leaves exactly one search root (no zombie DOM)');
  check(!panel(), 'switching conversations closes the search panel');
  check(!input(), 'switching conversations drops the stale query');
  check(!CSS.highlights.has('conversation-matches'), 'switching conversations clears search highlights');
  check(document.querySelectorAll('.conversation-map').length === 1, 'switching conversations leaves exactly one conversation map');

  find(); await tick();
  check(Boolean(input()), 'Ctrl+F still opens search after the switch');
  check(document.activeElement === input(), 'reopened search field takes focus');
  type('beta-needle'); await wait(() => count() === '1 / 1');
  check(list().textContent.includes('beta-needle'), 'the reopened search queries the new conversation');
  closeButton().click(); await tick(); await tick();
  check(!panel(), 'X closes the search panel in the new conversation');

  // 来回切：搜索状态不跟过去，也不把上一轮的 DOM 留在原地。
  draw('alpha'); await tick(); await tick();
  check(!panel(), 'returning to the first conversation keeps search closed');
  check(searchRoots() === 1, 'returning to the first conversation still has one search root');
  find(); await tick(); type('alpha-needle'); await wait(() => count() === '1 / 1');
  escape(); await tick(); await tick();
  check(!panel() && !CSS.highlights.has('conversation-matches'), 'Escape closes the search field');

  // 会话详情还没到（loading）时导轨不渲染：只剩一个兄弟，仍然要能正常收尾。
  draw('alpha', { loading: true }); await tick(); await tick();
  find(); await tick(); type('alpha');
  await tick();
  draw('beta'); await tick(); await tick();
  check(!panel(), 'switching while the conversation is loading closes the search field');
  check(searchRoots() === 1, 'switching while loading leaves exactly one search root');

  check(duplicateKeyWarnings.length === 0, 'search and conversation map never share a React key');
  report.dataset.result = 'PASS';
}
main().catch(error => { report.dataset.result = 'FAIL'; report.textContent += `\nFAIL ${error.stack || error}`; });
