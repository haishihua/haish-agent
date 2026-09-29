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

const conversation = (index) => ({
  id: `conv-${index}`,
  name: `会话 ${index}`,
  executionMode: 'chat',
  // 第一行展开着，任务卡预览就挂在它下面。
  expanded: index === 1,
  pinned: false,
  sortOrder: index,
  tasks: index === 1 ? Array.from({ length: TASKS }, (_, i) => task(i + 1)) : [],
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

window.__sidebarPreviewChecks = async () => report(await start());
window.__sidebarTaskSearchChecks = async () => report(await startTaskChecks());
window.__sidebarPreviewAutoRun = () => {
  start()
    .then((paging) => startTaskChecks().then((search) => report([...paging, ...search])))
    .catch((error) => {
      report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
    });
};

window.__sidebarPreviewAutoRun();
