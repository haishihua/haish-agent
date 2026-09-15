import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mainSource = fs.readFileSync(new URL('../../../src/main/main.ts', import.meta.url), 'utf8');
const preloadSource = fs.readFileSync(new URL('../../../src/preload/preload.ts', import.meta.url), 'utf8');
const taskSource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);
const approvalSource = fs.readFileSync(
  new URL('../../src/features/approvals/model/approval-store.js', import.meta.url),
  'utf8',
);
const runtimeRequirementsSource = fs.readFileSync(
  new URL('../../../scripts/runtime-requirements.lock', import.meta.url),
  'utf8',
);
const runtimeBuildSource = fs.readFileSync(
  new URL('../../../scripts/build-runtime.mjs', import.meta.url),
  'utf8',
);

test('desktop realtime traffic uses one main-process WebSocket and renderer IPC', () => {
  assert.equal((mainSource.match(/new WebSocket\(/g) || []).length, 1);
  assert.match(mainSource, /ipcMain\.handle\('runtime:command'/);
  assert.match(mainSource, /type: 'approval\.snapshot'/);
  assert.match(preloadSource, /ipcRenderer\.invoke\('runtime:command'/);
  assert.match(taskSource, /runTaskStream\(command/);
  assert.doesNotMatch(taskSource, /tasks\/stream|rerun\/stream|edit-and-resend\/stream/);
  assert.match(approvalSource, /onApprovalEvent/);
  assert.doesNotMatch(approvalSource, /EventSource/);
  assert.match(runtimeRequirementsSource, /^websockets==/m);
  assert.match(runtimeBuildSource, /'--collect-submodules',\s*'websockets'/);
  assert.match(runtimeBuildSource, /Bundled WebSocket runtime is missing/);
});
