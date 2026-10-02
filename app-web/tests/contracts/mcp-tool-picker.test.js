import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const editorSource = fs.readFileSync(
  new URL('../../src/features/settings/components/AgentConfigEditor.jsx', import.meta.url),
  'utf8',
);
const modelSource = fs.readFileSync(
  new URL('../../src/features/settings/model/mcp-tool-selection.js', import.meta.url),
  'utf8',
);

function readTree(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return readTree(full);
    return /\.(?:js|jsx)$/.test(entry.name) ? [fs.readFileSync(full, 'utf8')] : [];
  });
}

test('the MCP list has no server-level 「all tools」 switch left', () => {
  // 服务器那行只是分组标题；整台服务器一键放行这个入口，整个设置区都不许再出现。
  assert.doesNotMatch(editorSource, /all tools/i);
  const settingsTree = readTree(new URL('../../src/features/settings', import.meta.url).pathname);
  const offenders = settingsTree.filter((source) => /all tools/i.test(source));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(editorSource, /toggleMcpServer/);
  // 服务器名那一行不再挂 Checkbox。
  assert.match(editorSource, /<span className="settings-check-label">\{server\.name\}<\/span>/);
});

test('every MCP checkbox is one tool, and the server name cannot disable it', () => {
  const mcpBlock = editorSource.slice(editorSource.indexOf('label="MCP tools"'));
  assert.match(mcpBlock, /const tools = Array\.isArray\(server\.tools\) \? server\.tools : \[\];/);
  assert.match(
    mcpBlock,
    /checked=\{mcpToolSelected\(current\.mcp_policy, server, tool\.name\)\}\n\s+onCheckedChange=\{\(\) => toggleMcpTool\(server, tool\.name\)\}\n\s+disabled=\{readOnly\}/,
  );
  // 老写法（整台服务器放行时把工具行锁死）必须消失，否则勾不动。
  assert.doesNotMatch(mcpBlock, /allowedMcpServers\.has\(server\.name\)/);
  assert.match(editorSource, /const mcpServers = mcpToolPickerServers\(normalized\.mcp_servers\);/);
  assert.match(mcpBlock, /\{!hasMcpTools \? <small>No MCP tools available\.<\/small> : null\}/);
  assert.doesNotMatch(mcpBlock, /No tools reported yet|No configured MCP servers/);
});

test('the selection logic lives in one model: per-tool wins, whole-server allows are read but never written', () => {
  assert.match(
    editorSource,
    /import \{ mcpToolPickerServers, mcpToolSelected, toggleMcpToolSelection \} from '\.\.\/model\/mcp-tool-selection\.js';/,
  );
  assert.match(editorSource, /updateMcpPolicy\(toggleMcpToolSelection\(current\.mcp_policy, server, toolName\)\);/);
  // 读：老档案的 allow_servers 照旧让名下工具全亮。
  assert.match(modelSource, /export function mcpServerWholesaleAllowed\(policy, serverName\)/);
  assert.match(modelSource, /if \(mcpServerWholesaleAllowed\(policy, server\?\.name\)\) return true;/);
  // 写：动过任一工具就把整台放行落成逐条，界面和数据从此一致。
  assert.match(
    modelSource,
    /const keptServers = allowServers\.filter\(\(name\) => name !== clean\(server\?\.name\)\);/,
  );
  assert.match(modelSource, /for \(const item of serverToolKeys\(server\)\) allowTools\.add\(item\);/);
  assert.match(modelSource, /return \{ allow_servers: keptServers, allow_tools: \[\.\.\.allowTools\] \};/);
});

test('read-only agents still show no MCP controls at all', () => {
  assert.match(editorSource, /\{!readOnly \? \(\n\s+<FieldRow label="MCP tools">/);
});
