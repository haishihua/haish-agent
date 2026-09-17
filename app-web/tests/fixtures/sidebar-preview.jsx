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

window.__sidebarPreviewChecks = async () => report(await start());
window.__sidebarPreviewAutoRun = () => {
  start().then(report).catch((error) => {
    report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
  });
};

window.__sidebarPreviewAutoRun();
