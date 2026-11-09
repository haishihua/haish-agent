// 审批卡片的纯展示派生：运行时摘要、风险文案、卡片标题、决策中的进度文案和
// 运行时请求选择。这里只做「输入对象 → 字符串/对象」的推导，不碰 React、不碰 DOM，
// node 测试可以直接 import 调用；busy/error 这类和组件 state 绑定的形状留在组件里。
import {
  isBrowserRuntimeRequest,
  isComputerRuntimeRequest,
  isRuntimeRequest,
  isWorkflowApprovalRequest,
} from '../../../core/approval-store.js';

export function runtimeDependency(request, fallback) {
  return request?.diagnostic?.dependency || request?.error?.diagnostic?.dependency || fallback;
}

export function runtimeOperation(request) {
  return request?.remediation?.operation === 'replace' ? 'replace' : 'install';
}

export function runtimeSummary(request) {
  const replacing = runtimeOperation(request) === 'replace';
  if (isComputerRuntimeRequest(request)) {
    return replacing
      ? 'The shared Computer Runtime is incompatible. Replace it with the required version to continue.'
      : 'Computer runtime is missing. Install it to continue.';
  }
  if (replacing) return 'The Browser Runtime is incompatible. Replace it with the required version to continue.';
  const dependency = runtimeDependency(request, 'browser runtime');
  if (String(dependency).includes('chromium')) return 'Browser runtime is missing. Install it to continue.';
  return 'Browser runtime dependency is missing. Install it to continue.';
}

export function requestPreview(request) {
  if (isRuntimeRequest(request)) return runtimeSummary(request);
  if (isWorkflowApprovalRequest(request)) return String(request.summaryText || request.title || '');
  return request.raw_command || '';
}

export const RISK_TEXT = {
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

export function riskTextFor(request) {
  return RISK_TEXT[request.risk_code] || request.risk_code || 'Unclassified risk';
}

// Computer 分支先于 Browser：同时命中两种 kind 时（例如 type 是 browser 但
// action 是 install_computer_runtime）也必须走 Computer 文案。
export function approvalTitle(request) {
  const replacing = isRuntimeRequest(request) && runtimeOperation(request) === 'replace';
  if (isComputerRuntimeRequest(request)) {
    return replacing ? 'Computer Runtime Replacement Required' : 'Computer Runtime Required';
  }
  if (isBrowserRuntimeRequest(request)) {
    return replacing ? 'Browser Runtime Replacement Required' : 'Browser Runtime Required';
  }
  return 'Approval Required';
}

export function approvalBusyText(request, busyDecision) {
  if (isRuntimeRequest(request)) {
    const runtimeLabel = isComputerRuntimeRequest(request) ? 'computer' : 'browser';
    if (busyDecision === 'deny') return `Keeping the current ${runtimeLabel} runtime...`;
    if (runtimeOperation(request) === 'replace') return `Replacing ${runtimeLabel} runtime...`;
    return `Installing ${runtimeLabel} runtime...`;
  }
  if (busyDecision === 'deny') return 'Denying request...';
  if (busyDecision === 'allow_always') return 'Approving and saving rule...';
  if (busyDecision === 'allow_once') return 'Approving this request...';
  return 'Resolving approval...';
}

function runtimeRequestMatchesTool(request, toolName) {
  const normalized = String(toolName || '').toLowerCase();
  if (normalized === 'browser_use') return isBrowserRuntimeRequest(request);
  if (normalized === 'computer_use') return isComputerRuntimeRequest(request);
  return false;
}

// 后端在工作流流里会重映射工具调用 id：先认精确 id；认不出来时，只允许同一
// 会话/任务里唯一一条、且工具还在运行的请求挂上去。
export function selectRuntimeRequest(
  requests,
  { toolName = '', callId = '', status = '', conversationId = '', taskId = '' } = {},
) {
  const scoped = (Array.isArray(requests) ? requests : []).filter(
    (request) =>
      runtimeRequestMatchesTool(request, toolName) &&
      (!request.conversation_id || !conversationId || request.conversation_id === conversationId) &&
      (!request.task_id || !taskId || request.task_id === taskId),
  );
  if (!scoped.length) return null;
  if (callId) {
    const exact = scoped.find((request) => request.tool_call_id && request.tool_call_id === callId);
    if (exact) return exact;
  }
  const isActive = status === 'pending' || status === 'running';
  if (!isActive || scoped.length !== 1) return null;
  return scoped[0];
}
