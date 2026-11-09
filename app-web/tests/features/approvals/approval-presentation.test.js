// 审批卡片的展示派生与决策分发：直接调用 model/api 的公开函数做输入输出断言。
// 这两块原先靠 ApprovalOverlay.jsx 的源码文本断言守着（改个写法就红、行为没变也红），
// 现在换成行为断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RISK_TEXT,
  approvalBusyText,
  approvalTitle,
  requestPreview,
  riskTextFor,
  runtimeDependency,
  runtimeOperation,
  runtimeSummary,
  selectRuntimeRequest,
} from '../../../src/features/approvals/model/approval-presentation.js';

const browserInstall = (extra = {}) => ({ request_id: 'browser', type: 'browser_runtime_install_required', ...extra });
const computerInstall = (extra = {}) => ({ request_id: 'computer', type: 'computer_runtime_install_required', ...extra });

test('runtime selection prefers the exact tool call id', () => {
  const first = { ...browserInstall(), conversation_id: 'c1', task_id: 't1', tool_call_id: 'call-1' };
  const second = { ...browserInstall(), conversation_id: 'c1', task_id: 't1', tool_call_id: 'call-2' };
  const options = { toolName: 'browser_use', callId: 'call-2', status: 'done', conversationId: 'c1', taskId: 't1' };
  assert.equal(selectRuntimeRequest([first, second], options), second);
  // 没有匹配到精确 id 时退回「唯一且活跃」规则：两条请求时就不挂。
  assert.equal(selectRuntimeRequest([first, second], { ...options, callId: 'CALL-2' }), null);
});

test('runtime selection falls back only for one active request in scope', () => {
  const request = { ...browserInstall(), conversation_id: 'c1', task_id: 't1' };
  const remapped = { toolName: 'browser_use', callId: 'remapped-id', conversationId: 'c1', taskId: 't1' };
  assert.equal(selectRuntimeRequest([request], { ...remapped, status: 'pending' }), request);
  assert.equal(selectRuntimeRequest([request], { ...remapped, status: 'running' }), request);
  assert.equal(selectRuntimeRequest([request], { ...remapped, status: 'done' }), null);
  assert.equal(selectRuntimeRequest([request], { ...remapped, status: '' }), null);
});

test('runtime selection never attaches across conversations or tasks', () => {
  const otherConversation = { ...browserInstall(), conversation_id: 'c2', task_id: 't1' };
  const otherTask = { ...browserInstall(), conversation_id: 'c1', task_id: 't2' };
  const options = { toolName: 'browser_use', status: 'running', conversationId: 'c1', taskId: 't1' };
  assert.equal(selectRuntimeRequest([otherConversation], options), null);
  assert.equal(selectRuntimeRequest([otherTask], options), null);
  // 不带归属的请求没有可比对的会话，仍然跟随唯一运行时工具的挂载点。
  assert.equal(selectRuntimeRequest([browserInstall()], options)?.request_id, 'browser');
});

test('runtime selection keeps browser and computer kinds apart', () => {
  const browser = { ...browserInstall(), tool_call_id: 'call-1' };
  const computer = { ...computerInstall(), tool_call_id: 'call-1' };
  const options = { callId: 'call-1', status: 'pending' };
  assert.equal(selectRuntimeRequest([browser], { ...options, toolName: 'computer_use' }), null);
  assert.equal(selectRuntimeRequest([computer], { ...options, toolName: 'browser_use' }), null);
  assert.equal(selectRuntimeRequest([computer], { ...options, toolName: 'computer_use' }), computer);
  // 工具名大小写不敏感，非运行时工具永远不挂。
  assert.equal(selectRuntimeRequest([browser], { ...options, toolName: 'Browser_Use' }), browser);
  assert.equal(selectRuntimeRequest([browser], { ...options, toolName: 'write_file' }), null);
  assert.equal(selectRuntimeRequest([{ request_id: 'tool', tool_name: 'read_file' }], { ...options, toolName: 'browser_use' }), null);
});

test('runtime selection tolerates missing request lists', () => {
  assert.equal(selectRuntimeRequest([], { toolName: 'browser_use', status: 'pending' }), null);
  assert.equal(selectRuntimeRequest(undefined, { toolName: 'browser_use', status: 'pending' }), null);
  // 选项整块缺省时等同于全部为空：只有没有归属过滤的请求会命中。
  assert.equal(selectRuntimeRequest([browserInstall()]), null);
});

test('every risk code maps to its own copy', () => {
  const expected = {
    destructive_file_delete: 'Recursive file or directory deletion',
    destructive_git_reset_hard: 'Hard git reset that may discard commits',
    destructive_git_checkout: 'Git branch switch or worktree restore',
    destructive_git_clean: 'Git cleanup of untracked files',
    privilege_escalation: 'Run with root privileges',
    network_egress_terminal: 'Terminal command initiates outbound network access',
    remote_data_transfer: 'Remote data transfer',
    permission_mutation: 'File permission or owner change',
    external_process_kill: 'Force-kill external process',
    system_storage_mutation: 'System-level storage mutation',
    container_runtime: 'Container runtime operation',
    shell_string_execution: 'Inline shell script execution',
    python_inline_execution: 'Inline Python script execution',
    node_inline_execution: 'Inline Node.js script execution',
    remote_write: 'Push to remote repository',
    force_push_protected: 'Force-push to protected branch',
    destroy_root: 'Recursive deletion of root directory',
    destroy_home: 'Recursive deletion of HOME directory',
    destroy_dot_git: 'Delete .git directory',
    pipe_to_shell: 'Pipe remote script directly to shell',
    dd_to_device: 'Write to raw device',
    write_system_root: 'Write to system path',
    write_outside_workspace: 'Write outside workspace',
    command_outside_workspace: 'Run command outside workspace',
    sensitive_path_write: 'Write to sensitive file',
    mcp_server_activation: 'Activate MCP server',
    strict_mode_default: 'Strict mode requires approval by default',
  };
  assert.deepEqual(RISK_TEXT, expected);
  for (const [code, text] of Object.entries(expected)) {
    assert.equal(riskTextFor({ risk_code: code }), text, code);
  }
});

test('unknown or missing risk codes fall back to the raw code', () => {
  assert.equal(riskTextFor({ risk_code: 'made_up_code' }), 'made_up_code');
  assert.equal(riskTextFor({}), 'Unclassified risk');
});

test('runtime operation defaults to install and only replace is special', () => {
  assert.equal(runtimeOperation({}), 'install');
  assert.equal(runtimeOperation({ remediation: { operation: 'replace' } }), 'replace');
  assert.equal(runtimeOperation({ remediation: { operation: 'install' } }), 'install');
});

test('runtime dependency prefers the request diagnostic and then its error diagnostic', () => {
  assert.equal(runtimeDependency({ diagnostic: { dependency: 'chromium' } }, 'browser runtime'), 'chromium');
  assert.equal(runtimeDependency({ error: { diagnostic: { dependency: 'cua-driver' } } }, 'browser runtime'), 'cua-driver');
  assert.equal(
    runtimeDependency({ diagnostic: { dependency: 'chromium' }, error: { diagnostic: { dependency: 'other' } } }, 'fallback'),
    'chromium',
  );
  assert.equal(runtimeDependency({}, 'browser runtime'), 'browser runtime');
});

test('runtime summary explains each computer and browser operation', () => {
  assert.equal(runtimeSummary(computerInstall()), 'Computer runtime is missing. Install it to continue.');
  assert.equal(
    runtimeSummary(computerInstall({ remediation: { operation: 'replace' } })),
    'The shared Computer Runtime is incompatible. Replace it with the required version to continue.',
  );
  assert.equal(
    runtimeSummary(browserInstall({ remediation: { operation: 'replace' }, diagnostic: { dependency: 'chromium' } })),
    'The Browser Runtime is incompatible. Replace it with the required version to continue.',
  );
  assert.equal(
    runtimeSummary(browserInstall({ diagnostic: { dependency: 'chromium 120' } })),
    'Browser runtime is missing. Install it to continue.',
  );
  assert.equal(
    runtimeSummary(browserInstall({ error: { diagnostic: { dependency: 'chromium headless' } } })),
    'Browser runtime is missing. Install it to continue.',
  );
  // action 形式同样被识别，且非 chromium 依赖走「依赖缺失」文案。
  assert.equal(
    runtimeSummary({ action: 'install_browser_runtime', diagnostic: { dependency: 'playwright' } }),
    'Browser runtime dependency is missing. Install it to continue.',
  );
  assert.equal(runtimeSummary(browserInstall()), 'Browser runtime dependency is missing. Install it to continue.');
});

test('request preview follows the request kind', () => {
  assert.equal(requestPreview(computerInstall()), runtimeSummary(computerInstall()));
  assert.equal(
    requestPreview({ approval_kind: 'workflow_human_approval', summaryText: 'Needs review', title: 'Ignored' }),
    'Needs review',
  );
  assert.equal(requestPreview({ approval_kind: 'workflow_human_approval', title: 'Only title' }), 'Only title');
  assert.equal(requestPreview({ approval_kind: 'workflow_human_approval' }), '');
  assert.equal(requestPreview({ tool_name: 'exec_command', raw_command: 'rm -rf build' }), 'rm -rf build');
  assert.equal(requestPreview({ tool_name: 'read_file' }), '');
});

test('approval titles name the runtime kind and whether it is replaced', () => {
  assert.equal(approvalTitle(browserInstall()), 'Browser Runtime Required');
  assert.equal(approvalTitle(browserInstall({ remediation: { operation: 'replace' } })), 'Browser Runtime Replacement Required');
  assert.equal(approvalTitle(computerInstall()), 'Computer Runtime Required');
  assert.equal(approvalTitle(computerInstall({ remediation: { operation: 'replace' } })), 'Computer Runtime Replacement Required');
  assert.equal(approvalTitle({ tool_name: 'exec_command' }), 'Approval Required');
  // 同时命中两种 kind 时 Computer 优先。
  assert.equal(
    approvalTitle({ ...browserInstall(), action: 'install_computer_runtime' }),
    'Computer Runtime Required',
  );
});

test('busy copy names the runtime and the pending decision', () => {
  assert.equal(approvalBusyText(browserInstall(), 'install'), 'Installing browser runtime...');
  assert.equal(
    approvalBusyText(browserInstall({ remediation: { operation: 'replace' } }), 'install'),
    'Replacing browser runtime...',
  );
  assert.equal(approvalBusyText(browserInstall(), 'deny'), 'Keeping the current browser runtime...');
  assert.equal(approvalBusyText(computerInstall(), 'install'), 'Installing computer runtime...');
  assert.equal(
    approvalBusyText(computerInstall({ remediation: { operation: 'replace' } }), 'install'),
    'Replacing computer runtime...',
  );
  assert.equal(approvalBusyText(computerInstall(), 'deny'), 'Keeping the current computer runtime...');
  const tool = { request_id: 'tool', tool_name: 'exec_command' };
  assert.equal(approvalBusyText(tool, 'deny'), 'Denying request...');
  assert.equal(approvalBusyText(tool, 'allow_always'), 'Approving and saving rule...');
  assert.equal(approvalBusyText(tool, 'allow_once'), 'Approving this request...');
  assert.equal(approvalBusyText(tool, ''), 'Resolving approval...');
});

test('decision dispatch picks the bridge kind and drops the request only on success', async (t) => {
  const originalWindow = globalThis.window;
  const calls = [];
  let emit;
  globalThis.window = {
    haish: {
      onApprovalEvent(callback) {
        emit = callback;
        return () => {};
      },
      async resolveApproval(...args) {
        if (args[1] === 'exploding') throw new Error('bridge is offline');
        calls.push(args);
      },
    },
  };
  t.after(() => {
    globalThis.window = originalWindow;
  });

  const { approvalStore } = await import('../../../src/core/approval-store.js');
  const { resolveApprovalDecision } = await import('../../../src/features/approvals/api/approvals.js');
  t.after(() => approvalStore.dispose());
  approvalStore.start();

  const pending = [];
  approvalStore.subscribe((next) => {
    pending.length = 0;
    pending.push(...next.map((request) => request.request_id));
  });
  emit({
    type: 'approval_snapshot',
    state: {
      pending: [{ request_id: 'tool-1', tool_name: 'exec_command' }],
      pending_workflow_approvals: [],
      pending_browser_runtime_installs: [{ request_id: 'browser-1', type: 'browser_runtime_install_required' }],
      pending_computer_runtime_installs: [{ request_id: 'computer-1', type: 'computer_runtime_install_required' }],
    },
  });

  await resolveApprovalDecision({ request_id: 'tool-1', tool_name: 'exec_command' }, 'allow_once');
  await resolveApprovalDecision({ request_id: 'browser-1', type: 'browser_runtime_install_required' }, 'install');
  await resolveApprovalDecision({ request_id: 'computer-1', type: 'computer_runtime_install_required' }, 'deny');

  assert.deepEqual(calls, [
    ['tool', 'tool-1', { decision: 'allow_once' }],
    ['browser_runtime', 'browser-1', { decision: 'install', timeout_seconds: 900 }],
    ['computer_runtime', 'computer-1', { decision: 'deny' }],
  ]);
  // 成功即乐观移除；失败时请求必须留在列表里，组件才有机会显示错误并重试。
  assert.deepEqual(pending, []);
  emit({
    type: 'approval_snapshot',
    state: {
      pending: [{ request_id: 'exploding', tool_name: 'exec_command' }],
      pending_workflow_approvals: [],
      pending_browser_runtime_installs: [],
      pending_computer_runtime_installs: [],
    },
  });
  await assert.rejects(
    () => resolveApprovalDecision({ request_id: 'exploding', tool_name: 'exec_command' }, 'allow_once'),
    /bridge is offline/,
  );
  assert.deepEqual(pending, ['exploding']);
});
