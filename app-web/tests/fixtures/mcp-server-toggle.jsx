// Settings → Tools → MCP：折叠面板里每行一颗开关——就是 skill 行那一颗共享 Switch
// （shared/ui/settings-elements 的 Switch），不另造电源图标。
// 真实 ToolsConfigEditor + 真实 settings.css + 真实保存载荷（buildToolsSettingsPayload）。
//
// 断言：
//   1. 每台 server 一行，行里自带一颗真开关（data-slot="switch"、role="switch"）；收起行不再画状态那一列
//      （点 + 文字），状态只在展开区交代；
//   2. 打开的那台就是设置区那颗蓝（--settings-primary）——和 skill 行同一个长相，没有自己的一套颜色；
//   3. 开关说得出管哪一台、当前是什么状态（aria-checked / aria-label）；
//   4. 点一下 → 只改这一台的 enabled，走和输入框 Save 同一条路（mcp: {config}）；
//      同台的 env/expose 等字段、别的 server，一个字节不动；
//   5. 「关」写 false、「开」写显式 true，落盘回来的配置 = 界面显示；
//   6. 请求在飞：开关锁住（外观统一交给那颗共享组件，不再自带转圈），连点不发第二次；
//   7. JSON 坏着的时候列表整个不渲染（没有能点的开关，也就写不出去），草稿原样留着。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ToolsConfigEditor } from '../../src/features/settings/components/ToolsConfigEditor.jsx';
import { createDefaultSettingsRecords } from '../../src/features/settings/model/settings-records.js';
import {
  applyToolsSettingsPayloadToRecords,
  buildToolsSettingsPayload,
} from '../../src/features/settings/model/settings-payload.js';
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

// 四台 server：一台没写 enabled（缺省 = 开）、一台显式关着、一台显式开着、
// 一台开着但没有 enabled 键（点它不该凭空多出这个键）。
const MCP_CONFIG = {
  servers: {
    figma: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'figma-developer-mcp@0.12.0', '--stdio'],
      env: { FIGMA_API_KEY: 'figd_fixture' },
      tool_prefix: 'figma',
      expose: 'lazy',
      start_on_launch: false,
    },
    sketch: { transport: 'http', url: 'http://127.0.0.1:9999/mcp', enabled: false },
    'node-repl': { transport: 'stdio', command: 'node', args: ['./scripts/node-repl.js'] },
    'cua-agent': { transport: 'stdio', command: 'cua-agent', enabled: true },
  },
};
const mcpJson = () => JSON.stringify(MCP_CONFIG, null, 2);

const baseRecords = () => {
  const records = createDefaultSettingsRecords();
  // core 的缓存快照（GET /api/settings/tools 的 mcp_servers）：只读、不会去连服务器。
  const mcpServers = [
    {
      name: 'figma',
      enabled: true,
      expose: 'lazy',
      loaded: true,
      error: null,
      tools: [
        { name: 'get_file', qualified_name: 'figma__get_file', description: '' },
        { name: 'get_comments', qualified_name: 'figma__get_comments', description: '' },
      ],
    },
    { name: 'sketch', enabled: false, expose: 'direct', loaded: false, error: null, tools: [] },
    { name: 'node-repl', enabled: true, expose: 'direct', loaded: false, error: 'connection refused', tools: [] },
    {
      name: 'cua-agent',
      enabled: true,
      expose: 'direct',
      loaded: true,
      error: null,
      tools: [{ name: 'act', qualified_name: 'cua-agent__act', description: '' }],
    },
  ];
  return {
    ...records,
    tools: records.tools.map((record) =>
      record.id === 'tools-mcp' ? { ...record, mcp_json: mcpJson(), mcp_path: '/tmp/fixture/mcp.json', mcp_servers: mcpServers } : record,
    ),
  };
};

let records = baseRecords();
const saveCalls = [];
let holdSave = false;
let releaseSave = null;

// 服务端那半段：把载荷记下来，然后照 core 的口径把配置写回（保存完读回来的就是它）。
async function onSaveTools(nextRecords, message) {
  const payload = buildToolsSettingsPayload(nextRecords);
  saveCalls.push({ payload, message });
  if (holdSave)
    await new Promise((resolve) => {
      releaseSave = resolve;
    });
  records = applyToolsSettingsPayloadToRecords(records, {
    mcp: { config: payload.mcp.config, path: '/tmp/fixture/mcp.json' },
  });
  draw();
  await tick();
  return true;
}

const root = createRoot(document.getElementById('root'));
const draw = () =>
  flushSync(() =>
    root.render(
      <div className="settings-page settings-modern settings-theme dark">
        <ToolsConfigEditor
          selectedId="tools-mcp"
          records={records}
          onRecordsChange={(updater) => {
            records = typeof updater === 'function' ? updater(records) : updater;
          }}
          onSaveTools={onSaveTools}
        />
      </div>,
    ),
  );

const rows = () => [...document.querySelectorAll('#root .mcp-server-panel-item')];
const rowFor = (name) => rows().find((row) => row.querySelector('.mcp-server-name')?.textContent === name);
const toggleFor = (name) => rowFor(name)?.querySelector('.mcp-server-switch');
const summaryFor = (name) => rowFor(name)?.querySelector('.mcp-server-summary');
const switchState = (name) => toggleFor(name)?.getAttribute('data-state');
const statusFor = (name) => rowFor(name)?.querySelector('.mcp-server-detail .mcp-server-status')?.textContent || '';
const openRow = async (name) => {
  if (summaryFor(name)?.getAttribute('aria-expanded') !== 'true') summaryFor(name).click();
  await tick();
};
const draftServers = () => JSON.parse(document.querySelector('#root textarea.mcp-json').value).servers;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
// 设置区自己的颜色（--settings-primary）：拿它证明「开关用的就是 skill 那颗」，不是另调的一套。
const themeColor = (name) => {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.querySelector('#root .settings-theme').appendChild(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
};
// 上一次保存的 run 在服务端返回后才收工（和真实 app 一样）；等整条路空下来再点下一台，
// 否则点到的还是「禁用中」的开关。
const idle = async (limit = 60) => {
  for (let round = 0; round < limit; round += 1) {
    const switches = [...document.querySelectorAll('#root .mcp-server-switch')];
    if (switches.length && switches.every((element) => !element.disabled)) return;
    await tick(1);
  }
};

async function main() {
  draw();
  await tick();

  // 1) 每台一行，行里一颗真开关；状态还是「点 + 文字」。
  check(rows().length === 4, `one row per server (${rows().length})`);
  check(
    rows().every((row) => row.querySelector('.mcp-server-switch[data-slot="switch"]')),
    'every row carries its own switch (the shared data-slot="switch")',
  );
  check(
    rows().every((row) => row.querySelector('.mcp-server-switch')?.getAttribute('role') === 'switch'),
    'and it is a real role="switch", not a hand-made icon button',
  );
  check(
    rows().every((row) => !row.querySelector('.mcp-server-switch svg') && !row.querySelector('.mcp-server-toggle')),
    'the row switch is the plain pill — no power icon smuggled back in',
  );
  // 收起行不再挂状态（点 + 文字）——那一列已经去掉了；状态只在展开区交代。
  check(
    rows().every((row) => !row.querySelector('.mcp-server-panel-row .mcp-status-dot')),
    'a collapsed row carries no status dot any more',
  );
  check(
    rows().every((row) => !row.querySelector('.mcp-server-panel-row .mcp-server-status')),
    'and no status text either — the status column is gone',
  );
  // 2) 同一个长相：开着 = 设置区的蓝（和 skill 行的开关同一颗组件、同一套颜色）。
  const primary = themeColor('--settings-primary');
  check(
    toggleFor('figma').getAttribute('data-size') === 'default',
    'the switch is the default-size one, same as the skill rows',
  );
  check(
    getComputedStyle(toggleFor('figma')).backgroundColor === primary,
    `a server that is on shows the settings blue (${getComputedStyle(toggleFor('figma')).backgroundColor})`,
  );
  check(getComputedStyle(toggleFor('sketch')).backgroundColor !== primary, 'a server that is off does not');
  const toggleBox = toggleFor('figma').getBoundingClientRect();
  const rowBox = rowFor('figma').getBoundingClientRect();
  const countBox = rowFor('figma').querySelector('.mcp-server-tool-count').getBoundingClientRect();
  check(
    toggleBox.left >= countBox.right,
    `the switch sits right of the tool count, not on top of it (${Math.round(toggleBox.left - countBox.right)}px)`,
  );
  check(
    toggleBox.right <= rowBox.right - 12,
    `and it stays inside the row (${Math.round(rowBox.right - toggleBox.right)}px to the edge)`,
  );
  check(
    Math.abs(countBox.right - toggleBox.left) <= 12,
    `the tool count hangs off the right edge next to the switch (${Math.round(toggleBox.left - countBox.right)}px gap)`,
  );
  const nameEl = rowFor('figma').querySelector('.mcp-server-name');
  check(nameEl.scrollWidth <= nameEl.clientWidth + 1, 'the server name is not clipped by the switch');

  // 2.5) 折叠面板：表头数出「几台连上了」，一次只开一台，展开在收起行下面接。
  check(
    document.querySelector('#root .mcp-server-panel-count')?.textContent === '2 of 4 connected',
    `the header counts only real connections (${document.querySelector('#root .mcp-server-panel-count')?.textContent})`,
  );
  summaryFor('figma').click();
  await tick();
  check(summaryFor('figma').getAttribute('aria-expanded') === 'true', 'clicking a row opens it');
  // 展开区的左缘对齐上面那颗插头图标（不是对着名字、也不是随便缩进）。
  const detailLeft = rowFor('figma').querySelector('.mcp-server-detail-meta').getBoundingClientRect().left;
  const plugLeft = rowFor('figma').querySelector('.mcp-server-plug').getBoundingClientRect().left;
  check(
    Math.abs(detailLeft - plugLeft) <= 1,
    `the expanded block starts at the plug icon (detail ${Math.round(detailLeft)}px vs plug ${Math.round(plugLeft)}px)`,
  );
  const detailStatus = statusFor('figma');
  check(detailStatus === 'Connected', `and the status lives down here now (${detailStatus})`);
  const chips = [...rowFor('figma').querySelectorAll('.mcp-server-tool-chip')].map((el) => el.textContent);
  check(chips.join(',') === 'get_file,get_comments', `the open row lists the tools that server brought (${chips.join(',')})`);
  check(
    rowFor('figma').querySelector('.mcp-server-detail-meta')?.textContent.includes('stdio'),
    'and its transport, which no longer takes a column when collapsed',
  );
  check(
    !document.querySelector('#root .mcp-server-columns'),
    'the old Server / Transport / Status column head is gone',
  );
  summaryFor('cua-agent').click();
  await tick();
  check(
    summaryFor('figma').getAttribute('aria-expanded') === 'false' &&
      summaryFor('cua-agent').getAttribute('aria-expanded') === 'true',
    'opening another row closes the first one',
  );
  summaryFor('cua-agent').click();
  await tick();
  check(summaryFor('cua-agent').getAttribute('aria-expanded') === 'false', 'clicking the open row closes it again');

  // 3) 开关说得出管谁、当前开还是关。
  check(
    switchState('figma') === 'checked' && toggleFor('figma').getAttribute('aria-label') === 'Disable MCP server figma',
    'an enabled server offers to disable it',
  );
  check(
    switchState('sketch') === 'unchecked' &&
      toggleFor('sketch').getAttribute('aria-label') === 'Enable MCP server sketch',
    'a disabled server offers to enable it',
  );

  // 4) 点 figma → 关掉。走的必须是和输入框 Save 同一条保存路。
  toggleFor('figma').click();
  await idle();
  draw();
  await tick();
  check(saveCalls.length === 1, 'the click saves through the same path as the editor Save button');
  const first = saveCalls[0].payload.mcp.config.servers;
  check(first.figma.enabled === false, 'only that server flips off in the payload');
  check(
    first.figma.env.FIGMA_API_KEY === 'figd_fixture' &&
      first.figma.expose === 'lazy' &&
      first.figma.tool_prefix === 'figma' &&
      first.figma.start_on_launch === false,
    'its other fields ride along untouched',
  );
  check(Object.keys(first.figma).pop() === 'enabled', 'the flag lands as its own key, nothing else is rewritten');
  check(first.sketch.enabled === false && own(first.sketch, 'enabled'), 'the server that was off stays off');
  check(first['cua-agent'].enabled === true, 'the neighbours keep their own state');
  check(own(first['node-repl'], 'enabled') === false, 'a server that never had the key does not get one');
  check(saveCalls[0].message === 'figma disabled', `the toast says what happened (${saveCalls[0].message})`);

  // 5) 落盘回来的配置 = 界面显示。
  await openRow('figma');
  check(statusFor('figma') === 'Disabled', 'the expanded row now reads Disabled');
  check(
    switchState('figma') === 'unchecked' && toggleFor('figma').getAttribute('aria-label') === 'Enable MCP server figma',
    'and the switch flips off, offering to enable',
  );
  check(draftServers().figma.enabled === false, 'the mcp.json draft carries the new state');
  check(draftServers()['node-repl'].command === 'node', 'and the rest of the file is still there');

  // 6) 再点一下 → 开回来，写显式 true。
  toggleFor('figma').click();
  await idle();
  check(
    saveCalls.length === 2 && saveCalls[1].payload.mcp.config.servers.figma.enabled === true,
    'turning it back on writes an explicit true',
  );
  await idle();
  await openRow('figma');
  check(statusFor('figma') === 'Connected' && draftServers().figma.enabled === true, 'the row and the file agree again');

  // 7) 请求在飞：开关锁住 + 连点无效（外观统一交给那颗共享组件，不再自带转圈）。
  await idle();
  holdSave = true;
  toggleFor('sketch').click();
  await tick();
  const flying = toggleFor('sketch');
  check(Boolean(flying), 'the row survives the in-flight save');
  check(
    flying.disabled && switchState('sketch') === 'unchecked' && !flying.querySelector('svg'),
    'while the save is in flight the switch is locked and stays the plain pill',
  );
  check(toggleFor('figma').disabled, 'and the rest of the pane stops taking clicks meanwhile');
  flying.click();
  await tick();
  check(saveCalls.length === 3, 'a second click while saving does not fire another save');
  releaseSave();
  holdSave = false;
  await idle();
  check(saveCalls[2].payload.mcp.config.servers.sketch.enabled === true, 'the held save carried the flipped value');
  await idle();
  await openRow('sketch');
  check(
    switchState('sketch') === 'checked' && statusFor('sketch') === 'Not loaded' && draftServers().sketch.enabled === true,
    'when it lands the server is on',
  );

  // 8) JSON 坏着 → 列表整个不渲染：没有可以点的开关，也就写不出去；草稿原样。
  const callsBefore = saveCalls.length;
  const brokenDraft = '{ "servers": ';
  records = {
    ...records,
    tools: records.tools.map((item) => (item.id === 'tools-mcp' ? { ...item, mcp_json: brokenDraft } : item)),
  };
  draw();
  await tick();
  check(
    rows().length === 0 && !document.querySelector('#root .mcp-server-switch'),
    'a broken draft renders no server rows at all',
  );
  check(
    document.querySelector('#root textarea.mcp-json').value === brokenDraft,
    'the editor keeps exactly what was typed',
  );
  check(saveCalls.length === callsBefore, 'and nothing is written to the server');

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
