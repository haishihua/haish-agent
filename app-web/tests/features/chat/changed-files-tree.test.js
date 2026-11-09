import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changedFilesForTask,
  collectChangedFiles,
  fileTreeNodes,
} from '../../../src/core/changed-files.js';

// chat-rows 的依赖链里有读 window 的 api 基地址模块，测试里先补一个空壳再动态导入。
globalThis.window = {};
const { buildChatRows } = await import('../../../src/features/app/model/chat-rows.js');

// 事件形状对齐前端 eventLog：tool_call_completed 带 camelCase 的 toolResponse / toolInput。
function completed(callId, toolName, response, extra = {}) {
  return { type: 'tool_call_completed', callId, toolName, toolResponse: response, ...extra };
}

function resolved(path, additions, deletions, extra = {}) {
  return {
    tool_name: 'edit_file',
    operation: 'write',
    status: 'ok',
    result_state: 'resolved',
    summary: 'Applied exact batch edits from one file snapshot.',
    subject: { path },
    data: { added_lines: additions, removed_lines: deletions, checkpoint_id: 'cp-1' },
    ...extra,
  };
}

test('a run folds every write into one row per path and skips calls that never changed a file', () => {
  const files = collectChangedFiles({
    eventLog: [
      { type: 'tool_call_started', callId: 'c0', toolName: 'edit_file', toolInput: { path: 'app-web/styles/delegation.css' } },
      completed('c0', 'edit_file', resolved('app-web/styles/delegation.css', 9, 0)),
      // 同一路径的第二次编辑：累加，不新增行
      completed('c1', 'edit_file', resolved('app-web/styles/delegation.css', 5, 2)),
      // no_change / 失败 / 目录 / 只读 都不进树
      completed('c2', 'edit_file', { status: 'ok', result_state: 'no_change', subject: { path: 'app-web/styles/delegation.css' }, data: { added_lines: 0, removed_lines: 0 } }),
      completed('c3', 'write_file', { status: 'error', result_state: 'failed', subject: { path: 'app-web/broken.js' } }),
      completed('c4', 'create_dir', { status: 'ok', result_state: 'resolved', subject: { path: 'app-web/new-dir' }, data: { created: true } }),
      completed('c5', 'read_file', { status: 'ok', result_state: 'resolved', subject: { path: 'app-web/styles/chat.css' } }),
      completed('c6', 'write_file', resolved('app-web/tests/contracts/picker-selection-color.test.js', 27, 0)),
    ],
  });

  assert.deepEqual(files, [
    { path: 'app-web/styles/delegation.css', additions: 14, deletions: 2 },
    { path: 'app-web/tests/contracts/picker-selection-color.test.js', additions: 27, deletions: 0 },
  ]);
});

test('sub-agent writes and copy destinations are part of the same run', () => {
  const files = collectChangedFiles({
    eventLog: [
      { type: 'sub_agent_tool_call_completed', callId: 's1', toolName: 'edit_file', toolResponse: resolved('app-web/src/features/chat/panel.jsx', 4, 1) },
      {
        type: 'tool_call_completed',
        callId: 'c2',
        toolName: 'copy_file',
        toolResponse: {
          status: 'ok',
          result_state: 'resolved',
          subject: { source_path: 'assets/logo.svg', destination_path: 'public/logo.svg' },
          data: { copied: true, bytes_copied: 1200 },
        },
      },
    ],
  });

  assert.deepEqual(files.map((file) => file.path), [
    'app-web/src/features/chat/panel.jsx',
    'public/logo.svg',
  ]);
});

test('a deleted file is still a changed file even though it carries no line counts', () => {
  const files = collectChangedFiles({
    eventLog: [completed('c1', 'delete_file', {
      status: 'ok',
      result_state: 'resolved',
      subject: { path: 'app-web/obsolete.css' },
      data: { deleted: true, checkpoint_id: 'cp-9' },
    })],
  });
  assert.deepEqual(files, [{ path: 'app-web/obsolete.css', additions: 0, deletions: 0 }]);
});

test('replayed events and tool calls never double count the same call', () => {
  const response = resolved('app-web/styles/chat.css', 3, 6);
  const files = collectChangedFiles({
    eventLog: [completed('c1', 'edit_file', response), completed('c1', 'edit_file', response)],
    toolCalls: [{ callId: 'c1', toolName: 'edit_file', toolResponse: response }],
  });
  assert.deepEqual(files, [{ path: 'app-web/styles/chat.css', additions: 3, deletions: 6 }]);
});

test('tool calls stay usable when the event log is not projected yet, and diff text is the last resort', () => {
  const files = collectChangedFiles({
    toolCalls: [{
      callId: 'live-1',
      toolName: 'write_file',
      toolResponse: {
        status: 'ok',
        result_state: 'resolved',
        subject: { path: './app-web/styles/generated.css' },
        artifacts: { diff: '@@ -0,0 +1,2 @@\n+a\n+b\n' },
      },
    }],
  });
  assert.deepEqual(files, [{ path: 'app-web/styles/generated.css', additions: 2, deletions: 0 }]);
});

test('the tree groups files under their folder and keeps first-touch order', () => {
  const nodes = fileTreeNodes([
    { path: 'app-web/styles/modals.css', additions: 8, deletions: 3 },
    { path: 'app-web/styles/chat.css', additions: 2, deletions: 2 },
    { path: 'README.md', additions: 1, deletions: 0 },
    { path: '/tmp/review/agent-request.json', additions: 5, deletions: 0 },
  ]);

  assert.deepEqual(nodes, [
    { path: 'app-web/styles', name: 'app-web/styles', depth: 0, kind: 'folder' },
    { path: 'app-web/styles/modals.css', name: 'modals.css', depth: 1, kind: 'file', additions: 8, deletions: 3 },
    { path: 'app-web/styles/chat.css', name: 'chat.css', depth: 1, kind: 'file', additions: 2, deletions: 2 },
    // 工作区外的绝对路径照样按自己的目录分组（树形结构不能扁平化）
    { path: '/tmp/review', name: '/tmp/review', depth: 0, kind: 'folder' },
    { path: '/tmp/review/agent-request.json', name: 'agent-request.json', depth: 1, kind: 'file', additions: 5, deletions: 0 },
    // 没有目录的文件留在顶层，排在所有目录后面
    { path: 'README.md', name: 'README.md', depth: 0, kind: 'file', additions: 1, deletions: 0 },
  ]);
});

test('a file whose folder already appeared never lands under the previous folder', () => {
  // 真实例子：FileTree.jsx（agent-elements）→ changed-files.js（core）→ file-tree.css（又回
  // agent-elements），只按「目录首次出现」插目录行会把 file-tree.css 挂到 core 下。
  const nodes = fileTreeNodes([
    { path: 'app-web/src/shared/ui/agent-elements/FileTree.jsx', additions: 3, deletions: 24 },
    { path: 'app-web/src/core/changed-files.js', additions: 10, deletions: 25 },
    { path: 'app-web/src/shared/ui/agent-elements/file-tree.css', additions: 9, deletions: 38 },
  ]);
  assert.deepEqual(nodes.map((node) => [node.name, node.depth, node.kind]), [
    ['app-web/src/shared/ui/agent-elements', 0, 'folder'],
    ['FileTree.jsx', 1, 'file'],
    ['file-tree.css', 1, 'file'],
    ['app-web/src/core', 0, 'folder'],
    ['changed-files.js', 1, 'file'],
  ]);
});

test('absolute workspace paths are folded under their common parent so the folder names stay readable', () => {
  const base = '/Users/zhanruitao/front-end-project/haish-agent';
  const nodes = fileTreeNodes([
    { path: `${base}/app-web/src/features/chat/changed-files.js`, additions: 173, deletions: 1 },
    { path: `${base}/app-web/src/shared/ui/agent-elements/FileTree.jsx`, additions: 75, deletions: 0 },
    { path: `${base}/app-web/src/shared/ui/agent-elements/file-tree.css`, additions: 125, deletions: 0 },
  ]);
  // 目录名从 /Users/…/haish-agent/app-web/src/… 缩到 src/…（公共父目录之上的一层保留下来）。
  assert.deepEqual(nodes.map((node) => [node.name, node.depth, node.kind]), [
    ['src/features/chat', 0, 'folder'],
    ['changed-files.js', 1, 'file'],
    ['src/shared/ui/agent-elements', 0, 'folder'],
    ['FileTree.jsx', 1, 'file'],
    ['file-tree.css', 1, 'file'],
  ]);
  // 行里仍然带着完整路径（悬停的路径卡用它），只是显示的目录名缩短了。
  assert.equal(nodes[0].path, `${base}/app-web/src/features/chat`);
  assert.equal(nodes[1].path, `${base}/app-web/src/features/chat/changed-files.js`);
});

test('one absolute file keeps one directory of context instead of shrinking to a bare name', () => {
  const nodes = fileTreeNodes([{ path: '/tmp/haish-style-review/summary.json', additions: 4, deletions: 0 }]);
  assert.deepEqual(nodes.map((node) => [node.name, node.depth]), [
    ['haish-style-review', 0],
    ['summary.json', 1],
  ]);
  assert.equal(nodes[0].path, '/tmp/haish-style-review');
});

test('a turn that only read files produces no tree at all', () => {
  const data = changedFilesForTask({
    eventLog: [
      completed('c1', 'read_file', { status: 'ok', result_state: 'resolved', subject: { path: 'app-web/styles/chat.css' } }),
      completed('c2', 'exec_command', { status: 'ok', result_state: 'resolved', data: { exit_code: 0 } }),
    ],
  });
  assert.equal(data.count, 0);
  assert.deepEqual(data.nodes, []);
  assert.equal(data.totalAdditions, 0);
  assert.equal(data.totalDeletions, 0);
});

test('totals count only additions and deletions from resolved writes', () => {
  const data = changedFilesForTask({
    eventLog: [
      completed('c1', 'edit_file', resolved('app-web/styles/delegation.css', 14, 0)),
      completed('c2', 'write_file', resolved('app-web/styles/chat.css', 6, 3)),
    ],
  });
  assert.equal(data.count, 2);
  assert.equal(data.totalAdditions, 20);
  assert.equal(data.totalDeletions, 3);
  assert.equal(data.nodes.filter((node) => node.kind === 'folder').length, 1);
});

test('the fold is cached per task object and recomputed for a new one', () => {
  const response = resolved('app-web/styles/chat.css', 3, 6);
  const task = { eventLog: [completed('c1', 'edit_file', response)] };
  assert.equal(changedFilesForTask(task), changedFilesForTask(task));

  const nextTask = { eventLog: [...task.eventLog, completed('c2', 'edit_file', resolved('app-web/styles/modals.css', 1, 1))] };
  assert.equal(changedFilesForTask(nextTask).count, 2);
  assert.notEqual(changedFilesForTask(nextTask), changedFilesForTask(task));
});

test('chat rows carry the changed files so the bubble can render the tree', () => {
  const task = {
    taskId: 't1',
    title: '调一下 provider 选择器',
    status: 'done',
    answerText: '已改好。',
    eventLog: [
      completed('c1', 'edit_file', resolved('app-web/styles/delegation.css', 14, 0)),
      completed('c2', 'edit_file', resolved('app-web/tests/fixtures/provider-glyph-visual.jsx', 6, 0)),
    ],
  };
  const rows = buildChatRows({
    agentOptions: [],
    chatMessageRowsCache: new WeakMap(),
    conversationId: 'c1',
    currentConversation: {},
    settledRuntimeTaskIds: new Set(),
    taskRuntimeState: {
      activeTaskId: null,
      pendingTask: null,
      latestTaskId: 't1',
      taskOrder: ['t1'],
      tasksById: { t1: task },
    },
  });
  const agentRow = rows.find((row) => row.role === 'agent');
  assert.equal(agentRow.changedFiles.count, 2);
  assert.equal(agentRow.changedFiles.totalAdditions, 20);
  assert.deepEqual(agentRow.changedFiles.nodes.map((node) => node.name), ['app-web/styles', 'delegation.css', 'app-web/tests/fixtures', 'provider-glyph-visual.jsx']);
});
