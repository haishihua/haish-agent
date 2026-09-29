// 侧栏 Task 标签页的搜索框。
//
// 以前搜索框只在 Conversation 标签页渲染（`{!workflowTaskMode && <ThreadSearch .../>}`），
// Task 那一侧只有列表，没有任何搜索入口。现在两个标签页共用同一只 ThreadSearch：
// 会话模式搜会话、任务模式搜任务，选中后分别跳对应会话 / 对应任务；输入框、结果面板、
// 键盘操作、清空按钮都是一份代码，两个标签页因此长得一样、用起来也一样。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../../src/features/conversations/components/ConversationsPanel.jsx', import.meta.url), 'utf8');
const searchSource = readFileSync(new URL('../../src/features/conversations/components/ThreadSearch.jsx', import.meta.url), 'utf8');
const fixtureSource = readFileSync(new URL('../fixtures/sidebar-preview.jsx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('the Task panel gets the same search field as the Conversation panel', () => {
  // 旧写法把整只搜索框藏在 !workflowTaskMode 后面：Task 标签页一行都看不到。
  assert.doesNotMatch(panelSource, /\{!workflowTaskMode && <ThreadSearch/, 'the search must not stay hidden on the Task tab');
  assert.match(
    panelSource,
    /<ThreadSearch[\s\S]{0,200}?mode=\{workflowTaskMode \? 'tasks' : 'conversations'\}[\s\S]{0,200}?onSelectTask=\{onSelectTask\}/,
    'one search field for both tabs, handed the same task jump the task rows use',
  );
});

test('task mode matches tasks and opens the task itself', () => {
  // 任务那一侧复用侧栏自己的取任务 helper：搜出来的行就是列表里的同一批行。
  assert.match(searchSource, /projectWorkflowTasks\(project\)/);
  assert.match(searchSource, /onSelectTask\?\.\(result\.project\.id, result\.conversationId, result\.task\)/);
  // 文案跟着模式走（同一个输入框，两个标签页各说各的）。
  assert.match(searchSource, /Search tasks/);
  assert.match(searchSource, /No matching tasks/);
  assert.match(searchSource, /Clear task search/);
  // 任务标题缺了也得有行可点（跟任务卡一个兜底）。
  assert.match(searchSource, /Untitled task/);
  // 会话那一侧的老行为还在：同一只组件两个模式，别把原来的拆了。
  assert.match(searchSource, /Search conversations/);
  assert.match(searchSource, /onSelect\?\.\(result\.project\.id, result\.conversation\.id\)/);
});

test('the sidebar fixture exercises the task search end to end', () => {
  assert.match(fixtureSource, /window\.__sidebarTaskSearchChecks/, 'the fixture must expose the task-search checks');
  assert.match(fixtureSource, /workflowTaskMode/, 'the fixture must mount a Task-tab panel');
  assert.match(readme, /__sidebarTaskSearchChecks/, 'the README must document the task-search entry point');
});
