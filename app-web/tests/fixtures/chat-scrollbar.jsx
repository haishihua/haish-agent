// 会话详情滚动条：常显 / 可拖 / 滑块随内容自适应——真实 ChatPanel + base.css + chat.css。
//
// 用户要的三件事：滚动的时候看得见滚动条、能直接按住拖动、滑块大小随会话详情长短自适应。
// 「滑块绘制」和「拖动」是浏览器内部行为，页面里断言不到；这里锁的是它们成立的前提：
//   1. 列表用的是经典滚动条（占位、不是浮层、没被 CSS 藏掉），且占位宽度就是
//      --chat-scrollbar-width（滑块尺寸由浏览器按 视口/内容 比例算，我们只给宽度）；
//   2. 这 10px 常驻占位落在列表自己的盒子右缘——命中测试命中的是列表本身，
//      指针落在上面时拖的是滑动条，而不是被谁盖住；
//   3. 右内边距扣掉了这 10px，正文右缘（含右对齐的用户气泡）仍与输入框写作区对齐；
//   4. 会话短到不用滚动时占位、对齐都不变（切会话不跳）。
// 反向断言（revert）：把 HEAD 里的 `scrollbar-width: none` + 隐藏 ::-webkit-scrollbar
// 注回去后，占位会塌成 0、正文右缘会偏离输入框——说明这两条确实在被测，不是常量。

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 长会话：撑出滚动条的那一类（窗口只渲染最近若干行，所以这里只要够长就行）。
const TURNS = 26;
const longMessages = Array.from({ length: TURNS }, (_, index) => ([
  { id: `long-user-${index}`, taskId: `long-task-${index}`, role: 'user', status: 'done', text: `第 ${index} 问：正文要够长，把会话详情撑出滚动条。` },
  { id: `long-answer-${index}`, taskId: `long-task-${index}`, messageId: `long-saved-${index}`, role: 'agent', status: 'done', text: `第 ${index} 答：${'这一段说明用来占高度。'.repeat(6)}` },
])).flat();
const shortMessages = [
  { id: 'short-user-0', taskId: 'short-task-0', role: 'user', status: 'done', text: '短会话问一句。' },
  { id: 'short-answer-0', taskId: 'short-task-0', messageId: 'short-saved-0', role: 'agent', status: 'done', text: '短会话答一句。' },
];

const PROVIDER_OPTIONS = [{ id: 'fixture', provider: 'fixture', defaultModelId: 'fixture-model', modelOptions: ['fixture-model'] }];
const originalFetch = window.fetch;
window.fetch = (input, init) => (String(input).includes('/api/')
  ? Promise.reject(new Error('Offline fixture: unexpected API call'))
  : originalFetch(input, init));

const root = createRoot(document.getElementById('root'));
const render = (conversationId, messages) => flushSync(() => root.render(
  <AppTooltipProvider>
    <ChatPanel conversationId={conversationId} messages={messages} providerOptions={PROVIDER_OPTIONS} />
  </AppTooltipProvider>,
));

const listNode = () => document.querySelector('.chat-message-list');
const editorNode = () => document.querySelector('.chat-composer-editor');
const round = (value) => Math.round(value * 10) / 10;

// 滚动条占位宽度：经典滚动条下 offsetWidth 比 clientWidth 多出的那一条。
const scrollbarStrip = (element) => element.offsetWidth - element.clientWidth;

// 正文能画到的最右处：列表盒子右缘扣掉右边框、右内边距和滚动条常驻占位。
const contentRight = (element) => {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return round(box.right
    - parseFloat(style.borderRightWidth || '0')
    - parseFloat(style.paddingRight || '0')
    - scrollbarStrip(element));
};

// 对照物：输入框那条外框的右缘（.chat-composer 的 border box）。
// --chat-gutter 的约定就是「正文右缘 = 输入框外框右缘」——两边同源，改一边要改另一边。
const composerFrameRight = () => round(document.querySelector('.chat-composer').getBoundingClientRect().right);

const barSnapshot = () => {
  const list = listNode();
  const style = getComputedStyle(list);
  const strip = scrollbarStrip(list);
  const viewport = list.clientHeight;
  const content = list.scrollHeight;
  return {
    strip,
    scrollbarWidth: style.scrollbarWidth,
    gutter: style.scrollbarGutter,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    viewport,
    content,
    // 浏览器按这个比例算滑块长度：内容越长滑块越短（我们只定宽度，长度是自适应的）。
    thumb: round((viewport * viewport) / content),
    overflow: content - viewport,
    bodyRight: contentRight(list),
    composerRight: composerFrameRight(),
    hit: document.elementFromPoint(
      list.getBoundingClientRect().right - strip / 2,
      list.getBoundingClientRect().top + 40,
    ),
  };
};

async function runChecks() {
  render('fixture-long', longMessages);
  await sleep(200);

  const long = barSnapshot();
  check(
    'the conversation body and the composer rendered',
    Boolean(listNode()) && Boolean(editorNode()),
    `list=${Boolean(listNode())} editor=${Boolean(editorNode())}`,
  );
  check(
    'the long conversation overflows, so there is something to scroll',
    long.overflow > 300,
    `content=${long.content} viewport=${long.viewport} overflow=${long.overflow}`,
  );

  // 1. 经典滚动条：占位 10px + 没有被 scrollbar-width 藏掉 + 常驻（stable）
  check(
    'the list keeps a real, reserved classic scrollbar instead of a hidden/fading overlay',
    long.strip === 10 && long.scrollbarWidth === 'auto' && long.gutter === 'stable',
    `strip=${long.strip} scrollbar-width=${long.scrollbarWidth} gutter=${long.gutter}`,
  );

  // 2. 占位属于列表自己：指针落在这一条上时，拖的是这个列表的滑动条
  check(
    'the scrollbar strip belongs to the list itself (pointer hits the list there)',
    long.hit === listNode(),
    `hit=${long.hit ? long.hit.className || long.hit.tagName : 'null'}`,
  );

  // 3. 滑块长度由浏览器按 视口/内容 比例算：我们只给它 10px 宽，长度是自适应的
  check(
    'the thumb length follows the viewport/content ratio (only the width is ours)',
    long.thumb >= 4 && long.thumb <= long.viewport / 2 && long.thumb < 40,
    `thumb≈${long.thumb}px of ${long.viewport}px viewport, content=${long.content}`,
  );

  // 4. 正文右缘与输入框外框右缘对齐（右内边距扣掉了滚动条占位）
  check(
    'the message body still lines up with the composer frame on the right',
    Math.abs(long.bodyRight - long.composerRight) <= 1.5,
    `body=${long.bodyRight} composer=${long.composerRight} paddingRight=${long.paddingRight}`,
  );
  check(
    'the right padding is the gutter minus the scrollbar (the left padding is the whole gutter)',
    parseFloat(long.paddingRight) + long.strip === parseFloat(long.paddingLeft),
    `padding=${long.paddingLeft}/${long.paddingRight} strip=${long.strip}`,
  );

  // 短会话：占位与对齐不变（不滚动也不跳）
  render('fixture-short', shortMessages);
  await sleep(200);
  const short = barSnapshot();
  check(
    'a conversation that does not overflow keeps the same reserved strip and alignment',
    short.overflow <= 2
      && short.gutter === 'stable'
      && Math.abs(short.bodyRight - long.bodyRight) <= 1.5
      && Math.abs(short.bodyRight - short.composerRight) <= 1.5,
    `overflow=${short.overflow} strip=${short.strip} bodyRight=${short.bodyRight} longBodyRight=${long.bodyRight}`,
  );

  check('no page error was raised while scrolling the conversation', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return results;
}

// revert：把 HEAD 的隐藏规则注回去，占位与对齐都应该破掉（反向证明断言有效）。
async function revertChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .chat-message-list { scrollbar-width: none !important; }
    .chat-message-list::-webkit-scrollbar { display: none !important; width: 0 !important; }
  `;
  document.head.appendChild(style);
  render('fixture-long', longMessages);
  await sleep(200);
  const list = listNode();
  const reverted = barSnapshot();
  const bodyRight = contentRight(list);
  return [
    { name: 'revert: hiding the scrollbar collapses the reserved strip to 0', pass: reverted.strip === 0, detail: `strip=${reverted.strip}` },
    {
      name: 'revert: with the bar hidden the body no longer lines up with the composer frame',
      pass: Math.abs(bodyRight - reverted.composerRight) > 1,
      detail: `body=${bodyRight} composer=${reverted.composerRight}`,
    },
  ];
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail ? ` [${entry.detail}]` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  return { failed: failed.length, total: list.length, results: list };
};

window.__chatScrollbarChecks = async () => report(await runChecks());
window.__chatScrollbarRevertChecks = async () => report(await revertChecks());
// 手动看/量的时候用：把长会话或短会话摆出来（长会话才有滑块可拖）。
window.__chatScrollbarShow = (which = 'long') => (which === 'short'
  ? render('fixture-short', shortMessages)
  : render('fixture-long', longMessages));
window.__chatScrollbarAutoRun = () => {
  runChecks().then(report).catch((error) => {
    report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
  });
};

window.__chatScrollbarAutoRun();
