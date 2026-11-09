import { approvalStore, isBrowserRuntimeRequest, isComputerRuntimeRequest } from '../../../core/approval-store.js';

async function postApprovalDecision(requestId, decision) {
  await window.haish.resolveApproval('tool', requestId, { decision });
}

export async function postWorkflowApprovalDecision(requestId, decision, feedback = '') {
  await window.haish.resolveApproval('workflow', requestId, { decision, feedback });
}

async function postRuntimeDecision(kind, request, decision) {
  await window.haish.resolveApproval(kind, request.request_id, {
    decision: decision === 'deny' ? 'deny' : 'install',
    ...(decision === 'deny' ? {} : { timeout_seconds: 900 }),
  });
}

async function postBrowserRuntimeDecision(request, decision) {
  await postRuntimeDecision('browser_runtime', request, decision);
}

export async function postComputerRuntimeDecision(request, decision) {
  await postRuntimeDecision('computer_runtime', request, decision);
}

// 两张卡片原本各写一遍同样的三分支阶梯：选接口 + 成功后从本地 store 移除。
// 只收这两步；busy/error 的 setState 留在组件里，state 形状不变。
export async function resolveApprovalDecision(request, decision) {
  if (isBrowserRuntimeRequest(request)) await postBrowserRuntimeDecision(request, decision);
  else if (isComputerRuntimeRequest(request)) await postComputerRuntimeDecision(request, decision);
  else await postApprovalDecision(request.request_id, decision);
  // 成功即乐观移除；流里的终态事件随后还会再删一次（幂等）。
  approvalStore.remove(request.request_id);
}
