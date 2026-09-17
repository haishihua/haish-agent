import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConversationNode } from '../../src/features/conversations/components/ConversationNode.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { approvalStore } from '../../src/features/approvals/model/approval-store.js';
import '../../styles/base.css';
import '../../styles/panels.css';

// 会话行状态灯（生产 ConversationNode + 生产 useConversationRunState + 生产 approvalStore）。
//
// 判据只有一份（conversations/model/conversation-run-state.js）：任务未落终态 = 在跑；
// 后端实时快照里有未回答提问 / 未决审批 = 在等人；任务落地终态 = 熄灯——即使快照里
// 还留着那条旧账。
//
// 事件用 window.haish.onApprovalEvent 的替身推进（approvalStore 就是这么接后端的），
// 每一步都断言真实 DOM：类名、aria-label、琥珀色、金色 glyph 尺寸、不吃点击。
const listeners = new Set();
window.haish = {
  onApprovalEvent(handler) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },
  resolveApproval: async () => {},
};

const emit = (payload) => {
  flushSync(() => {
    for (const handler of [...listeners]) handler(payload);
  });
};

const CONVERSATION = { id: 'conv-lamp', name: '会话状态灯', expanded: false, pinned: false };
// 任务卡只在会话展开时才渲染。
const EXPANDED = { ...CONVERSATION, expanded: true };
const TASKS = {
  running: [{ taskId: 'task-lamp', title: '跑一个任务', status: 'running' }],
  landed: [{ taskId: 'task-lamp', title: '跑一个任务', status: 'done', completedAt: 1758000000000 }],
  // 两张卡都还在跑、都还没有 workflowRun（模拟轮询还没追上后端）。
  cards: [
    { taskId: 'task-lamp', title: '跑一个任务', status: 'running' },
    { taskId: 'task-other', title: '另一个任务', status: 'running' },
  ],
};

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const lamp = () => document.querySelector('.conversation-running-indicator');
const lampLabel = () => lamp()?.getAttribute('aria-label') || '';
const lampHasClass = (name) => Boolean(lamp()?.classList.contains(name));
const lampColor = () => (lamp() ? getComputedStyle(lamp()).color : '');
const lampPointerEvents = () => (lamp() ? getComputedStyle(lamp()).pointerEvents : '');
const glyphBox = () => {
  const glyph = lamp()?.querySelector('.conversation-status-glyph');
  if (!glyph) return null;
  const rect = glyph.getBoundingClientRect();
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
};

const cardByTitle = (title) => [...document.querySelectorAll('.conversation-task-card')]
  .find((card) => card.querySelector('.conversation-task-title')?.textContent === title) || null;
const cardGlyphBox = (card) => {
  const glyph = card?.querySelector('.conversation-status-glyph');
  if (!glyph) return null;
  const rect = glyph.getBoundingClientRect();
  return { width: Math.round(rect.width), height: Math.round(rect.height) };
};
const cardGlyphColor = (card) => {
  const icon = card?.querySelector('.conversation-task-status-icon');
  return icon ? getComputedStyle(icon).color : '';
};

// 「等你回答」的图标 = 气泡 + 问号（lucide message-circle-question）：类名认 lucide 的名字，
// 形状认几何节点数（旧的手绘空白气泡只有 1 条路径，现在是气泡 + 问号曲线 + 点）。
const glyphPaths = (glyph) => [...(glyph?.querySelectorAll('path, circle') || [])]
  .map((node) => node.getAttribute('d') || '');
const isQuestionBubble = (glyph) => /(^|\s)lucide-message-circle-question/.test(String(glyph?.getAttribute('class') || ''))
  && glyphPaths(glyph).length >= 3;

let root = null;
let mountNode = null;

function render(tasks, conversation = CONVERSATION) {
  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        <div className="conversations-panel" style={{ position: 'relative', width: 280, padding: 12 }}>
          <ConversationNode
            project={{ id: 'project-lamp' }}
            conversation={{ ...conversation, tasks }}
            active={false}
            nodeRef={null}
            onSelectConversation={() => {}}
            onRequestDeleteConversation={() => {}}
          />
        </div>
      </AppTooltipProvider>,
    );
  });
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function runChecks() {
  mountNode = document.createElement('div');
  mountNode.className = 'app-shell';
  document.getElementById('root').appendChild(mountNode);
  root = createRoot(mountNode);

  approvalStore.start();
  render(TASKS.landed);
  await frame();
  await nextTick();

  // 先确认这一行真的渲染出来了：后面好几项断言的是「查不到指示灯」，
  // 要是整块渲染失败，那些断言会假装通过。
  const renderedRow = document.querySelector('.conversation-row');
  check(
    'the conversation row itself rendered',
    document.querySelectorAll('.conversation-row').length === 1 && Boolean(renderedRow?.textContent.includes('会话状态灯')),
    `rows=${document.querySelectorAll('.conversation-row').length} text=${renderedRow?.textContent || 'missing'}`,
  );
  check('landed task + stale input snapshot stays dark', lamp() === null, `lamp=${lampLabel()}`);

  emit({ type: 'input_requested', request_id: 'req-a', conversation_id: 'conv-lamp', task_id: 'task-lamp' });
  await frame();
  check('answered-for-good task does not relight on a stale request', lamp() === null, `lamp=${lampLabel()}`);

  render(TASKS.running);
  await frame();
  check('live task with a pending question shows the amber wait glyph', lampHasClass('waiting-input'), `classes=${lamp()?.className || ''}`);
  check('the wait glyph is labelled for screen readers', lampLabel() === 'Waiting for your answer', `label=${lampLabel()}`);
  check('the lamp role is a status announcement', lamp()?.getAttribute('role') === 'status', `role=${lamp()?.getAttribute('role')}`);
  check('the wait glyph reuses the shared amber stroke', lampColor() === 'rgb(239, 191, 100)', `color=${lampColor()}`);
  check('the wait glyph is drawn at the row size', JSON.stringify(glyphBox()) === JSON.stringify({ width: 15, height: 15 }), JSON.stringify(glyphBox()));
  check(
    'the row wait glyph is the question bubble, not a blank one',
    isQuestionBubble(lamp()?.querySelector('.conversation-status-glyph')),
    `class=${lamp()?.querySelector('.conversation-status-glyph')?.getAttribute('class') || 'missing'} paths=${glyphPaths(lamp()?.querySelector('.conversation-status-glyph')).length}`,
  );
  check('the lamp never eats clicks meant for pin / trash', lampPointerEvents() === 'none', `pointer-events=${lampPointerEvents()}`);

  emit({ type: 'input_resolved', request_id: 'req-a' });
  await frame();
  check('answering the question flips straight back to the blue spinner', Boolean(lamp()?.querySelector('.ico-loading')) && !lampHasClass('waiting-input'), `classes=${lamp()?.className || ''}`);

  emit({ type: 'approval_requested', request_id: 'req-b', conversation_id: 'conv-lamp', task_id: 'task-lamp', tool_name: 'exec_command' });
  await frame();
  check('a pending approval shows the amber approval glyph', lampHasClass('awaiting-approval') && lampLabel() === 'Awaiting approval', `classes=${lamp()?.className || ''}`);
  check('the approval glyph is the same amber', lampColor() === 'rgb(239, 191, 100)', `color=${lampColor()}`);

  emit({ type: 'approval_resolved', request_id: 'req-b', outcome: 'allow' });
  await frame();
  check('resolving the approval flips back to the blue spinner', Boolean(lamp()?.querySelector('.ico-loading')), `classes=${lamp()?.className || ''}`);

  emit({ type: 'input_requested', request_id: 'req-c', conversation_id: 'conv-other', task_id: 'task-other' });
  await frame();
  check("another conversation's question never lights this row", Boolean(lamp()?.querySelector('.ico-loading')), `classes=${lamp()?.className || ''}`);

  emit({ type: 'input_requested', request_id: 'req-d', conversation_id: 'conv-lamp', task_id: 'task-lamp' });
  await frame();
  check('this conversation waits again as soon as the agent asks', lampHasClass('waiting-input'), `classes=${lamp()?.className || ''}`);

  render(TASKS.landed);
  await frame();
  check('a landed task turns the lamp off even while the snapshot still lists it', lamp() === null, `lamp=${lampLabel()}`);

  emit({ type: 'input_resolved', request_id: 'req-d' });
  await frame();
  check('the row stays dark after the stale request clears', lamp() === null, `lamp=${lampLabel()}`);

  // 任务卡：卡片状态串来自任务拷贝（要等轮询才追上），「在等人」必须由实时快照立刻点亮。
  emit({ type: 'input_requested', request_id: 'req-e', conversation_id: 'conv-lamp', task_id: 'task-lamp' });
  render(TASKS.cards, EXPANDED);
  await frame();
  const waitingCard = cardByTitle('跑一个任务');
  const otherCard = cardByTitle('另一个任务');
  check(
    'both live task cards rendered before the wait check',
    Boolean(waitingCard) && Boolean(otherCard),
    `cards=${document.querySelectorAll('.conversation-task-card').length}`,
  );
  check(
    'a live task card turns amber the moment the question arrives (no poll needed)',
    Boolean(waitingCard?.querySelector('.conversation-task-status-icon.waiting-input')),
    `card=${waitingCard?.className || 'missing'} icon=${waitingCard?.querySelector('.conversation-task-status-icon')?.className || 'none'}`,
  );
  check(
    'the card keeps the waiting label for screen readers',
    waitingCard?.querySelector('[role="status"]')?.getAttribute('aria-label') === 'Waiting for input',
    waitingCard?.querySelector('[role="status"]')?.getAttribute('aria-label') || 'missing',
  );
  check(
    'the card glyph is drawn at the task-card size',
    JSON.stringify(cardGlyphBox(waitingCard)) === JSON.stringify({ width: 17, height: 17 }),
    JSON.stringify(cardGlyphBox(waitingCard)),
  );
  check(
    'the card wait glyph is the same question bubble as the lamp',
    isQuestionBubble(waitingCard?.querySelector('.conversation-status-glyph')),
    `class=${waitingCard?.querySelector('.conversation-status-glyph')?.getAttribute('class') || 'missing'}`,
  );
  check(
    'the card glyph reuses the shared amber stroke',
    cardGlyphColor(waitingCard) === 'rgb(239, 191, 100)',
    cardGlyphColor(waitingCard),
  );
  check(
    "another task's card never lights up for someone else's question",
    Boolean(otherCard?.querySelector('.conversation-task-status-icon.pending .ico-loading')),
    `card=${otherCard?.className || 'missing'}`,
  );

  emit({ type: 'input_resolved', request_id: 'req-e' });
  await frame();
  check(
    'answering flips the task card straight back to the running spinner',
    Boolean(waitingCard?.querySelector('.conversation-task-status-icon.pending .ico-loading'))
      && !waitingCard?.querySelector('.conversation-task-status-icon.waiting-input'),
    `card=${waitingCard?.className || 'missing'}`,
  );
  check('no page error was raised while driving the lamp', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return results;
}

let checksPromise = null;
function start() {
  if (!checksPromise) checksPromise = runChecks();
  return checksPromise;
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail && !entry.pass ? ` (${entry.detail})` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  return { failed: failed.length, total: list.length, results: list };
};

window.__lampChecks = async () => report(await start());
window.__lampAutoRun = () => { start().then(report).catch((error) => { report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]); }); };

window.__lampAutoRun();
