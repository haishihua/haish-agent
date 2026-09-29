// MCP 工具选择的浏览器回归：真实 AgentConfigEditor + 真实 settings.css。
//
// 背景：每个 MCP server 原来都占一行「server · all tools」的勾选框（整台放行），
// 夹在它下面的逐条工具之间——看着像一条工具，其实是个服务器级开关。这个开关现在
// 下线：服务器那行只是分组标题，能勾的只有工具本身（model/mcp-tool-selection.js）。
//
// 断言：
//   1. 页面上再也读不到「all tools」；
//   2. 每个服务器一个分组，标题行里没有勾选框，勾选框总数 == 工具总数；
//   3. lazy（工具还没上报）的服务器有一句交代，起不来的服务器显示错误；
//   4. 点一个工具只写这一条（allow_tools），不写服务器级放行；
//   5. 老档案里的整台放行读出来工具全亮，而且都能点（不再被锁）；
//   6. 动其中一条 → 整台放行当场落成逐条工具，别的服务器不受影响；
//   7. 工具行比服务器标题行缩进，层级看得出来。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AgentConfigEditor } from '../../src/features/settings/components/AgentConfigEditor.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../src/features/settings/settings.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) =>
  window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`),
);

const report = document.getElementById('checks');
const lines = [];
const failures = [];
const log = (line) => {
  lines.push(line);
  report.textContent = lines.join('\n');
};
function check(condition, name) {
  log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failures.push(name);
}
// 后台标签页也跑得完：不靠 requestAnimationFrame（隐藏时它根本不触发），只等
// React 的调度队列（MessageChannel）+ 一个宏任务。
const flush = () =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(0);
  });
const tick = async (rounds = 3) => {
  for (let round = 0; round < rounds; round += 1) await flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const AGENT_ID = 'custom.agent-mcp';
const NODE_TOOLS = ['node_repl', 'node_repl_wait', 'node_repl_reset'];
const CUA_TOOLS = ['run_cua_task', 'screenshot_cua'];

const baseSettings = () => ({
  custom: [
    {
      agent_id: AGENT_ID,
      profile_id: AGENT_ID,
      display_name: 'Benchmark Task Assistant',
      description: 'mcp picker fixture',
      enabled: true,
      custom: true,
      system_prompt: '',
      base: 'preset.general',
      tool_policy: { allow: [], deny: [] },
      mcp_policy: { allow_servers: [], allow_tools: [] },
      skill_policy: { allow: [], deny: [] },
    },
  ],
  mcp_servers: [
    {
      name: 'node-repl',
      tools: NODE_TOOLS.map((name) => ({ name, qualified_name: `node-repl.${name}` })),
      error: null,
    },
    // lazy 服务器：工具清单要等它真被用到才上报。
    { name: 'figma', tools: [], error: null },
    { name: 'sketch', tools: [], error: 'server not reachable' },
    { name: 'cua-agent', tools: CUA_TOOLS.map((name) => ({ name, qualified_name: `cua-agent.${name}` })), error: null },
  ],
});

let state = baseSettings();
const root = createRoot(document.getElementById('root'));
const renderEditor = () =>
  flushSync(() =>
    root.render(
      <div className="settings-page settings-modern settings-theme dark">
        <AgentConfigEditor
          selectedId={AGENT_ID}
          settings={state}
          onSettingsChange={(updater) => {
            state = typeof updater === 'function' ? updater(state) : updater;
          }}
          readOnly={false}
        />
      </div>,
    ),
  );
const policy = () => state.custom[0].mcp_policy;
const groups = () => [...document.querySelectorAll('#root .settings-check-group')];
const boxesOf = (group) => [...group.querySelectorAll('[data-slot="checkbox"]')];
const labelOf = (group) => group.querySelector('.settings-check-label')?.textContent || '';
const statesOf = (group) => boxesOf(group).map((box) => box.dataset.state);
const checkedCount = (group) => statesOf(group).filter((value) => value === 'checked').length;
const sorted = (values) => [...values].sort().join(',');

async function main() {
  renderEditor();
  await tick();

  // 1) 「all tools」这一行彻底没了
  check(
    !/all tools/i.test(document.getElementById('root').textContent),
    'no 「server · all tools」 row is rendered any more',
  );

  // 2) 分组 / 标题行 / 勾选框数量
  const all = groups();
  check(all.length === 4, `every server is one group (${all.length})`);
  check(all.map(labelOf).join(',') === 'node-repl,figma,sketch,cua-agent', 'server names are the headings, in order');
  check(
    all.every((group) => !group.firstElementChild.querySelector('[data-slot="checkbox"]')),
    'the heading row carries no checkbox',
  );
  check(
    all.every((group) => !group.firstElementChild.querySelector('label')),
    'and it is not a label any more — there is nothing to click on the server row',
  );
  const allBoxes = all.flatMap((group) => boxesOf(group));
  check(
    allBoxes.length === NODE_TOOLS.length + CUA_TOOLS.length,
    `only tools are checkable (${allBoxes.length} boxes)`,
  );
  check(
    allBoxes.every((box) => !box.disabled),
    'no tool is locked by a server-level switch',
  );

  // 3) 没上报清单 / 起不来的服务器
  check(
    all[1].textContent.includes('No tools reported yet.'),
    'a server without a tool list says so instead of showing a dead switch',
  );
  check(all[2].textContent.includes('server not reachable'), 'a broken server still shows its error');
  check(
    all[2].textContent.includes('No tools reported yet.') === false,
    'and does not also claim it simply has no tools',
  );

  // 7) 层级：工具行比标题行缩进
  const headingLeft = all[0].querySelector('.settings-check-label').getBoundingClientRect().left;
  const toolLeft = all[0].querySelectorAll('.settings-check-label')[1].getBoundingClientRect().left;
  check(
    toolLeft - headingLeft >= 20,
    `tool rows stay indented under the server heading (${Math.round(toolLeft - headingLeft)}px)`,
  );

  // 4) 点一个工具
  check(checkedCount(all[0]) === 0 && checkedCount(all[3]) === 0, 'everything starts unselected');
  boxesOf(all[0])[0].click();
  await tick();
  check(sorted(policy().allow_tools) === 'node-repl.node_repl', 'clicking a tool writes exactly that tool');
  check(policy().allow_servers.length === 0, 'and never writes a server-level allow');
  renderEditor();
  await tick();
  check(statesOf(groups()[0]).join(',') === 'checked,unchecked,unchecked', 'the box paints as checked');
  boxesOf(groups()[0])[0].click();
  await tick();
  check(policy().allow_tools.length === 0, 'clicking it again takes it back out');

  // 5) 老档案：服务器级放行仍然让它的工具全亮，而且都不是锁死的
  state = {
    ...state,
    custom: [
      { ...state.custom[0], mcp_policy: { allow_servers: ['node-repl'], allow_tools: ['cua-agent.run_cua_task'] } },
    ],
  };
  renderEditor();
  await tick();
  check(
    statesOf(groups()[0]).join(',') === 'checked,checked,checked',
    'a legacy whole-server allow lights up every tool it covers',
  );
  check(
    boxesOf(groups()[0]).every((box) => !box.disabled),
    'and none of them is locked (the old UI disabled exactly these)',
  );
  check(statesOf(groups()[3]).join(',') === 'checked,unchecked', 'other servers keep their own picks');

  // 6) 动其中一条 → 整台放行落成逐条
  boxesOf(groups()[0])[1].click();
  await tick();
  check(policy().allow_servers.length === 0, 'touching one tool spends the whole-server allow');
  check(
    sorted(policy().allow_tools) === 'cua-agent.run_cua_task,node-repl.node_repl,node-repl.node_repl_reset',
    'what stays allowed is written tool by tool',
  );
  renderEditor();
  await tick();
  check(statesOf(groups()[0]).join(',') === 'checked,unchecked,checked', 'the list now shows exactly what is allowed');
  check(statesOf(groups()[3]).join(',') === 'checked,unchecked', 'and the other server is untouched');

  const errors = window.__pageErrors || [];
  check(errors.length === 0, `no page errors (${errors.join(' | ') || 'none'})`);
  report.dataset.result = failures.length ? 'FAIL' : 'PASS';
  log(failures.length ? `FAILED: ${failures.join(' | ')}` : 'ALL CHECKS PASSED');
}

main().catch((error) => {
  report.dataset.result = 'FAIL';
  log(`THREW: ${String(error?.stack || error)}`);
  log(`page errors: ${(window.__pageErrors || []).join(' | ') || 'none'}`);
});
