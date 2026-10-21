import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_AGENT_TOOL_GROUPS, groupPresetTools } from '../../../src/features/agents/model/agent-settings.js';

const editor = readFileSync(new URL('../../../src/features/settings/components/AgentConfigEditor.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../src/features/settings/settings.css', import.meta.url), 'utf8');

test('preset tools are grouped by the runtime tool groups, in group order', () => {
  const sections = groupPresetTools(
    ['write_file', 'read_file', 'exec_command', 'web_search'],
    DEFAULT_AGENT_TOOL_GROUPS,
  );
  assert.deepEqual(sections.map((section) => section.id), ['workspace_read', 'file_edits', 'terminal', 'web']);
  // 组内顺序跟着组定义走，而不是用户/服务端返回的随机顺序。
  assert.deepEqual(sections[0].tools, ['read_file']);
  assert.deepEqual(sections[1].tools, ['write_file']);
  assert.equal(sections[0].label, 'File read');
  assert.match(sections[0].description, /Read files/);
});

test('tools outside every group stay visible under Other instead of disappearing', () => {
  const sections = groupPresetTools(['read_file', 'image_generate', 'mcp.node_repl'], DEFAULT_AGENT_TOOL_GROUPS);
  const other = sections.at(-1);
  assert.equal(other.id, 'other');
  assert.equal(other.label, 'Other tools');
  assert.deepEqual(other.tools, ['image_generate', 'mcp.node_repl']);
  // 总数守恒：分组不吞工具。
  assert.equal(sections.flatMap((section) => section.tools).length, 3);
});

test('a tool claimed by two groups is shown once, and empty groups are dropped', () => {
  const groups = [
    { id: 'a', label: 'A', tools: ['read_file', 'write_file'] },
    { id: 'b', label: 'B', tools: ['write_file'] },
    { id: 'c', label: 'C', tools: ['never_used'] },
  ];
  const sections = groupPresetTools(['write_file', 'read_file'], groups);
  assert.deepEqual(sections.map((section) => section.id), ['a']);
  assert.deepEqual(sections[0].tools, ['read_file', 'write_file']);
  assert.deepEqual(groupPresetTools([], groups), []);
  // 分组表为空时退回内置分组，而不是把所有工具都塞进 Other。
  assert.deepEqual(groupPresetTools(['read_file'], []).map((section) => section.id), ['workspace_read']);
  assert.deepEqual(
    groupPresetTools(['read_file'], [{ id: 'x', label: 'X', tools: [] }]),
    [{ id: 'other', label: 'Other tools', description: 'Tools this preset enables outside the built-in groups.', tools: ['read_file'] }],
  );
});

test('the read-only preset panel shows capabilities, never the raw tool identifiers', () => {
  assert.match(editor, /const sections = groupPresetTools\(effectiveTools, normalized\.tool_groups \|\| DEFAULT_AGENT_TOOL_GROUPS\);/);
  assert.match(editor, /className="preset-tool-groups"/);
  assert.match(editor, /className="preset-tool-group-icon"/);
  assert.match(editor, /className="preset-tool-group-label">\{section\.label\}/);
  assert.match(editor, /className="preset-tool-group-desc">\{section\.description \|\| 'Enabled for this preset\.'\}/);
  assert.match(editor, /className="preset-tool-group-count">\{section\.tools\.length\}/);
  // 工具名不暴露给用户：只留分组标题 + 描述 + 数量。
  assert.doesNotMatch(editor, /section\.tools\.map/);
  assert.doesNotMatch(editor, /preset-chip/);
  assert.doesNotMatch(editor, /renderReadOnlyList/);
  // 技能名是用户可读的能力名，仍以 chip 展示，但默认只露前几个，其余“Show all”展开。
  assert.match(editor, /const SKILL_PREVIEW_COUNT = 8;/);
  assert.match(editor, /className="preset-skill-chip"/);
  assert.match(editor, /className="preset-skills-toggle"/);
  assert.match(editor, /`Show all \$\{effectiveSkills\.length\}`/);
  // 预设只读，不再摆两个禁用输入框冒充表单。
  assert.doesNotMatch(editor, /<Input value=\{preset\.display_name/);
  assert.match(editor, /Read-only\. Create your own agent/);
});

test('preset capability styles keep the grouped list readable inside the 390px editor', () => {
  assert.match(css, /\.preset-meta-row \{ display: grid; grid-template-columns: 88px minmax\(0, 1fr\);/);
  assert.match(css, /\.preset-tool-groups \{ border: 1px solid #ffffff0c; border-radius: 9px; background: var\(--control\); overflow: hidden; \}/);
  assert.match(css, /\.preset-tool-group \{ display: grid; grid-template-columns: 20px minmax\(0, 1fr\) auto;[^}]*padding: 11px 12px;/);
  assert.match(css, /\.preset-tool-group \+ \.preset-tool-group \{ border-top: 1px solid #ffffff08; \}/);
  assert.match(css, /\.preset-tool-group-desc \{[^}]*font-size: 11px;[^}]*line-height: 1\.5;/);
  assert.match(css, /\.preset-skill-chip \{[^}]*font-size: 11px;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.preset-skills-toggle \{[^}]*font: inherit;[^}]*font-size: 11px;/);
  assert.match(css, /\.preset-caps-count \{[^}]*font-variant-numeric: tabular-nums/);
});
