import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';

// 项目改名：双击项目行 → 改名对话框 → PATCH /api/projects/<id>。
// 这里驱动生产 handler，只把 apiFetch / setWorkspaceState 换成替身。
function createHarness({ ok = true, status = 200, payload = {} } = {}) {
  const requests = [];
  let state = {
    activeProjectId: 'project-custom',
    activeConversationId: null,
    projects: [
      {
        id: 'project-custom',
        type: 'custom',
        executionMode: 'chat',
        name: 'haish-agent',
        workspaceLabel: 'haish-agent',
        conversations: [],
      },
      {
        id: 'default-project-chat',
        type: 'system',
        executionMode: 'chat',
        name: 'Default project',
        workspaceLabel: null,
        conversations: [],
      },
    ],
  };
  const handlers = createConversationHandlers({
    API_BASE: 'http://runtime',
    apiFetch: async (url, options) => {
      requests.push({ url, options });
      return { ok, status, json: async () => payload };
    },
    buildApiHeaders: () => ({ 'content-type': 'application/json' }),
    setWorkspaceState: (updater) => {
      state = typeof updater === 'function' ? updater(state) : updater;
    },
  });
  const project = (id) => state.projects.find((item) => item.id === id);
  return { handlers, requests, project };
}

test('project rename patches the project and keeps only the settled name', async () => {
  const harness = createHarness({ payload: { name: '我的项目' } });

  await harness.handlers.handleRenameProject('project-custom', '  haish-agent  ');

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, 'http://runtime/api/projects/project-custom');
  assert.equal(harness.requests[0].options.method, 'PATCH');
  // 两端空白在发请求前就 trim 掉，服务端存到的就是这个人打进去的名字。
  assert.deepEqual(JSON.parse(harness.requests[0].options.body), { name: 'haish-agent' });
  // 名字回写以服务端落定的值为准（服务端空名会保留旧名），workspaceLabel 跟着走。
  assert.equal(harness.project('project-custom').name, '我的项目');
  assert.equal(harness.project('project-custom').workspaceLabel, '我的项目');
});

test('a blank project name never reaches the backend', async () => {
  const harness = createHarness();

  await harness.handlers.handleRenameProject('project-custom', '   ');

  assert.deepEqual(harness.requests, []);
  assert.equal(harness.project('project-custom').name, 'haish-agent');
});

test('a rejected rename surfaces the failure and leaves the sidebar name alone', async () => {
  const harness = createHarness({ ok: false, status: 500 });

  await assert.rejects(
    () => harness.handlers.handleRenameProject('project-custom', '新名字'),
    /project rename failed: 500/,
  );

  assert.equal(harness.project('project-custom').name, 'haish-agent');
  assert.equal(harness.project('project-custom').workspaceLabel, 'haish-agent');
});

test('renaming a system project never invents a workspace label', async () => {
  const harness = createHarness({ payload: { name: '工作台' } });

  await harness.handlers.handleRenameProject('default-project-chat', '工作台');

  assert.equal(harness.project('default-project-chat').name, '工作台');
  assert.equal(harness.project('default-project-chat').workspaceLabel, null);
  // 另一个项目不受影响。
  assert.equal(harness.project('project-custom').name, 'haish-agent');
});

test('the double-click rename gesture is wired from the row to the handler', () => {
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const projectNode = read('../../../src/features/conversations/components/ProjectNode.jsx');
  const panel = read('../../../src/features/conversations/components/ConversationsPanel.jsx');
  const appShell = read('../../../src/features/app/AppShell.jsx');

  const dblClickStart = projectNode.indexOf('onDoubleClick={');
  const dblClickBlock = projectNode.slice(dblClickStart, projectNode.indexOf('onKeyDown={', dblClickStart));
  assert.match(dblClickBlock, /onRequestRenameProject\?\.\(project\)/);
  // 展开折叠图标、pin / 新建 / 删除按钮上的双击不算改名（那些控件在自己的点击处理里）。
  assert.ok(dblClickBlock.includes('.project-icon-toggle'), dblClickBlock);
  assert.ok(dblClickBlock.includes('.conversation-actions'), dblClickBlock);

  assert.match(panel, /title: 'Rename project'/);
  assert.match(panel, /onConfirm: \(nextName\) => onRenameProject\(project\.id, nextName\)/);
  assert.match(panel, /onRequestRenameProject=\{requestRenameProject\}/);
  assert.match(appShell, /onRenameProject=\{handleRenameProject\}/);
  assert.match(appShell, /\bhandleRenameProject,/);
});
