import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const editorSource = fs.readFileSync(
  new URL('../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url),
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
const settingsCss = fs.readFileSync(new URL('../../src/features/settings/settings.css', import.meta.url), 'utf8');

// skill 行（SettingsRow）和 MCP 行的开关必须是同一颗：共享的 settings-elements Switch。
const SHARED_SWITCH_IMPORT = "import { Switch } from '../../../shared/ui/settings-elements/ui/switch.tsx';";

test('MCP 每一行的开关就是 skill 行那一颗共享 Switch（不另造图标），状态仍是「点 + 文字」', () => {
  assert.ok(editorSource.includes(SHARED_SWITCH_IMPORT), 'the MCP pane imports the shared Switch');
  // 同一个导入也正是 skill 行用的那颗——统一在这里，谁都不许再抄一套开关/图标按钮出来。
  assert.ok(primitivesSource.includes(SHARED_SWITCH_IMPORT), 'skill rows use the very same Switch');
  // 上一版自造的电源图标按钮（Power 图标 + .mcp-server-toggle 类 + 转圈）不许回来。
  assert.doesNotMatch(editorSource, /\bPower\b/);
  assert.doesNotMatch(editorSource, /className="mcp-server-toggle/);
  assert.doesNotMatch(editorSource, /is-toggling/);
  assert.match(editorSource, /const enabled = mcpServerEnabled\(server\);/);
  // 状态本身还在：颜色点 + Enabled/Disabled 文字（Emil 规则：状态 = 文字 + 点）。
  assert.match(editorSource, /className="mcp-status-dot" \/>\{enabled \? 'Enabled' : 'Disabled'\}/);
  assert.match(editorSource, /className={`mcp-server-status \$\{enabled \? '' : 'is-disabled'}`}/);
  // 开关的落点就在 Status 这一列里，不再另开一列。
  assert.match(editorSource, /className="mcp-server-state"/);
});

test('开关说清楚它管哪一台、当前是什么状态，在飞的保存里锁住', () => {
  assert.match(editorSource, /className="mcp-server-switch"/);
  assert.ok(editorSource.includes("aria-label={`${enabled ? 'Disable' : 'Enable'} MCP server ${name}`}"));
  assert.match(editorSource, /checked=\{enabled\}/);
  assert.ok(editorSource.includes('onCheckedChange={next => toggleServer(name, next)}'));
  // 整页在保存中时开关也锁住（和 skill 行一样）：连点不会发第二次保存。
  assert.match(editorSource, /disabled=\{Boolean\(busy\)\}/);
});

test('点一下 = 改这一台的 enabled 后走和 Save 同一条保存路径（core 落盘 mcp.json + 重载 hub）', () => {
  const toggleBlock = editorSource.slice(editorSource.indexOf('const toggleServer ='));
  assert.ok(toggleBlock, 'toggleServer handler must exist');
  assert.match(toggleBlock, /setMcpServerEnabled\(parsed\.value, name, enabled\)/);
  assert.match(
    toggleBlock,
    /onSaveTools\(patchedRecords\(\{ mcp_json,[^)]*\), enabled \? `\$\{name\} enabled` : `\$\{name\} disabled`\)/,
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
