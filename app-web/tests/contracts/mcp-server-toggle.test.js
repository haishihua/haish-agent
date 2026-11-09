import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const editorSource = fs.readFileSync(
  new URL('../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url),
  'utf8',
);
const panelSource = fs.readFileSync(
  new URL('../../src/features/settings/components/McpServerPanel.jsx', import.meta.url),
  'utf8',
);
const primitivesSource = fs.readFileSync(
  new URL('../../src/features/settings/components/SettingsPrimitives.jsx', import.meta.url),
  'utf8',
);
const modelSource = fs.readFileSync(
  new URL('../../src/features/settings/model/mcp-server-toggle.js', import.meta.url),
  'utf8',
);
const panelModelSource = fs.readFileSync(
  new URL('../../src/features/settings/model/mcp-server-panel.js', import.meta.url),
  'utf8',
);
const settingsCss = fs.readFileSync(new URL('../../src/features/settings/settings.css', import.meta.url), 'utf8');

// skill 行（SettingsRow）和 MCP 行的开关必须是同一颗：共享的 settings-elements Switch。
const SHARED_SWITCH_IMPORT = "import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';";

test('MCP 每一行的开关就是 skill 行那一颗共享 Switch（不另造图标）', () => {
  assert.ok(panelSource.includes(SHARED_SWITCH_IMPORT), 'the MCP panel imports the shared Switch');
  // 同一个导入也正是 skill 行用的那颗——统一在这里，谁都不许再抄一套开关/图标按钮出来。
  assert.ok(primitivesSource.includes(SHARED_SWITCH_IMPORT), 'skill rows use the very same Switch');
  // 上一版自造的电源图标按钮（Power 图标 + .mcp-server-toggle 类 + 转圈）不许回来。
  assert.doesNotMatch(editorSource, /\bPower\b/);
  assert.doesNotMatch(panelSource, /\bPower\b/);
  assert.doesNotMatch(panelSource, /className="mcp-server-toggle/);
  assert.doesNotMatch(panelSource, /is-toggling/);
  // 状态文字由模型统一给，不在 JSX 里拼 enabled ? …。
  assert.match(panelSource, /MCP_SERVER_STATUS_LABELS\[server\.status\]/);
  assert.match(panelModelSource, /connected: 'Connected'/);
  assert.match(panelModelSource, /disabled: 'Disabled'/);
});

test('开关说清楚它管哪一台、当前是什么状态，在飞的保存里锁住', () => {
  assert.match(panelSource, /className="mcp-server-switch"/);
  assert.ok(panelSource.includes("aria-label={`${server.enabled ? 'Disable' : 'Enable'} MCP server ${server.name}`}"));
  assert.match(panelSource, /checked=\{server\.enabled\}/);
  assert.ok(panelSource.includes('onCheckedChange={(next) => onToggleServer?.(server.name, next)}'));
  // 整页在保存中时开关也锁住（和 skill 行一样）：连点不会发第二次保存。
  assert.match(panelSource, /disabled=\{Boolean\(busy\)\}/);
  // 面板本身不请求任何东西：数据与动作全部由外面传进来。
  assert.doesNotMatch(panelSource, /apiFetch/);
});

test('点一下 = 改这一台的 enabled 后走和 Save 同一条保存路径（core 落盘 mcp.json + 重载 hub）', () => {
  const toggleBlock = editorSource.slice(editorSource.indexOf('const toggleServer ='));
  assert.ok(toggleBlock, 'toggleServer handler must exist');
  assert.match(toggleBlock, /setMcpServerEnabled\(parsed\.value, name, enabled\)/);
  assert.match(
    toggleBlock,
    /onSaveTools\(patchedRecords\(\{ mcp_json,[^)]*\), enabled \? `\$\{name\} enabled` : `\$\{name\} disabled`, 'mcp'\)/,
  );
  assert.match(toggleBlock, /saved === false\) throw new Error\(`MCP server \$\{name\} was not updated\.`\)/);
  // JSON 坏着的时候不许写盘：点一下先给原因，草稿原样留着。
  assert.match(toggleBlock, /if \(!parsed\.ok\) throw new Error\(parsed\.error\);/);
  // 这个模型只碰 enabled，且「开」是显式 true（文件里说得出自己是什么状态）。
  assert.match(modelSource, /return server\?\.enabled !== false;/);
  assert.match(modelSource, /enabled: Boolean\(enabled\)/);
});

test('不另开关的外观：settings.css 里没有自己的一套开关样式', () => {
  // 颜色/尺寸/焦点环/动效全来自那颗共享 Switch；这里只留一个「别被文字挤瘦」的落点。
  assert.doesNotMatch(settingsCss, /\.mcp-server-toggle/);
  assert.doesNotMatch(settingsCss, /is-toggling/);
  assert.match(settingsCss, /\.mcp-server-switch \{ flex: 0 0 auto; \}/);
});

test('折叠行：收起只留箭头/插头/名字/工具数，状态点只在展开区交代', () => {
  // 与 assistant-ui 的 Server panel 同构：一行一个 button + aria-expanded，一次只开一台。
  assert.match(panelSource, /aria-expanded=\{open\}/);
  assert.match(panelSource, /data-slot="mcp-server-panel"/);
  assert.match(editorSource, /onToggle=\{name => setExpandedServer\(current => \(current === name \? '' : name\)\)\}/);
  // 收起行不再画 transport，也不挂右那一列状态（点 + 文字）——两者都搬进展开区。
  const summary = panelSource.slice(panelSource.indexOf('className="mcp-server-summary"'), panelSource.indexOf('</button>'));
  assert.ok(summary.length > 0, 'the summary button is still there');
  assert.doesNotMatch(summary, /mcp-status-dot/, 'no status dot in the collapsed row');
  assert.doesNotMatch(summary, /MCP_SERVER_STATUS_LABELS/, 'no status label in the collapsed row');
  assert.doesNotMatch(editorSource, /mcp-server-columns/);
  assert.doesNotMatch(settingsCss, /\.mcp-servers-surface/);
  // 展开区的左缘对齐上面那颗插头图标（不是对着名字，也不是居中缩进）。
  assert.match(settingsCss, /\.mcp-server-detail \{ display: grid; gap: 8px; padding: 0 16px 12px 32px; \}/);
});

test('工具清单来自 core 的缓存快照；没加载时给一个显式的 Load tools', () => {
  assert.match(panelModelSource, /snapshot\?\.tools/);
  assert.match(panelModelSource, /status: mcpServerStatus\(enabled, snapshot\)/);
  // 只有 error 才判 failed，loaded 判 connected，其余是「还没加载」。
  assert.match(panelModelSource, /if \(clean\(snapshot\?\.error\)\) return 'failed';/);
  assert.match(panelModelSource, /if \(snapshot\?\.loaded\) return 'connected';/);
  assert.match(panelSource, /onLoadTools\(server\.name\)/);
  assert.match(editorSource, /const response = await apiFetch\(`\$\{API_BASE\}\/api\/mcp\/catalog\/\$\{encodeURIComponent\(name\)\}`/);
  // 拉完工具要刷新一次设置，让快照（工具数/状态）跟上。
  assert.match(editorSource, /await onRefreshTools\?\.\(\);/);
});
