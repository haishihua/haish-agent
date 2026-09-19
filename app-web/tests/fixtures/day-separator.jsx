// 会话详情日期分隔（assistant-ui day-separator 元素风格）回归页：生产 ChatPanel + 真实时间戳。
//
// 断言：日期头只在消息自己的 created_at 跨天处出现（首条消息也有头），头在当天第一条
// 消息前面、同一天共享一条；追加同一天的消息不会多加头，跨到新的一天立刻多一条；
// 每条消息自己的时间仍留在它的悬停浮标（.chat-bubble-clock）上，日期头里没有时间。
// 时间戳全部按本地日历日构造，断言不依赖时区。

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const originalFetch = window.fetch;
const storageSnapshot = Object.fromEntries(Object.entries(localStorage));
window.fetch = (input, init) => {
  if (String(input).includes('/api/')) {
    if (String(input).endsWith('/api/llm/models')) {
      const model = JSON.parse(init.body).model;
      return Promise.resolve(Response.json({ models: [model], default_model: model }));
    }
    return Promise.reject(new Error('Unexpected API call in offline fixture'));
  }
  return originalFetch(input, init);
};

const report = document.getElementById('checks');
const checks = [];
function check(condition, name) {
  if (!condition) throw new Error(name);
  checks.push(`PASS ${name}`);
  report.textContent = checks.join('\n');
}
const tick = async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  await new Promise((resolve) => setTimeout(resolve, 30));
};

// —— 真实时间戳：两天前 / 昨天 / 今天，全部本地时间 ——
const dayStart = (daysAgo, hour, minute) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, hour, minute, 0, 0).getTime();
};
const olderDay = dayStart(2, 16, 4);
const yesterday = dayStart(1, 15, 30);
const today = dayStart(0, 9, 12);

// 期望的日期文案独立算（Intl，生产代码里的月份表不参与）：今天 / 昨天 / 「Sep 16」。
const shortDate = (ms) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(ms));
const clockText = (ms) => {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const olderPair = [
  { id: 'older-user', taskId: 'older-task', role: 'user', text: '前天的提问', status: 'done', createdAt: olderDay },
  { id: 'older-agent', taskId: 'older-task', role: 'agent', text: '前天的回答', status: 'done', createdAt: olderDay, completedAt: olderDay + 42000 },
];
const chronologicalRows = [
  { id: 'yesterday-user', taskId: 'yesterday-task', role: 'user', text: '昨天的提问', status: 'done', createdAt: yesterday },
  { id: 'today-agent', taskId: 'today-task', role: 'agent', text: '今天的回答', status: 'done', createdAt: today, completedAt: today + 60000 },
  { id: 'today-user', taskId: 'today-task-2', role: 'user', text: '今天的追问', status: 'done', createdAt: today + 90000 },
];
let messages = [...olderPair, ...chronologicalRows];

const root = createRoot(document.getElementById('root'));
const render = () => flushSync(() => root.render(
  <AppTooltipProvider>
    <ChatPanel conversationId="day-separator-fixture" messages={messages} />
  </AppTooltipProvider>,
));

const listRows = () => [...document.querySelector('.chat-message-list').children]
  .filter((node) => node.classList.contains('chat-day-separator') || node.classList.contains('chat-message-row'));
const rowKey = (node) => (node.classList.contains('chat-day-separator')
  ? `day:${node.querySelector('.chat-day-separator-label')?.textContent || ''}`
  : `msg:${node.dataset.messageId || ''}`);
const separators = () => [...document.querySelectorAll('.chat-day-separator')];

async function run() {
  try {
    render();
    await tick();

    // 1. 只在跨天处出现，首条消息也有一条头（列表从历史中间打开时同样成立）。
    check(JSON.stringify(separators().map((node) => node.textContent)) === JSON.stringify([shortDate(olderDay), 'Yesterday', 'Today']),
      `日期头按消息自己的时间戳跨天出现：${separators().map((node) => node.textContent).join(' | ')}`);

    // 2. 五条消息只插三条头：同一天的消息共享一条。
    check(separators().length === 3, `同一天共享一条日期头（5 条消息 / 3 条头，实际 ${separators().length}）`);

    // 3. 头永远在当天第一条消息前面，消息顺序原样保留。
    check(JSON.stringify(listRows().map(rowKey)) === JSON.stringify([
      `day:${shortDate(olderDay)}`, 'msg:older-user', 'msg:older-agent',
      'day:Yesterday', 'msg:yesterday-user',
      'day:Today', 'msg:today-agent', 'msg:today-user',
    ]), `日期头挨着当天第一条消息：${listRows().map(rowKey).join(' ')}`);

    // 4. 头是分隔线本身：无障碍名字就是那一天，里面没有消息行、也没有时间字样。
    const first = separators()[0];
    check(first.getAttribute('role') === 'separator' && first.getAttribute('aria-label') === shortDate(olderDay),
      `日期头是 separator，名字是那一天（aria-label=${first.getAttribute('aria-label')}）`);
    check(!first.querySelector('.chat-message-row') && !/\d{1,2}:\d{2}/.test(first.textContent),
      '日期头里没有消息内容，也没有时间——时间不在这里重复');

    // 5. 时间仍留在每条消息自己的悬停浮标上（生产 formatMessageClock 的输出 == 本地时间）。
    const expectedClocks = new Map([
      ['older-user', clockText(olderDay)],
      ['older-agent', clockText(olderDay + 42000)],
      ['yesterday-user', clockText(yesterday)],
      ['today-agent', clockText(today + 60000)],
      ['today-user', clockText(today + 90000)],
    ]);
    const actualClocks = [...document.querySelectorAll('.chat-message-row[data-message-id]')]
      .map((row) => [row.dataset.messageId, row.querySelector('.chat-bubble-clock')?.textContent || '']);
    check(actualClocks.length === expectedClocks.size
      && actualClocks.every(([id, text]) => expectedClocks.get(id) === text),
    `每条消息的悬停时间还是它自己的时间戳：${actualClocks.map(([id, text]) => `${id}=${text}`).join(' ')}`);

    // 6. 样式真的生效：一对 1px 细线夹一个等宽日期。
    const separatorStyle = getComputedStyle(first);
    check(separatorStyle.alignSelf === 'stretch'
      && getComputedStyle(first, '::before').height === '1px'
      && getComputedStyle(first, '::after').height === '1px',
    'chat.css 生效：日期头两侧各一条 1px 细线');
    check(getComputedStyle(first.querySelector('.chat-day-separator-label')).fontFamily.includes('JetBrains Mono'),
      '日期字用等宽体，和悬停浮标同族');

    // 7. 同一天再来一条：头数不变。
    messages = [...messages, { id: 'today-followup', taskId: 'today-task-3', role: 'user', text: '今天的再一条', status: 'done', createdAt: today + 150000 }];
    render();
    await tick();
    check(separators().length === 3 && separators().at(-1).textContent === 'Today',
      `同一天追加消息不会多加日期头（实际 ${separators().length} 条）`);

    // 8. 跨到新的一天（第二天早上）：立刻多一条头，不用刷新。
    const nextDay = dayStart(-1, 8, 30);
    messages = [...messages, { id: 'next-day-user', taskId: 'next-day-task', role: 'user', text: '第二天的提问', status: 'done', createdAt: nextDay }];
    render();
    await tick();
    check(separators().length === 4 && separators().at(-1).textContent === shortDate(nextDay),
      `跨到新的一天立刻多一条日期头（${separators().at(-1).textContent}）`);

    // 9. 全程没有页面报错。
    check(window.__pageErrors.length === 0, `没有页面报错（${window.__pageErrors.join(' | ') || 'none'}）`);

    report.dataset.result = 'PASS';
  } catch (error) {
    report.dataset.result = 'FAIL';
    report.textContent = [...checks, `FAIL ${error && (error.stack || error.message) || String(error)}`].join('\n');
  } finally {
    flushSync(() => root.render(null));
    window.fetch = originalFetch;
    for (const key of Object.keys(localStorage)) if (!(key in storageSnapshot)) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(storageSnapshot)) localStorage.setItem(key, value);
  }
}

run();
