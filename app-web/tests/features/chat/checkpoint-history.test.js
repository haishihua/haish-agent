import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolView } from '../../../src/features/chat/model/tool-view.js';
import { formatCheckpointTime } from '../../../src/features/chat/model/tool-view/checkpoint.js';

// list_checkpoints 的官方 ToolResponse 形状：{data:{groups,count,total_groups},limits}。
const now = new Date();
const today = new Date(now);
today.setHours(9, 41, 0, 0);
const older = new Date(today);
older.setDate(today.getDate() - 3);

const GROUPS = [
  {
    task_id: 'task-new',
    task_title: 'Add converters',
    user_request: 'add converters',
    updated_at: today.toISOString(),
    paths: ['app-web/a.js', 'app-web/b.js', 'app-web/a.js'],
    checkpoint_ids: ['cp-3', 'cp-2', 'cp-1'],
    checkpoint_count: 3,
    current: true,
  },
  {
    task_id: 'task-old',
    task_title: '',
    user_request: 'Rename the cache\nlayer',
    updated_at: older.toISOString(),
    paths: ['src/cache.py'],
    checkpoint_ids: ['cp-0'],
    checkpoint_count: 1,
    current: false,
  },
];

function listing(groups, extra = {}) {
  return {
    toolName: 'list_checkpoints',
    status: 'done',
    toolInput: { limit: 5 },
    toolResponse: {
      tool_name: 'list_checkpoints',
      status: 'ok',
      result_state: 'resolved',
      summary: 'Listed workspace checkpoints.',
      data: { groups, count: groups.length, total_groups: groups.length },
      ...extra,
    },
  };
}

test('list_checkpoints maps backend groups onto checkpoint rows', () => {
  const view = buildToolView(listing(GROUPS));

  assert.equal(view.mode, 'checkpoints');
  assert.equal(view.label, 'Listed checkpoints');
  assert.equal(view.failed, false);

  // 官方顺序是旧 → 新（current 之后的行才是 ahead），后端给的是新 → 旧，这里反过来。
  assert.deepEqual(view.checkpoints.map((row) => row.id), ['task-old', 'task-new']);
  assert.equal(view.currentId, '');
  assert.ok(view.checkpoints.every((row) => !('current' in row)));

  // 同一路径出现两次只算一个文件；checkpoint_count 是快照记录数，不当文件数用。
  assert.deepEqual(view.checkpoints.map((row) => row.files), [1, 2]);

  // 没有 task_title 时退回 user_request，并把换行压成空格。
  assert.equal(view.checkpoints[0].label, 'Rename the cache layer');
  assert.equal(view.checkpoints[1].label, 'Add converters');

  // 同一天只给 HH:MM，跨天补月日。
  assert.match(view.checkpoints[1].at, /^\d{2}:\d{2}$/);
  assert.match(view.checkpoints[0].at, /^\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('a listing without a current group leaves every row behind', () => {
  const groups = GROUPS.map((group) => ({ ...group, current: false }));
  const view = buildToolView(listing(groups));

  assert.equal(view.currentId, '');
  assert.ok(view.checkpoints.every((row) => !('current' in row)));
});

test('legacy multimodal representations display only user text', () => {
  const groups = [
    { task_id: 'one', task_title: String.raw`[TextPart(text='用户\'s 修改\n第二行', kind='text'), ImagePart(url='/secret/file.png', kind='image')]` },
    { task_id: 'two', task_title: '[TextPart(text=broken', user_request: '备用标题' },
    { task_id: 'three', task_title: '[ImagePart(url="/secret")]' },
  ];
  const rows = buildToolView(listing(groups)).checkpoints;
  assert.deepEqual(rows.map((row) => row.label), ['three', '备用标题', "用户's 修改 第二行"]);
});

test('an empty listing folds into a single body line', () => {
  const view = buildToolView(listing([]));

  assert.equal(view.mode, 'checkpoints');
  assert.deepEqual(view.checkpoints, []);
  assert.equal(view.body, 'No checkpoints yet.');
});

test('a truncated listing is flagged for the card', () => {
  const view = buildToolView(listing([GROUPS[0]], { limits: { truncated: true } }));
  assert.equal(view.truncated, true);

  const totalOnly = buildToolView({
    ...listing([GROUPS[0]]),
    toolResponse: { ...listing([GROUPS[0]]).toolResponse, data: { groups: [GROUPS[0]], count: 1, total_groups: 24 } },
  });
  assert.equal(totalOnly.truncated, true);
});

test('a failed listing shows the backend message instead of rows', () => {
  const view = buildToolView({
    toolName: 'list_checkpoints',
    status: 'failed',
    toolResponse: {
      status: 'error',
      result_state: 'blocked',
      summary: 'List checkpoints request is invalid.',
      error: { code: 'blocked', message: 'Listing this checkpoint requires reading an external path.' },
    },
  });

  assert.equal(view.mode, 'checkpoints');
  assert.equal(view.failed, true);
  assert.deepEqual(view.checkpoints, []);
  assert.match(view.failureText, /requires reading an external path/);
  assert.equal(view.body, view.failureText);
});

test('the row label stays a verb while the call is still running', () => {
  const view = buildToolView({ toolName: 'list_checkpoints', status: 'running', toolInput: {} });
  assert.equal(view.label, 'Listing checkpoints');
  assert.deepEqual(view.checkpoints, []);
});

test('missing structured data falls back to the JSON tool card', () => {
  const view = buildToolView({ toolName: 'list_checkpoints', status: 'done', toolOutput: 'legacy output' });
  assert.equal(view.mode, 'json');
  assert.match(view.responseJson, /legacy output/);
});

test('rollback_workspace keeps its execution-shaped json card', () => {
  const view = buildToolView({
    toolName: 'rollback_workspace',
    status: 'done',
    toolInput: { task_id: 'task-1', dry_run: true },
    toolResponse: { status: 'ok', data: { safe: true, would_restore: ['a.py'], would_delete: [], conflicts: [] } },
  });

  assert.equal(view.mode, 'json');
});

test('checkpoint time formats tolerate junk', () => {
  assert.equal(formatCheckpointTime(''), '');
  assert.equal(formatCheckpointTime('not-a-date'), '');
  const stamp = new Date();
  stamp.setHours(4, 5, 0, 0);
  assert.equal(formatCheckpointTime(stamp.toISOString()), '04:05');
});
