import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConversationsPanel } from '../../src/features/conversations/components/ConversationsPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/panels.css';
import '../../styles/modals.css';

// 项目改名（双击项目行 → 改名对话框 → onRenameProject）。
//
// 挂的是生产 ConversationsPanel + 生产 ProjectNode + 生产 ConversationDialog：
// 手势、对话框、提交时的 trim 都是真实现，只有「落到后端那一步」换成记录调用的替身，
// 断言就看这条链有没有把正确的 project id / 名字交出去。
// 顺带盯住「双击」这个手势没有抢走单击选择，也没有被动作按钮（折叠 / pin / 新建 / 删除）误触发，
// 并且会话行双击仍然是会话改名。

window.haish = {};

const calls = [];
const record = (kind) => (...args) => { calls.push({ kind, args }); };

const CUSTOM_PROJECT = {
  id: 'project-custom',
  type: 'custom',
  executionMode: 'chat',
  name: 'haish-agent',
  workspacePath: '/Users/zhanruitao/front-end-project/haish-agent',
  workspaceLabel: 'haish-agent',
  removable: true,
  expanded: true,
  pinned: false,
  sortOrder: 0,
  createdAt: null,
  conversations: [
    { id: 'conv-a', name: '会话 A', executionMode: 'chat', expanded: false, pinned: false, tasks: [] },
  ],
};

const SYSTEM_PROJECT = {
  id: 'default-project-chat',
  type: 'system',
  executionMode: 'chat',
  name: 'Default project',
  workspacePath: null,
  workspaceLabel: null,
  removable: false,
  expanded: false,
  pinned: false,
  sortOrder: 1,
  createdAt: null,
  conversations: [],
};

const WORKSPACE = {
  activeProjectId: CUSTOM_PROJECT.id,
  activeConversationId: 'conv-a',
  projects: [CUSTOM_PROJECT, SYSTEM_PROJECT],
};

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dialog = () => document.querySelector('.haish-dialog');
const dialogTitle = () => document.querySelector('.haish-dialog-title')?.textContent || '';
const dialogInput = () => document.querySelector('.haish-dialog-input');
const confirmButton = () => document.querySelector('.haish-dialog-actions button[type="submit"]');
const cancelButton = () => document.querySelector('.haish-dialog-actions button[type="button"]');
const projectRow = (name) => [...document.querySelectorAll('.project-row')]
  .find((row) => row.querySelector('.project-name')?.textContent === name) || null;
// 每一步都先查元素再动手：断言失败时页面本来就没那些节点，
// 不能让夹具崩掉——否则「哪一项红了」就看不出来了。
const rowPart = (projectName, selector) => projectRow(projectName)?.querySelector(selector) || null;
const renameCalls = () => calls.filter((call) => call.kind === 'renameProject');

async function waitForDialog(open) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (Boolean(dialog()) === open) return true;
    await frame();
    await sleep(20);
  }
  return false;
}

// 双击只用原生 dblclick 事件驱动：真实用户的双击会顺带走两次 click，
// 那部分单点行为由「单击仍然是选择」那一项单独盯。
const doubleClick = (target) => {
  if (!target) return;
  flushSync(() => {
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
};

const press = (target) => {
  if (!target) return;
  flushSync(() => { target.click(); });
};

const typeName = (input, value) => {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  flushSync(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// 三项「双击动作按钮不算改名」的检查互相独立：某一项漏了拦截会把对话框留在屏幕上，
// 那残留必须清掉，后面的项才不会跟着一起红。
const closeStrayDialog = async () => {
  if (!dialog()) return;
  press(cancelButton());
  await waitForDialog(false);
};

async function runChecks() {
  const mountNode = document.createElement('div');
  mountNode.className = 'app-shell';
  document.getElementById('root').appendChild(mountNode);
  const root = createRoot(mountNode);

  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        <div className="conversations-panel" style={{ position: 'relative', width: 320, height: 640, padding: 12 }}>
          <ConversationsPanel
            workspaceState={WORKSPACE}
            onSelectProject={record('selectProject')}
            onToggleProject={record('toggleProject')}
            onSelectConversation={record('selectConversation')}
            onAddProject={record('addProject')}
            onAddConversation={record('addConversation')}
            onRemoveProject={record('removeProject')}
            onDeleteConversation={record('deleteConversation')}
            onRenameProject={record('renameProject')}
            onRenameConversation={record('renameConversation')}
            onPinProject={record('pinProject')}
            onPinConversation={record('pinConversation')}
          />
        </div>
      </AppTooltipProvider>,
    );
  });
  await frame();
  await sleep(80);

  // 先确认这一页真的渲染出来了：后面好几项断言的是「查不到对话框」，
  // 整块渲染失败时那些断言会假装通过。
  check(
    'the project rows themselves rendered',
    document.querySelectorAll('.project-row').length === 2
      && Boolean(projectRow('haish-agent')) && Boolean(projectRow('Default project')),
    `rows=${document.querySelectorAll('.project-row').length}`,
  );
  check('no rename dialog is up before the double-click', dialog() === null, dialogTitle());

  // 单击还是原来的选择动作，没有被双击手势吃掉。
  press(projectRow('haish-agent'));
  await frame();
  check(
    'a single click on the project row still just selects it',
    calls.filter((call) => call.kind === 'selectProject').length === 1
      && calls.find((call) => call.kind === 'selectProject').args[0] === 'project-custom'
      && dialog() === null,
    JSON.stringify(calls),
  );
  calls.length = 0;

  // 双击项目名 → 改名对话框，输入框预填当前名字。
  doubleClick(rowPart('haish-agent', '.project-name'));
  await waitForDialog(true);
  const input = dialogInput();
  const inputRect = input?.getBoundingClientRect();
  check('double-clicking the project name opens a dialog', Boolean(dialog()), dialogTitle());
  check('the dialog is the rename dialog', dialogTitle() === 'Rename project', dialogTitle());
  check('the input is prefilled with the current project name', input?.value === 'haish-agent', input?.value);
  check(
    'the rename input is really on screen',
    Boolean(inputRect) && inputRect.width > 60 && inputRect.height > 10,
    JSON.stringify(inputRect ? { width: Math.round(inputRect.width), height: Math.round(inputRect.height) } : null),
  );

  // 改名提交：对话框负责 trim，交出去的是 project id + 干净名字。
  typeName(input, '  我的项目  ');
  press(confirmButton());
  await waitForDialog(false);
  await sleep(0);
  check(
    'confirming hands the trimmed name to the project rename handler',
    renameCalls().length === 1
      && renameCalls()[0].args[0] === 'project-custom'
      && renameCalls()[0].args[1] === '我的项目',
    JSON.stringify(renameCalls()),
  );
  check('the dialog closes after a successful rename', dialog() === null, dialogTitle());
  calls.length = 0;

  // 动作按钮上的双击不算改名（折叠图标 / pin / 新建会话）。
  await closeStrayDialog();
  doubleClick(rowPart('haish-agent', '.project-icon-toggle'));
  await frame();
  await sleep(30);
  check(
    'a double-click on the folder toggle never opens the rename dialog',
    dialog() === null,
    dialogTitle(),
  );

  await closeStrayDialog();
  doubleClick(rowPart('haish-agent', '.conversation-pin-toggle'));
  await frame();
  await sleep(30);
  check('a double-click on the pin button never opens the rename dialog', dialog() === null, dialogTitle());

  await closeStrayDialog();
  doubleClick(rowPart('haish-agent', 'button[aria-label="New Conversation"]'));
  await frame();
  await sleep(30);
  check('a double-click on the new-conversation button never opens the rename dialog', dialog() === null, dialogTitle());

  // 系统项目（Default project）也归用户命名，双击同样能改。
  await closeStrayDialog();
  doubleClick(rowPart('Default project', '.project-name'));
  await waitForDialog(true);
  check(
    'the system project row is renameable too',
    dialogTitle() === 'Rename project' && dialogInput()?.value === 'Default project',
    `${dialogTitle()} / ${dialogInput()?.value}`,
  );

  press(cancelButton());
  await waitForDialog(false);
  await sleep(0);
  check(
    'cancelling never renames anything',
    renameCalls().length === 0 && dialog() === null,
    JSON.stringify(renameCalls()),
  );

  // 会话行的双击仍然是会话改名，没被项目改名抢走。
  doubleClick(document.querySelector('.conversation-row')?.querySelector('.conversation-name'));
  await waitForDialog(true);
  check(
    'a conversation row keeps its own rename dialog',
    dialogTitle() === 'Rename conversation' && dialogInput()?.value === '会话 A',
    `${dialogTitle()} / ${dialogInput()?.value}`,
  );
  press(cancelButton());
  await waitForDialog(false);

  check('no page error was raised while renaming a project', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
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

window.__projectRenameChecks = async () => report(await start());
window.__projectRenameAutoRun = () => {
  start().then(report).catch((error) => {
    report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
  });
};

window.__projectRenameAutoRun();
