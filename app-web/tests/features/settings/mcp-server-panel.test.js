// MCP 折叠行的行模型：配置（mcp.json）+ core 的缓存快照（GET /api/settings/tools 的 mcp_servers）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { mcpServerRows, mcpServerStatus, MCP_SERVER_STATUS_LABELS } from '../../../src/features/settings/model/mcp-server-panel.js';

const config = {
  servers: {
    figma: { transport: 'stdio', command: 'npx' },
    sketch: { transport: 'http', url: 'http://127.0.0.1:9999/mcp', enabled: false },
    blank: {},
  },
};

const catalog = [
  {
    name: 'figma',
    enabled: true,
    loaded: true,
    error: null,
    tools: [{ name: 'get_file' }, { name: 'get_comments' }, { name: '' }],
  },
  { name: 'sketch', enabled: false, loaded: true, error: null, tools: [{ name: 'ignored' }] },
];

test('每台 server 一行：名字、transport（缺省 stdio）、开关状态、工具清单', () => {
  const rows = mcpServerRows(config, catalog);
  assert.deepEqual(rows.map((row) => row.name), ['figma', 'sketch', 'blank']);
  assert.equal(rows[0].transport, 'stdio');
  assert.equal(rows[1].transport, 'http');
  assert.equal(rows[2].transport, 'stdio', 'a server without a transport is stdio, not blank');
  assert.deepEqual(rows[0].tools, ['get_file', 'get_comments'], 'empty tool names are dropped');
  // 被关掉的那台不显示别人缓存的工具，免得看起来像能用。
  assert.equal(rows[1].enabled, false);
  assert.deepEqual(rows[1].tools, ['ignored'], 'the snapshot keeps whatever core cached');
});

test('状态点：关着就是 Disabled，有 error 是 Failed，加载过是 Connected，其余 Not loaded', () => {
  assert.equal(mcpServerStatus(false, { loaded: true, error: 'boom' }), 'disabled', 'disabled wins over everything');
  assert.equal(mcpServerStatus(true, { loaded: false, error: 'connection refused' }), 'failed');
  assert.equal(mcpServerStatus(true, { loaded: true, error: null }), 'connected');
  assert.equal(mcpServerStatus(true, { loaded: false, error: null }), 'idle');
  assert.equal(mcpServerStatus(true, null), 'idle');
  // 四种状态都有给人看的文字。
  for (const status of ['connected', 'idle', 'failed', 'disabled']) {
    assert.equal(typeof MCP_SERVER_STATUS_LABELS[status], 'string');
  }
});

test('旧 core 不带快照时降级：仍然列出每台，状态是 Not loaded，绝不自己编造连接状态', () => {
  const rows = mcpServerRows(config, undefined);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.status), ['idle', 'disabled', 'idle']);
  assert.deepEqual(rows.map((row) => row.tools), [[], [], []]);
  assert.equal(rows[0].loaded, false);
  // 快照对应的 server 已经不在配置里了（刚删掉）也不会冒出一行。
  assert.equal(mcpServerRows(config, [{ name: 'ghost', loaded: true, tools: [] }]).length, 3);
});

test('配置本身坏着（不是对象 / servers 不是对象）时返回空行，不抛', () => {
  assert.deepEqual(mcpServerRows(null, catalog), []);
  assert.deepEqual(mcpServerRows({ servers: [] }, catalog), []);
  assert.deepEqual(mcpServerRows({ servers: 'nope' }, catalog), []);
});
