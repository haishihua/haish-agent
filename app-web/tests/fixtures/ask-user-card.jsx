import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AskUserInlineForm } from '../../src/features/chat/components/AskUserInlineForm.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { approvalStore } from '../../src/features/approvals/model/approval-store.js';
import '../../styles/base.css';
import '../../styles/approvals.css';

// 提问卡（生产 AskUserInlineForm + 生产 approvalStore + 生产 PortalTooltip）。
//
// 两处被用户点名的问题在这里钉死：
//  1. 输入框提示语：以前是表单味的 "Extra details (optional)…"，现在必须说清
//     「可以加备注，也可以自己写答案」；
//  2. 题目翻页：以前是 18px 无边框的 ‹ › 字形 + 暗灰 "1 / 4"，现在是 26px 描边圆
//     按钮 + "Question 1 of 2" + 悬停说明，点一下真的切到下一题。
// 顺带走完整条链路：选选项 + 备注 → 下一题手写答案 → 提交，后端收到的是
// 「一题一条答案」的唯一形状（selection + note / freeform）。

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(String(event.reason)));

const listeners = new Set();
const resolved = [];
window.haish = {
  onApprovalEvent(handler) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },
  resolveApproval: async (kind, requestId, payload) => {
    resolved.push({ kind, requestId, payload });
  },
};

const emit = (payload) => {
  flushSync(() => {
    for (const handler of [...listeners]) handler(payload);
  });
};

const REQUEST = {
  type: 'input_requested',
  request_id: 'req-ask',
  conversation_id: 'conv-ask',
  task_id: 'task-ask',
  tool_call_id: 'call-ask',
  context: '好，再问你几个问题，用来确认这轮的目标、范围和验收标准。',
  questions: [
    {
      id: 'goal',
      header: '本轮目标',
      question: '这一轮你最想让我完成什么？',
      options: [
        { label: '继续视觉与工具验收', description: '再发图/截图，我识别并复述关键信息。' },
        { label: '真实开发任务', description: '需求澄清、详设、编码、单测、缺陷修复或变更提交。' },
      ],
    },
    { id: 'acceptance', header: '验收', question: '这轮算完成的标准是什么？' },
  ],
  status: 'pending',
};

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });

const questions = () => [...document.querySelectorAll('.haish-user-input-question')];
const countEl = () => document.querySelector('.aicss-step-count');
const arrows = () => [...document.querySelectorAll('.aicss-step-arrow')];
const previousArrow = () => arrows()[0] || null;
const nextArrow = () => arrows()[1] || null;
const visibleQuestion = () => questions().find((fieldset) => fieldset.getClientRects().length > 0) || null;
const questionText = () => (visibleQuestion()?.querySelector('.haish-user-input-prompt')?.textContent || '').trim();
const textareaOf = (fieldset) => fieldset?.querySelector('.haish-user-input-textarea') || null;

const click = (element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const typeInto = (element, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

let root = null;
let mountNode = null;

async function settle() {
  await frame();
  await nextTick();
}

async function runChecks() {
  mountNode = document.createElement('div');
  mountNode.className = 'app-shell';
  mountNode.style.padding = '24px';
  document.getElementById('root').appendChild(mountNode);
  root = createRoot(mountNode);

  approvalStore.start();
  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        <AskUserInlineForm
          toolCallId="call-ask"
          toolInput={null}
          conversationId="conv-ask"
          taskId="task-ask"
          active
        />
      </AppTooltipProvider>,
    );
  });
  await settle();
  check('the card itself did not render before the request arrives', document.querySelector('.haish-user-input-card') === null);

  emit(REQUEST);
  await settle();

  const card = document.querySelector('.haish-user-input-card');
  check(
    'the card rendered with the agent context',
    Boolean(card?.textContent.includes('好，再问你几个问题')),
    card?.textContent?.slice(0, 60) || 'missing',
  );
  check('two questions are in the DOM', questions().length === 2, `questions=${questions().length}`);
  check('the first question is the visible one', questionText() === '这一轮你最想让我完成什么？', questionText());

  const optionFieldset = visibleQuestion();
  const optionPlaceholder = textareaOf(optionFieldset)?.placeholder || '';
  check(
    'an options question asks for a note or your own answer, not "extra details"',
    optionPlaceholder === 'Add a note, or type your own answer (optional)…',
    JSON.stringify(optionPlaceholder),
  );
  check(
    'the textarea is labelled for screen readers too',
    textareaOf(optionFieldset)?.getAttribute('aria-label') === 'Note or your own answer: 这一轮你最想让我完成什么？',
    textareaOf(optionFieldset)?.getAttribute('aria-label') || 'missing',
  );

  check('the pager states which question you are on', countEl()?.textContent === 'Question 1 of 2', countEl()?.textContent || 'missing');
  check('the first question cannot go back', previousArrow()?.disabled === true, `disabled=${previousArrow()?.disabled}`);
  check('the first question can go forward', nextArrow()?.disabled === false, `disabled=${nextArrow()?.disabled}`);

  const arrowBox = nextArrow()?.getBoundingClientRect();
  check(
    'the arrow is a 26px round button, not a bare glyph',
    Boolean(arrowBox) && Math.round(arrowBox.width) === 26 && Math.round(arrowBox.height) === 26
      && getComputedStyle(nextArrow()).borderTopWidth === '1px'
      && getComputedStyle(nextArrow()).borderTopLeftRadius === '999px',
    `box=${JSON.stringify(arrowBox && { width: Math.round(arrowBox.width), height: Math.round(arrowBox.height) })} border=${getComputedStyle(nextArrow()).borderTopWidth} radius=${getComputedStyle(nextArrow()).borderTopLeftRadius}`,
  );
  check(
    'the arrow draws a vector chevron',
    Boolean(nextArrow()?.querySelector('svg path')),
    `svg=${nextArrow()?.querySelector('svg')?.outerHTML?.slice(0, 40) || 'missing'}`,
  );
  check(
    'both arrows carry the hover tooltip',
    previousArrow()?.hasAttribute('data-haish-tooltip-trigger') && nextArrow()?.hasAttribute('data-haish-tooltip-trigger'),
    `previous=${previousArrow()?.outerHTML?.slice(0, 80) || 'missing'}`,
  );
  check(
    'the arrows stay labelled for screen readers',
    previousArrow()?.getAttribute('aria-label') === 'Previous question'
      && nextArrow()?.getAttribute('aria-label') === 'Next question',
    `${previousArrow()?.getAttribute('aria-label')} / ${nextArrow()?.getAttribute('aria-label')}`,
  );

  click(previousArrow());
  await settle();
  check('a disabled arrow changes nothing', countEl()?.textContent === 'Question 1 of 2', countEl()?.textContent || 'missing');

  click(nextArrow());
  await settle();
  check('clicking the forward arrow moves to the second question', questionText() === '这轮算完成的标准是什么？', questionText());
  check('the pager follows the step', countEl()?.textContent === 'Question 2 of 2', countEl()?.textContent || 'missing');
  check('the last question cannot go forward', nextArrow()?.disabled === true, `disabled=${nextArrow()?.disabled}`);
  check('the last question can go back', previousArrow()?.disabled === false, `disabled=${previousArrow()?.disabled}`);

  const freeformFieldset = visibleQuestion();
  const freeformPlaceholder = textareaOf(freeformFieldset)?.placeholder || '';
  check(
    'a question without options just asks for your answer',
    freeformPlaceholder === 'Type your answer…',
    JSON.stringify(freeformPlaceholder),
  );

  typeInto(textareaOf(freeformFieldset), '两轮全绿');
  await settle();
  check('submit is still gated until every question is answered', document.querySelector('.haish-approval-btn-once')?.disabled === true, `disabled=${document.querySelector('.haish-approval-btn-once')?.disabled}`);

  click(previousArrow());
  await settle();
  const firstFieldset = visibleQuestion();
  firstFieldset.querySelectorAll('input[type="radio"]')[1].click();
  typeInto(textareaOf(firstFieldset), '偏好单测覆盖');
  await settle();
  check('picking an option marks it selected', Boolean(firstFieldset.querySelector('.haish-user-input-option.is-selected')), firstFieldset.querySelector('.haish-user-input-option.is-selected')?.textContent || 'none');

  click(nextArrow());
  await settle();
  check('the second answer survived the round trip', textareaOf(visibleQuestion())?.value === '两轮全绿', textareaOf(visibleQuestion())?.value || 'empty');
  check('every question answered unlocks submit', document.querySelector('.haish-approval-btn-once')?.disabled === false, `disabled=${document.querySelector('.haish-approval-btn-once')?.disabled}`);

  click(document.querySelector('.haish-approval-btn-once'));
  await settle();
  await settle();

  check(
    'the answers reach the backend in the one canonical shape',
    JSON.stringify(resolved[0]) === JSON.stringify({
      kind: 'user_input',
      requestId: 'req-ask',
      payload: {
        answers: [
          { question_id: 'goal', kind: 'selection', values: ['真实开发任务'], note: '偏好单测覆盖' },
          { question_id: 'acceptance', kind: 'freeform', text: '两轮全绿' },
        ],
      },
    }),
    JSON.stringify(resolved[0] || null),
  );
  check('the answered card leaves the timeline', document.querySelector('.haish-user-input-card') === null);
  check('no page error was raised while answering', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
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

window.__askUserChecks = async () => report(await start());
window.__askUserAutoRun = () => {
  start()
    .then(report)
    .catch((error) => report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]));
};

window.__askUserAutoRun();
