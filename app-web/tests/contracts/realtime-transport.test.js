import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { taskStreamHandlerSource } from '../helpers/handler-source.js';

const mainSource = fs.readFileSync(new URL('../../../src/main/main.ts', import.meta.url), 'utf8');
const realtimeSource = fs.readFileSync(new URL('../../../src/main/realtime-client.ts', import.meta.url), 'utf8');
const preloadSource = fs.readFileSync(new URL('../../../src/preload/preload.ts', import.meta.url), 'utf8');
const taskSource = taskStreamHandlerSource();
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
  assert.equal((realtimeSource.match(/new WebSocket\(/g) || []).length, 1);
  // main.ts 自己不能再开第二条 socket。
  assert.equal((mainSource.match(/new WebSocket\(/g) || []).length, 0);
  assert.match(mainSource, /ipcMain\.handle\('runtime:command'/);
  assert.match(realtimeSource, /type: 'approval\.snapshot'/);
  assert.match(preloadSource, /ipcRenderer\.invoke\('runtime:command'/);
  assert.match(taskSource, /runTaskStream\(command/);
  assert.doesNotMatch(taskSource, /tasks\/stream|rerun\/stream|edit-and-resend\/stream/);
  assert.match(approvalSource, /onApprovalEvent/);
  assert.doesNotMatch(approvalSource, /EventSource/);
  assert.match(runtimeRequirementsSource, /^websockets==/m);
  assert.match(runtimeBuildSource, /'--collect-submodules',\s*'websockets'/);
  assert.match(runtimeBuildSource, /Bundled WebSocket runtime is missing/);
});

// 背压丢事件（resync_required）与断线重挂（task.attach）都挤在同一条直播通道上：
// 中间层不能按 type 白名单丢消息，也不能把一次 socket 抖动当任务失败。
test('unknown realtime message types reach the renderer that owns the request', () => {
  const handler = realtimeSource.slice(
    realtimeSource.indexOf('function handleRealtimeMessage('),
    realtimeSource.indexOf('async function ensureRealtimeSocket('),
  );
  assert.match(handler, /const fallbackOwner = realtimeTaskOwners\.get\(requestId\);/);
  assert.match(handler, /sendToWebContents\(fallbackOwner\.ownerId, 'runtime:task-message', message\)/);
  // task.end 依旧是取消登记的唯一出口；未知消息不能顺手把登记删了。
  assert.match(handler, /if \(message\.type === 'task\.end'\) \{\s*\n\s*realtimeTaskOwners\.delete\(requestId\);/);
});

test('a dropped socket keeps live tasks and re-attaches them on reconnect', () => {
  const disconnect = realtimeSource.slice(
    realtimeSource.indexOf('function failRealtimeConnection('),
    realtimeSource.indexOf('function rememberRealtimeTaskId('),
  );
  // 断线不合成 task.error、不清登记：任务在服务端继续跑。
  assert.doesNotMatch(disconnect, /'task\.error'/);
  assert.doesNotMatch(disconnect, /realtimeTaskOwners\.clear\(\)/);
  assert.match(disconnect, /realtimeCommandWaiters\.clear\(\)/);

  const reattach = realtimeSource.slice(
    realtimeSource.indexOf('function reattachRunningTaskStreams('),
    realtimeSource.indexOf('function scheduleRealtimeReconnect('),
  );
  assert.match(reattach, /type: 'task\.attach'/);
  assert.match(reattach, /request_id: requestId/);
  assert.match(reattach, /task_id: owner\.taskId/);
  assert.match(reattach, /after_event_id: null/);
  // 先清空再逐条重挂：同一次重连里一个 requestId 只能有一条直播流。
  assert.ok(
    reattach.indexOf('realtimeTaskOwners.clear()') < reattach.indexOf('realtimeTaskOwners.set(requestId, owner)'),
    're-attach must clear the old requestId→owner mapping before re-registering',
  );
  assert.match(realtimeSource, /reattachRunningTaskStreams\(socket\)/);
});

test('resync_required is forwarded as a control message and never applied as a task event', () => {
  assert.match(preloadSource, /message\.type === 'resync_required'/);
  assert.match(preloadSource, /onEvent\(\{ \.\.\.message \}\)/);
  assert.match(taskSource, /RESYNC_REQUIRED_TYPE = 'resync_required'/);
  const stream = taskSource.slice(
    taskSource.indexOf('await runTaskStream(command, (event) => {'),
    taskSource.indexOf('const normalized = normalizeRuntimeEvent(event);'),
  );
  assert.match(stream, /void resyncTaskRuntimeAfterBackpressure\(/, 'resync must not fall into the task-event pipeline');
  assert.match(stream, /\breturn;/);
  // 恢复路径本身不能把背压提示当错误弹给用户。
  // 补齐逻辑在 task-stream/recovery.js 的工厂里：只取这个工厂体（结束标记也只看该文件）。
  const recoverySource = fs.readFileSync(
    new URL('../../src/features/tasks/hooks/task-stream/recovery.js', import.meta.url),
    'utf8',
  );
  const resyncStart = recoverySource.indexOf('export function createBackpressureRecovery');
  assert.ok(resyncStart >= 0, 'the backpressure recovery module must exist');
  const nextExport = recoverySource.indexOf('\nexport function ', resyncStart + 1);
  const resync = recoverySource.slice(resyncStart, nextExport === -1 ? recoverySource.length : nextExport);
  assert.ok(
    resync.trimEnd().endsWith('}'),
    'the backpressure recovery factory body must be closed (losing the end marker would swallow the rest of the file)',
  );
  assert.doesNotMatch(resync, /showToast/);
  assert.match(resync, /restoreLatestTaskRuntime\(/, 'the no-local-copy case reuses the ordinary restore path');
  assert.match(resync, /fetchTaskRuntimeDetail\(/, 'a live task only refetches its missed events');
});
