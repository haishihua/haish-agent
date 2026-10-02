import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mcpToolPickerServers,
  mcpServerWholesaleAllowed,
  mcpToolKey,
  mcpToolSelected,
  toggleMcpToolSelection,
} from '../../../src/features/settings/model/mcp-tool-selection.js';

const SERVER = {
  name: 'node-repl',
  tools: [
    { name: 'node_repl', qualified_name: 'node-repl.node_repl' },
    { name: 'node_repl_wait', qualified_name: 'node-repl.node_repl_wait' },
    { name: 'node_repl_reset', qualified_name: 'node-repl.node_repl_reset' },
  ],
};
const OTHER_SERVER = { name: 'cua-agent', tools: [{ name: 'run_cua_task' }] };

const sorted = (values) => [...values].sort();

test('no servers, empty catalogs and globally disabled tools produce no choices', () => {
  assert.deepEqual(mcpToolPickerServers(undefined), []);
  assert.deepEqual(mcpToolPickerServers([]), []);
  assert.deepEqual(mcpToolPickerServers([{ name: 'figma', tools: [] }, { name: 'sketch' }]), []);
  assert.deepEqual(mcpToolPickerServers([{ ...SERVER, enabled: false }]), []);
  assert.deepEqual(mcpToolPickerServers([{ ...SERVER, tools: SERVER.tools.map((tool) => ({ ...tool, enabled: false })) }]), []);
});

test('available tool choices do not depend on agent selections; errors remain visible', () => {
  const disabledTool = { name: 'off', enabled: false };
  const input = [SERVER, { name: 'mixed', tools: [{ name: 'on' }, disabledTool, null, { name: ' ' }] },
    { name: 'broken', tools: [], error: 'Connection failed' },
    { name: 'disabled', enabled: false, error: 'stale error', tools: SERVER.tools }];
  const before = structuredClone(input);
  const result = mcpToolPickerServers(input);
  assert.deepEqual(result.map((server) => server.name), ['node-repl', 'mixed', 'broken']);
  assert.deepEqual(result[0].tools, SERVER.tools);
  assert.deepEqual(result[1].tools, [{ name: 'on' }]);
  assert.equal(result[2].error, 'Connection failed');
  assert.equal(mcpToolSelected({}, result[0], 'node_repl'), false);
  assert.deepEqual(input, before);
});

test('the per-tool key is server.tool, trimmed and never half-built', () => {
  assert.equal(mcpToolKey('cua-agent', 'run_cua_task'), 'cua-agent.run_cua_task');
  assert.equal(mcpToolKey(' cua-agent ', ' run_cua_task '), 'cua-agent.run_cua_task');
  assert.equal(mcpToolKey('cua-agent', ''), '');
  assert.equal(mcpToolKey(null, 'run_cua_task'), '');
});

test('a tool is checked when it is listed per tool, or when its server is allowed in full', () => {
  assert.equal(mcpToolSelected({ allow_servers: [], allow_tools: ['node-repl.node_repl'] }, SERVER, 'node_repl'), true);
  assert.equal(
    mcpToolSelected({ allow_servers: [], allow_tools: ['node-repl.node_repl'] }, SERVER, 'node_repl_wait'),
    false,
  );
  // 老档案里的整台放行：名下工具全亮。
  assert.equal(mcpToolSelected({ allow_servers: ['node-repl'], allow_tools: [] }, SERVER, 'node_repl_reset'), true);
  // 别的服务器放行不连坐。
  assert.equal(mcpToolSelected({ allow_servers: ['cua-agent'], allow_tools: [] }, SERVER, 'node_repl'), false);
  assert.equal(mcpToolSelected({}, SERVER, 'node_repl'), false);
});

test('toggling one tool touches nothing else', () => {
  const before = { allow_servers: [], allow_tools: ['cua-agent.run_cua_task'] };
  const added = toggleMcpToolSelection(before, SERVER, 'node_repl');
  assert.deepEqual(sorted(added.allow_tools), sorted(['cua-agent.run_cua_task', 'node-repl.node_repl']));
  assert.deepEqual(added.allow_servers, []);

  const removed = toggleMcpToolSelection(added, SERVER, 'node_repl');
  assert.deepEqual(removed.allow_tools, ['cua-agent.run_cua_task']);
  assert.equal(mcpToolSelected(removed, SERVER, 'node_repl'), false);

  // 连点两次回到原样，不会越滚越多。
  const twice = toggleMcpToolSelection(
    toggleMcpToolSelection(before, SERVER, 'node_repl_wait'),
    SERVER,
    'node_repl_wait',
  );
  assert.deepEqual(sorted(twice.allow_tools), sorted(before.allow_tools));
});

test('a whole-server allow becomes per-tool entries the moment one of its tools is touched', () => {
  const before = { allow_servers: ['node-repl'], allow_tools: ['cua-agent.run_cua_task'] };
  const after = toggleMcpToolSelection(before, SERVER, 'node_repl_wait');
  // 服务器级放行让位：勾掉的那条不写，其余已知工具落成逐条。
  assert.deepEqual(after.allow_servers, []);
  assert.deepEqual(
    sorted(after.allow_tools),
    sorted(['cua-agent.run_cua_task', 'node-repl.node_repl', 'node-repl.node_repl_reset']),
  );
  assert.equal(mcpToolSelected(after, SERVER, 'node_repl_wait'), false);
  assert.equal(mcpToolSelected(after, SERVER, 'node_repl'), true);
  // 别的服务器照样不进 allow_servers。
  assert.equal(mcpServerWholesaleAllowed(after, 'cua-agent'), false);
});

test('a click without a tool name is a no-op, and the policy is always returned whole', () => {
  const before = { allow_servers: ['node-repl'], allow_tools: [] };
  assert.deepEqual(toggleMcpToolSelection(before, SERVER, ''), { allow_servers: ['node-repl'], allow_tools: [] });
  assert.deepEqual(toggleMcpToolSelection(undefined, OTHER_SERVER, 'run_cua_task'), {
    allow_servers: [],
    allow_tools: ['cua-agent.run_cua_task'],
  });
  assert.equal(mcpServerWholesaleAllowed({ allow_servers: [' node-repl '] }, 'node-repl'), true);
});
