export async function postApprovalDecision(requestId, decision) {
  await window.haish.resolveApproval('tool', requestId, { decision });
}

export async function postWorkflowApprovalDecision(requestId, decision, feedback = '') {
  await window.haish.resolveApproval('workflow', requestId, { decision, feedback });
}

export async function postBrowserRuntimeDecision(request, decision) {
  await window.haish.resolveApproval('browser_runtime', request.request_id, {
    decision: decision === 'deny' ? 'deny' : 'install',
    ...(decision === 'deny' ? {} : { timeout_seconds: 900 }),
  });
}
