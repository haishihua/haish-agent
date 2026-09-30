import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConversationsPanel } from '../../src/features/conversations/components/ConversationsPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/panels.css';

// 侧边栏分页预览（生产 ConversationsPanel + ProjectNode + ConversationNode）。
//
// 用户看到的契约：每个列表默认先放 5 行，每点一次 “Show more” 再加 5 行；
// 按钮变成 “Show less” 后再点一下收回默认预览（不是关掉列表）。
// 会话行与「展开会话下的任务卡」各算一份（chat / bot 各自计数），互不影响。

window.haish = {};

const CONVERSATIONS = 8;
const TASKS = 8;

const task = (index) => ({
  taskId: `task-${index}`,
  conversationId: 'conv-1',
  title: `任务 ${index}`,
  status: 'done',
  stage: 'done',
  executionMode: 'chat',
  createdAt: 1758000000000 + index,
  updatedAt: 1758000000000 + index,
  completedAt: 1758000000000 + index,
});

// Task 标签页的任务行跟展开会话下的任务卡是同一只 TaskRecordCompact（.conversation-task-title）：
// 这里在第二个会话（只在 Task 标签页里看得到）挂三条刻意超宽的标题，各带一个标记——
// 一条在跑（行尾多一枚 18px 的状态图标）、一条已取消（行尾没有常驻元素，量最干净的留白）、
// 一条已完成且带报告入口（行尾多一枚 24px 的常驻按钮）：用来量「标题框右端 → 行右缘」
// 这三种不同的静态留白与末尾渐隐。
const LONG_TASK_RUNNING = '分析失败Trace提升Agent能力以及一条很长很长到必须收尾的运行任务';
const LONG_TASK_CANCELLED = '分析失败Trace提升Agent能力以及一条很长很长到必须收尾的取消任务';
const LONG_TASK_DONE = '分析失败Trace提升Agent能力以及一条很长很长到必须收尾的已成任务';
const longTask = (taskId, title, updatedAt, extra) => ({
  taskId,
  conversationId: 'conv-2',
  title,
  executionMode: 'chat',
  createdAt: updatedAt,
  updatedAt,
  ...extra,
});
// 三条长任务的时间戳比 conv-1 的「任务 N」都新：Task 标签页按更新时间倒排，它们排在最前。
const LONG_TASKS = [
  longTask('task-long-running', LONG_TASK_RUNNING, 1758000009003, { status: 'running', stage: 'running' }),
  longTask('task-long-cancelled', LONG_TASK_CANCELLED, 1758000009002, { status: 'cancelled', stage: 'cancelled' }),
  longTask('task-long-done', LONG_TASK_DONE, 1758000009001, {
    status: 'done',
    stage: 'done',
    answerText: '长标题任务的结果',
    completedAt: 1758000009001,
  }),
];

const conversation = (index) => ({
  id: `conv-${index}`,
  name: `会话 ${index}`,
  executionMode: 'chat',
  // 第一行展开着，任务卡预览就挂在它下面。
  expanded: index === 1,
  pinned: false,
  sortOrder: index,
  tasks: index === 1
    ? Array.from({ length: TASKS }, (_, i) => task(i + 1))
    : (index === 2 ? LONG_TASKS : []),
});

const PROJECT = {
  id: 'project-preview',
  type: 'custom',
  executionMode: 'chat',
  name: 'haish-agent',
  workspacePath: '/Users/zhanruitao/front-end-project/haish-agent',
  workspaceLabel: 'haish-agent',
  removable: true,
  expanded: true,
  pinned: false,
  sortOrder: 0,
  conversations: Array.from({ length: CONVERSATIONS }, (_, i) => conversation(i + 1)),
};

const WORKSPACE = {
  activeProjectId: PROJECT.id,
  activeConversationId: 'conv-1',
  projects: [PROJECT],
};

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const conversationRows = () => [...document.querySelectorAll('.project-conversations > .conversation-node')];
const conversationNames = () => conversationRows()
  .map((row) => row.querySelector('.conversation-name-static')?.textContent || '');
const taskCards = () => [...document.querySelectorAll('.conversation-task-list .conversation-task-card')];
const taskTitles = () => taskCards()
  .map((card) => card.querySelector('.conversation-task-title')?.textContent || '');
const projectShowMore = () => document.querySelector('.project-conversations > .conversation-show-more');
const taskShowMore = () => document.querySelector('.conversation-task-list > .conversation-show-more');
const label = (button) => String(button?.textContent || '').trim();
const names = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `会话 ${from + i}`);

const press = (button) => {
  if (!button) return;
  flushSync(() => { button.click(); });
};

async function runChecks() {
  const mountNode = document.createElement('div');
  mountNode.className = 'app-shell';
  document.getElementById('root').appendChild(mountNode);
  const root = createRoot(mountNode);

  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        <div className="conversations-panel" style={{ position: 'relative', width: 320, height: 760, padding: 12 }}>
          <ConversationsPanel
            workspaceState={WORKSPACE}
            onSelectProject={() => {}}
            onToggleProject={() => {}}
            onSelectConversation={() => {}}
            onAddConversation={() => {}}
            onRemoveProject={() => {}}
            onDeleteConversation={() => {}}
            onRenameConversation={() => {}}
            onRenameProject={() => {}}
            onPinConversation={() => {}}
            onPinProject={() => {}}
          />
        </div>
      </AppTooltipProvider>,
    );
  });
  await sleep(150);

  // 先确认这一页真的渲染出来了：后面好几项比较的是「哪几行在列表里」，
  // 整块渲染失败时会得到空数组，别的断言会跟着一起红。
  check(
    'the project row and its first conversation row rendered',
    document.querySelectorAll('.project-row').length === 1 && conversationRows().length > 0,
    `projects=${document.querySelectorAll('.project-row').length} conversations=${conversationRows().length}`,
  );

  // 默认预览 = 5 行。
  check(
    'the conversation list starts with a five-row preview',
    JSON.stringify(conversationNames()) === JSON.stringify(names(1, 5)),
    JSON.stringify(conversationNames()),
  );
  check(
    'the project-level Show more offers the hidden rows',
    label(projectShowMore()) === 'Show more',
    label(projectShowMore()) || 'missing',
  );

  // 展开会话下的任务卡也默认 5 张（新任务在上）。
  check(
    'the expanded conversation previews five task cards, newest first',
    JSON.stringify(taskTitles()) === JSON.stringify(['任务 8', '任务 7', '任务 6', '任务 5', '任务 4']),
    JSON.stringify(taskTitles()),
  );
  check(
    "the task list's Show more offers the hidden cards",
    label(taskShowMore()) === 'Show more',
    label(taskShowMore()) || 'missing',
  );

  // 会话行的 “Show more”：一次加 5 行（8 条全出来），按钮变 “Show less”。
  press(projectShowMore());
  await sleep(60);
  check(
    'one Show more click adds five rows',
    JSON.stringify(conversationNames()) === JSON.stringify(names(1, 8)),
    JSON.stringify(conversationNames()),
  );
  check(
    'the button flips to Show less once every row is visible',
    label(projectShowMore()) === 'Show less',
    label(projectShowMore()) || 'missing',
  );
  check(
    'expanding the conversation list leaves the task preview alone',
    taskCards().length === 5,
    `tasks=${taskCards().length}`,
  );

  // 再点一下：收回默认预览（不是把会话藏起来）。
  press(projectShowMore());
  await sleep(60);
  check(
    'clicking Show less collapses back to the default five rows',
    JSON.stringify(conversationNames()) === JSON.stringify(names(1, 5)),
    JSON.stringify(conversationNames()),
  );

  // 任务卡自己的 “Show more” 同样 +5，且不动会话列表。
  press(taskShowMore());
  await sleep(60);
  check(
    'the task preview pages by five as well',
    taskCards().length === 8 && label(taskShowMore()) === 'Show less',
    `tasks=${taskCards().length} label=${label(taskShowMore()) || 'missing'}`,
  );
  check(
    'expanding the task list leaves the conversation preview alone',
    JSON.stringify(conversationNames()) === JSON.stringify(names(1, 5)),
    JSON.stringify(conversationNames()),
  );

  press(taskShowMore());
  await sleep(60);
  check(
    'clicking Show less collapses the task list back to five cards',
    taskCards().length === 5,
    `tasks=${taskCards().length}`,
  );

  check('no page error was raised while paging the sidebar', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return results;
}

// ——— 任务标签页的搜索框：跟会话标签页是同一只 ThreadSearch，搜的是任务、选中跳任务 ———
// 这一段在分页那一段跑完之后才挂第二只面板：分页的断言是全局查询，多一只面板会串味。

const taskSearchResults = [];
const taskCheck = (name, pass, detail = '') => taskSearchResults.push({ name: `task search: ${name}`, pass: Boolean(pass), detail: String(detail) });

const taskSearchMount = () => document.querySelector('[data-task-search]');
const fieldOf = (node) => node?.querySelector('.haish-search-field');
const resultsOf = (node) => node?.querySelector('.haish-thread-search-results');
const resultLabels = (node) => [...(resultsOf(node)?.querySelectorAll('button') || [])]
  .map((button) => button.textContent.trim());
const groupLabels = (node) => [...(resultsOf(node)?.querySelectorAll('small') || [])]
  .map((small) => small.textContent.trim());

// React 的受控输入：得走原生 setter 再派发 input 事件，onChange 才会真的跑。
const setValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const pressKey = (input, key) => {
  flushSync(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
};

async function runTaskSearchChecks() {
  const mountNode = document.createElement('div');
  mountNode.className = 'app-shell';
  mountNode.dataset.taskSearch = 'true';
  document.getElementById('root').appendChild(mountNode);
  const root = createRoot(mountNode);
  const calls = [];

  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        <div className="conversations-panel" style={{ position: 'relative', width: 320, height: 760, padding: 12 }}>
          <ConversationsPanel
            workspaceState={WORKSPACE}
            workflowTaskMode
            onSelectProject={() => {}}
            onToggleProject={() => {}}
            onSelectConversation={() => {}}
            onSelectTask={(projectId, conversationId, selectedTask) => {
              calls.push([projectId, conversationId, selectedTask?.taskId]);
            }}
            // 报告入口：完成任务的行尾常驻那枚 24px 按钮（没有它就不长 has-report）。
            onOpenTaskReport={() => {}}
            onAddConversation={() => {}}
            onRemoveProject={() => {}}
            onDeleteConversation={() => {}}
            onRenameConversation={() => {}}
            onRenameProject={() => {}}
            onPinConversation={() => {}}
            onPinProject={() => {}}
          />
        </div>
      </AppTooltipProvider>,
    );
  });
  await sleep(150);

  const node = taskSearchMount();
  const input = fieldOf(node)?.querySelector('input');
  const conversationInput = document.querySelector('.haish-search-field input');

  taskCheck(
    'the Task tab carries the same search field as the Conversation tab',
    Boolean(node?.querySelector('.side-panel-head')?.textContent.includes('Task'))
      && input?.getAttribute('aria-label') === 'Search tasks'
      && input?.placeholder === 'Search tasks'
      && conversationInput?.getAttribute('aria-label') === 'Search conversations',
    `task=${input?.getAttribute('aria-label')} conversation=${conversationInput?.getAttribute('aria-label')}`,
  );

  // 任务列表默认只排 5 行（任务 8…4），任务 1 被预览藏着——搜索得能搜到它。
  setValue(input, '任务 1');
  await sleep(40);
  taskCheck(
    'typing finds a task the five-row preview hides',
    JSON.stringify(resultLabels(node)) === JSON.stringify(['任务 1'])
      && groupLabels(node).includes('haish-agent'),
    `results=${JSON.stringify(resultLabels(node))} groups=${JSON.stringify(groupLabels(node))}`,
  );

  pressKey(input, 'Enter');
  await sleep(40);
  taskCheck(
    "Enter opens the first match as that conversation's task",
    JSON.stringify(calls.at(-1)) === JSON.stringify(['project-preview', 'conv-1', 'task-1']) && input.value === '',
    `calls=${JSON.stringify(calls)} value=${input.value}`,
  );

  setValue(input, '任务 7');
  await sleep(40);
  press(resultsOf(node)?.querySelector('button'));
  await sleep(40);
  taskCheck(
    'clicking a result opens that task',
    JSON.stringify(calls.at(-1)) === JSON.stringify(['project-preview', 'conv-1', 'task-7']),
    `calls=${JSON.stringify(calls)}`,
  );

  setValue(input, '没有这样的任务');
  await sleep(40);
  taskCheck(
    'a query that matches nothing says so',
    resultsOf(node)?.querySelector('p')?.textContent === 'No matching tasks',
    resultsOf(node)?.textContent?.slice(0, 60) || 'missing',
  );

  setValue(input, '任务 5');
  await sleep(40);
  press(fieldOf(node)?.querySelector('[aria-label="Clear task search"]'));
  await sleep(40);
  taskCheck(
    'the clear button empties the task search',
    input.value === '' && !resultsOf(node),
    `value=${input.value} results=${Boolean(resultsOf(node))}`,
  );

  taskCheck('no page error was raised while searching tasks', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return taskSearchResults;
}

// ——— 任务行（Task 标签页 / 展开会话下的任务卡）的标题留白与渐隐 ———
// 上一条搜索先把这面 Task 面板挂好了，这里直接量它的任务行：任务标题跟会话标题
// 同一套——太长不画「…」而是右端渐隐，静态留白收到 20px（带报告入口那一档 24px）。

const taskRowResults = [];
const rowCheck = (name, pass, detail = '') => taskRowResults.push({ name: `task row: ${name}`, pass: Boolean(pass), detail: String(detail) });
const round = (value) => Math.round(value * 10) / 10;
const maskOf = (element) => {
  const style = getComputedStyle(element);
  return `${style.maskImage || ''} ${style.webkitMaskImage || ''}`.trim();
};

const taskRowCards = () => [...(taskSearchMount()?.querySelectorAll('.conversation-task-card') || [])];
const titleOf = (card) => card.querySelector('.conversation-task-title');
const longTaskCard = (marker) => taskRowCards().find((card) => (titleOf(card)?.textContent || '').includes(marker));
const runningCard = () => longTaskCard('运行任务');
const settledCard = () => longTaskCard('取消任务');
const reportCard = () => longTaskCard('已成任务');
// 标题框右端 → 行右缘：静态留白（行内边距 11 + 容器留白 + 行尾常驻元素）量出来的就是这条。
const tailOf = (card) => round(card.getBoundingClientRect().right - titleOf(card).getBoundingClientRect().right);

async function runTaskRowChecks() {
  await sleep(60);
  const running = runningCard();
  const settled = settledCard();
  const report = reportCard();
  const runningTitle = running ? titleOf(running) : null;
  const runningMask = runningTitle ? maskOf(runningTitle) : '';
  const shortCard = taskRowCards().find((card) => (titleOf(card)?.textContent || '') === '任务 8');
  rowCheck(
    'the task title fades out at the tail instead of an ellipsis',
    Boolean(runningTitle)
      && runningTitle.scrollWidth > runningTitle.clientWidth + 1
      && /linear-gradient/.test(runningMask)
      && /rgba\(0, 0, 0, 0\)/.test(runningMask)
      && getComputedStyle(runningTitle).textOverflow === 'clip',
    `overflow=${runningTitle ? runningTitle.scrollWidth - runningTitle.clientWidth : -1}px mask=${runningMask}`,
  );
  rowCheck(
    'the long task title box ends 31px before the row edge (the old 40px reserve is gone)',
    Boolean(settled) && Math.abs(tailOf(settled) - 31) < 0.5,
    `tail=${settled ? tailOf(settled) : -1}`,
  );
  rowCheck(
    'a running task leaves room for its tail status glyph (31px + 18px icon + 10px gap)',
    Boolean(running) && Math.abs(tailOf(running) - 59) < 0.5,
    `tail=${running ? tailOf(running) : -1}`,
  );
  rowCheck(
    'the task row with a report button keeps its title 69px off the row edge',
    Boolean(report) && Math.abs(tailOf(report) - 69) < 0.5,
    `tail=${report ? tailOf(report) : -1} report=${Boolean(report?.querySelector('.conversation-report-btn'))}`,
  );
  // 报告入口的图标是共享矢量图标表里的 report（lucide FileText）：旧 report.png 在 16px
  // 下细节糊成一团。按钮皮（24px）与描边颜色（currentColor）不变。
  const reportBtn = report ? report.querySelector('.conversation-report-btn') : null;
  const reportIcon = reportBtn ? reportBtn.querySelector('svg.app-icon') : null;
  const iconBox = reportIcon ? reportIcon.getBoundingClientRect() : null;
  rowCheck(
    'the report entry draws the shared 15px vector icon inside its 24px button',
    Boolean(reportIcon)
      && !reportBtn.querySelector('.ico-report')
      && Math.abs(iconBox.width - 15) < 0.5
      && Math.abs(iconBox.height - 15) < 0.5
      && Math.abs(reportBtn.getBoundingClientRect().width - 24) < 0.5
      && getComputedStyle(reportIcon).stroke === getComputedStyle(reportBtn).color,
    `icon=${iconBox ? `${round(iconBox.width)}x${round(iconBox.height)}` : 'none'} stroke=${reportIcon ? getComputedStyle(reportIcon).stroke : ''} button=${reportBtn ? round(reportBtn.getBoundingClientRect().width) : -1}`,
  );
  rowCheck(
    'a short task title keeps its full text (the fade only bites on overflow)',
    Boolean(shortCard) && titleOf(shortCard).scrollWidth <= titleOf(shortCard).clientWidth + 1,
    `overflow=${shortCard ? titleOf(shortCard).scrollWidth - titleOf(shortCard).clientWidth : -1}px`,
  );
  return taskRowResults;
}

// revert：把改前的「40px / 44px 标题留白 + ellipsis」注回去，标题框右端应退回行尾那条
// 空带（51px / 89px）、mask 变 none——证明上面量的是真的生效中的规则。
async function revertTaskRowChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .conversation-task-card.has-actions .conversation-task-copy { padding-right: 40px !important; }
    .conversation-task-card.has-actions.has-report .conversation-task-copy { padding-right: 44px !important; }
    .conversation-task-title { -webkit-mask-image: none !important; mask-image: none !important; text-overflow: ellipsis !important; }
  `;
  document.head.appendChild(style);
  await sleep(200);
  const settled = settledCard();
  const report = reportCard();
  const revertedTitle = settled ? titleOf(settled) : null;
  return [
    {
      name: 'revert: the old 40px / 44px task reserves pull the titles back to the empty band',
      pass: Boolean(settled) && Boolean(report) && tailOf(settled) >= 45 && tailOf(report) >= 83,
      detail: `tail=${settled ? tailOf(settled) : -1} reportTail=${report ? tailOf(report) : -1}`,
    },
    {
      name: 'revert: the task titles go back to an ellipsis with no fade mask',
      pass: Boolean(revertedTitle) && /^none( none)?$/.test(maskOf(revertedTitle)) && getComputedStyle(revertedTitle).textOverflow === 'ellipsis',
      detail: `mask=${revertedTitle ? maskOf(revertedTitle) : ''} textOverflow=${revertedTitle ? getComputedStyle(revertedTitle).textOverflow : ''}`,
    },
  ];
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

let taskChecksPromise = null;
function startTaskChecks() {
  if (!taskChecksPromise) taskChecksPromise = runTaskSearchChecks();
  return taskChecksPromise;
}

// 任务行的留白/渐隐量在前一条挂好的那面 Task 面板上，所以先等搜索那一段挂完。
let taskRowChecksPromise = null;
function startTaskRowChecks() {
  if (!taskRowChecksPromise) taskRowChecksPromise = startTaskChecks().then(() => runTaskRowChecks());
  return taskRowChecksPromise;
}

window.__sidebarPreviewChecks = async () => report(await start());
window.__sidebarTaskSearchChecks = async () => report(await startTaskChecks());
window.__sidebarTaskRowChecks = async () => report(await startTaskRowChecks());
window.__sidebarTaskRowRevertChecks = async () => report(await revertTaskRowChecks());
window.__sidebarPreviewAutoRun = () => {
  start()
    .then((paging) => startTaskChecks().then((search) => startTaskRowChecks().then((rows) => report([...paging, ...search, ...rows]))))
    .catch((error) => {
      report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
    });
};

window.__sidebarPreviewAutoRun();
