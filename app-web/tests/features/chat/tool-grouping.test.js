import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};

const { groupConsecutiveTools } = await import('../../../src/core/tool-grouping.js');
const { TOOL_SHELL_NAMES } = await import('../../../src/core/tool-names.js');

const groupOf = (names, status = 'done') => {
  const items = groupConsecutiveTools(names.map((toolName, index) => ({
    kind: 'tool',
    id: `call-${index}`,
    toolName,
    status,
  })));
  assert.equal(items.length, 1, `${JSON.stringify(names)} must collapse into one group`);
  assert.equal(items[0].kind, 'tool_group');
  return items[0];
};

const summaryOf = (names, status = 'done') => groupOf(names, status).summary;

test('every terminal tool counts as one command interaction', () => {
  // 终端桶只认登记表 terminal: true：exec_command 与它的写回 write_stdin 都算一次命令交互，
  // 加新的终端工具时摘要跟着走，不用回来补名字。
  for (const name of TOOL_SHELL_NAMES) {
    assert.equal(summaryOf([name, name], 'running'), 'executing 2 commands', name);
    assert.equal(summaryOf([name, name], 'done'), 'executed 2 commands', name);
  }
});

test('names that merely look like shell tools keep the generic tool wording', () => {
  // 分组是逐字比对登记表，不做 includes 匹配：名字里带 shell / command 的陌生工具
  // 不能因为长得像就被并进命令桶。
  for (const name of ['shell', 'shell_exec', 'run_command', 'exec_command_v2']) {
    assert.equal(summaryOf([name, name], 'running'), 'using 2 tools', name);
    assert.equal(summaryOf([name, name], 'done'), 'used 2 tools', name);
  }
});

test('a shell run mixed with other tools keeps one entry per verb', () => {
  const group = groupOf(['exec_command', 'write_stdin', 'read_file'], 'running');
  assert.equal(group.summary, 'reading 1 file · executing 2 commands');
  assert.deepEqual(group.tools.map((tool) => tool.toolName), ['exec_command', 'write_stdin', 'read_file']);
  assert.equal(summaryOf(['exec_command', 'write_stdin', 'read_file']), 'read 1 file · executed 2 commands');
  assert.equal(summaryOf(['exec_command', 'read_file', 'read_file'], 'running'), 'reading 2 files · executing 1 command');
});
