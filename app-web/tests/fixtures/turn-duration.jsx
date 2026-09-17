import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

// 截图里那一行：「Simple Agent ›  0s」，正文一行都没有。0s 不是量出来的，是
// `label={elapsed || '0s'}` 在「这份拷贝没有 completedAt（还没收到终态）」时编出来的。
// 一根真时间戳都没有时，时长就该空着；有 completedAt 时必须是量出来的那个数。
const START = Date.UTC(2026, 8, 17, 1, 48, 17);
const TURN_MS = 65_000;

const traceItem = (id) => ({ id, kind: 'meta', summary: 'Fetched 7 times · visualized 4 images', status: 'done', details: [] });

const rows = [
  {
    // A. 正常收工：正文 + 量出来的时长。
    id: 'turn-done', messageId: 'saved-done', role: 'agent', status: 'done', streaming: false,
    text: '全部改完了，测试也绿了。', conversationId: 'fixture', taskId: 'task-done',
    createdAt: START, completedAt: START + TURN_MS,
    traceTimeline: [traceItem('done-trace')], traceLatestTodos: null,
  },
  {
    // B. 折叠态 + 拷贝里没有 completedAt：步骤还能展开，但数字位置必须是空的。
    id: 'turn-collapsed-no-duration', messageId: 'saved-collapsed', role: 'agent', status: 'done', streaming: false,
    text: '这一轮没有记完成时间。', conversationId: 'fixture', taskId: 'task-collapsed',
    createdAt: START, completedAt: undefined,
    traceTimeline: [traceItem('collapsed-trace')], traceLatestTodos: null,
  },
  {
    // C. 展开态 + 没有 completedAt 但有首字时间：计时器只认 completedAt，没到终态就不显示。
    id: 'turn-open-no-duration', messageId: 'saved-open', role: 'agent', status: 'done', streaming: false,
    traceOpen: true, text: '这一轮也没有完成时间。', conversationId: 'fixture', taskId: 'task-open',
    createdAt: START, completedAt: undefined, firstTokenAt: START,
    traceTimeline: [traceItem('open-trace')], traceLatestTodos: null,
  },
  {
    // D. 还在跑：计时从首字开始走，也是量出来的。
    id: 'turn-streaming', messageId: 'saved-streaming', role: 'agent', status: 'running', streaming: true,
    text: '', conversationId: 'fixture', taskId: 'task-streaming',
    createdAt: Date.now(), completedAt: undefined, firstTokenAt: Date.now() - TURN_MS,
    traceTimeline: [traceItem('streaming-trace')], traceLatestTodos: null,
  },
];

function App() {
  return (
    <AppTooltipProvider>
      <main className="turn-duration-fixture">
        <section id="rows" aria-label="Conversation">
          {rows.map((message) => (
            <ChatMessageRow key={message.id} message={message} annotationNumbers={new Map()} />
          ))}
        </section>
      </main>
    </AppTooltipProvider>
  );
}

const checks = [];
const report = document.getElementById('checks');
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  checks.push(`PASS ${message}`);
  report.textContent = checks.join('\n');
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
const row = (id) => document.querySelector(`[data-message-id="${id}"]`);
const collapsedLabel = (node) => node?.querySelector('.chat-timeline-collapsed-text')?.textContent ?? null;
const collapsedName = (node) => node?.querySelector('.chat-timeline-collapsed')?.getAttribute('aria-label') ?? null;
const fabricsZeroSeconds = (node) => /(^|\s)0s(\s|$)/.test(String(node?.textContent || ''));

async function run() {
  const root = createRoot(document.getElementById('root'));
  flushSync(() => root.render(<App />));
  await tick();

  const done = row('turn-done');
  const collapsed = row('turn-collapsed-no-duration');
  const open = row('turn-open-no-duration');
  const streaming = row('turn-streaming');
  check(Boolean(done && collapsed && open && streaming), '四条消息行都渲染出来了');

  // A. 落地的那一轮：正文在，时长是量出来的。
  check(done.querySelector('.chat-bubble-text')?.textContent.includes('全部改完了'),
    '收到终态的那一轮照旧显示最终回答');
  check(collapsedLabel(done) === '1m 05s', `收到终态的那一轮显示量出来的时长（实际: ${JSON.stringify(collapsedLabel(done))}）`);
  check(!fabricsZeroSeconds(done), '收到终态的那一轮里没有 0s');

  // B. 拷贝里没有完成时间：折叠按钮还在，数字位置留空。
  check(Boolean(collapsed.querySelector('.chat-timeline-collapsed')), '有执行记录的轮次仍然可以展开步骤');
  check(collapsedLabel(collapsed) === '',
    `没有完成时间时折叠按钮不显示数字（实际: ${JSON.stringify(collapsedLabel(collapsed))}）`);
  check(!fabricsZeroSeconds(collapsed), '折叠按钮没有编出 0s');
  // 数字位空了，按钮不能跟着变成没名字的按钮（箭头图标是 aria-hidden 的）。
  check(collapsedName(collapsed) === 'Show steps',
    `数字位留空时按钮仍要有名字（实际: ${JSON.stringify(collapsedName(collapsed))}）`);
  check(collapsedName(done) === '1m 05s',
    `有时长时按钮名字就是那个真数字，不额外编词（实际: ${JSON.stringify(collapsedName(done))}）`);

  // C. 展开态：计时器根本没渲染。
  check(!open.querySelector('.chat-timeline-elapsed-pill'), '没有完成时间时不渲染计时器');
  check(!fabricsZeroSeconds(open), '展开态里没有 0s');

  // D. 还在跑：计时从首字起走，同样是量出来的。
  const streamingLabel = collapsedLabel(streaming) || streaming.querySelector('.chat-timeline-elapsed-pill .chat-timeline-collapsed-text')?.textContent;
  check(streamingLabel === '1m 05s', `在跑的轮次从首字开始计时（实际: ${JSON.stringify(streamingLabel)}）`);
  check(!streaming.querySelector('.chat-bubble-text'), '在跑的轮次不提前渲染最终回答正文');

  report.dataset.result = 'PASS';
  report.textContent = checks.join('\n');
}

run().catch((error) => {
  report.dataset.result = 'FAIL';
  report.textContent = [...checks, `FAIL ${error && (error.stack || error.message) || String(error)}`].join('\n');
});
