import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

// The steering message is the instruction typed while a run was already going. It
// keeps its place inside the interrupted assistant box, but it must look exactly
// like the message the user sent first: same bubble surface, same body type, same
// line breaks. `chat-timeline-user-input-bubble` therefore shares the user bubble
// declarations instead of carrying its own — this page measures both in a real
// render (no component copies).
const USER_TEXT = '那就先保持现状吧，但是这个写不对啊，不需要再去解析合同了啊\n直接拿审批侧传进来的合同类型去我们库里查一下不就能确定是否可用的';
const STEERING_TEXT = '还有你就改设计\n不要改prd啊';

const rows = [
  {
    id: 'turn-user', messageId: 'saved-user', role: 'user', status: 'done',
    text: USER_TEXT, conversationId: 'fixture', taskId: 'task-1',
    createdAt: Date.UTC(2026, 8, 16, 3, 40, 0),
  },
  {
    id: 'turn-agent', messageId: 'saved-agent', role: 'agent', status: 'done', streaming: false,
    text: '', conversationId: 'fixture', taskId: 'task-1',
    createdAt: Date.UTC(2026, 8, 16, 3, 41, 0), completedAt: Date.UTC(2026, 8, 16, 3, 42, 0),
    traceTimeline: [
      { id: 'trace-fetch', kind: 'meta', summary: 'Fetched 7 times · visualized 4 images', status: 'done', details: [] },
      { id: 'trace-steering', kind: 'user_input', text: STEERING_TEXT, images: [] },
    ],
    traceLatestTodos: null,
  },
];

function App() {
  return (
    <AppTooltipProvider>
      <main className="steering-message-fixture">
        <section id="rows" aria-label="Conversation">
          {rows.map((message) => (
            <ChatMessageRow key={message.id} message={message} annotationNumbers={new Map()} forceTraceOpen />
          ))}
        </section>
      </main>
    </AppTooltipProvider>
  );
}

// Everything the two bubbles have to agree on. Colours, radius, border and padding
// are the surface; the body properties come from the shared `.chat-bubble-text`.
const SURFACE_PROPERTIES = [
  'backgroundColor', 'backgroundImage',
  'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'color', 'boxShadow',
];
const BODY_PROPERTIES = ['fontFamily', 'fontSize', 'lineHeight', 'whiteSpace', 'wordBreak'];

const checks = [];
const report = document.getElementById('checks');
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  checks.push(`PASS ${message}`);
  report.textContent = checks.join('\n');
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 120));
const snapshot = (node, properties) => Object.fromEntries(
  properties.map((property) => [property, getComputedStyle(node)[property]]),
);
const differences = (left, right) => Object.keys(left).filter((key) => left[key] !== right[key]);

async function run() {
  const root = createRoot(document.getElementById('root'));
  flushSync(() => root.render(<App />));
  await tick();

  const userBubble = document.querySelector('.chat-message-row.user .message-speech-body');
  const agentBody = document.querySelector('.chat-message-row.agent .message-speech-body');
  const steeringBubble = document.querySelector('.chat-timeline-user-input-bubble');
  check(Boolean(userBubble && agentBody && steeringBubble), '用户气泡、assistant 回复框与纠偏气泡都渲染出来了');

  const surfaceDiff = differences(snapshot(userBubble, SURFACE_PROPERTIES), snapshot(steeringBubble, SURFACE_PROPERTIES));
  check(surfaceDiff.length === 0, `纠偏气泡与用户气泡的外观逐项相同（差异: ${surfaceDiff.length ? JSON.stringify(surfaceDiff.map((key) => [key, getComputedStyle(userBubble)[key], getComputedStyle(steeringBubble)[key]])) : '无'}）`);

  const userBody = userBubble.querySelector('.chat-bubble-text');
  const steeringBody = steeringBubble.querySelector('.chat-bubble-text');
  check(Boolean(userBody && steeringBody), '两条消息的正文都走 .chat-bubble-text');
  const bodyDiff = differences(snapshot(userBody, BODY_PROPERTIES), snapshot(steeringBody, BODY_PROPERTIES));
  check(bodyDiff.length === 0, `纠偏正文排版与用户正文逐项相同（差异: ${bodyDiff.length ? JSON.stringify(bodyDiff.map((key) => [key, getComputedStyle(userBody)[key], getComputedStyle(steeringBody)[key]])) : '无'}）`);

  check(steeringBody.querySelectorAll('br').length === (STEERING_TEXT.match(/\n/g) || []).length,
    '纠偏消息保留输入时的换行');
  check(steeringBody.textContent.replace(/\s+/g, '') === STEERING_TEXT.replace(/\s+/g, ''),
    '纠偏消息逐字显示用户输入的内容');
  check(agentBody.contains(steeringBubble),
    '纠偏气泡仍嵌在被打断的 assistant 回复框内（没有另起一条独立消息）');
  check(document.querySelectorAll('.chat-timeline-user-input-bubble').length === 1
    && document.querySelectorAll('.chat-message-row.user').length === 1,
    '纠偏消息没有被复制成第二条用户消息');

  report.dataset.result = 'PASS';
  report.textContent = checks.join('\n');
}

run().catch((error) => {
  report.dataset.result = 'FAIL';
  report.textContent = [...checks, `FAIL ${error && (error.stack || error.message) || String(error)}`].join('\n');
});
