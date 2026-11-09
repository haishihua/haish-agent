// Settings 里的一次性提示统一走 AppToast（顶部堆叠），不再往编辑区下方塞绿字。
//
// 三类曾经的行内提示：
//   1. MCP 的 Validate / Save（ToolsConfigEditor 的 mcp_status）；
//   2. Test connection 的结果（SettingsPage 的 panelConnectionStatus）；
//   3. OAuth 登录成功（LlmConfigEditor 的 “Connected to …”）。
// 这里逐个盯住：成功走 onToast，行内不再复述。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');

const [toolsEditor, settingsPage, llmEditor] = await Promise.all([
  read('features/settings/components/ToolsConfigEditor.jsx'),
  read('features/settings/components/SettingsPage.jsx'),
  read('features/settings/components/LlmConfigEditor.jsx'),
]);

test('MCP validate reports through the shared toast, not an inline status line', () => {
  assert.match(toolsEditor, /onToast\?\.\('success', 'MCP config is valid\.'\)/);
  // 行内那条绿字连同写进记录的 mcp_status 一起消失。
  assert.doesNotMatch(toolsEditor, /mcp_status: 'MCP config is valid\.'/);
  assert.doesNotMatch(toolsEditor, /className="settings-inline-success"/);
  // Save 复用保存 handler 自己的 toast，因此不再补一条行内状态。
  assert.doesNotMatch(toolsEditor, /mcp_status: 'Saved and MCP reloaded\.'/);
  // 校验错误同时给 toast 和下面那行 ErrorState（要对着 JSON 改）。
  assert.match(toolsEditor, /onToast\?\.\('error', message\)/);
});

test('Test connection results arrive as toasts, and only for a test the user just ran', () => {
  assert.match(settingsPage, /connectionTestRequestRef\.current = true;/);
  assert.match(settingsPage, /onToast\?\.\(status\.state === 'error' \? 'error' : 'success', status\.message\)/);
  // 打开抽屉时读到的历史结果（内存页 records 里那份）不能自己弹一次。
  assert.match(settingsPage, /if \(!connectionTestRequestRef\.current\) return;/);
  // 成功不再画在编辑区底部；错误仍留一行给它。
  assert.doesNotMatch(settingsPage, /<p className="settings-inline-success" role="status">\{panelConnectionStatus\.message\}/);
  assert.match(settingsPage, /panelConnectionStatus\?\.state === 'error' && <ErrorState variant="inline"/);
});

test('OAuth success toasts once and the editor keeps only a neutral连接状态 line', () => {
  assert.match(llmEditor, /onToast\?\.\('success', `Connected to \$\{provider\.label\}`\)/);
  assert.match(llmEditor, /onToast\?\.\('error', String\(payload\?\.message \|\| 'OAuth login failed\. Start again\.'\)\)/);
  // 常驻的绿色成功卡换成中性状态行，成功那一下已经由 toast 说过。
  assert.doesNotMatch(llmEditor, /className="settings-inline-success"/);
  // SettingsPage 必须把 onToast 传进编辑器，否则上面的调用是空转。
  assert.match(settingsPage, /<LlmConfigEditor[\s\S]*?onToast=\{onToast\}/);
});
