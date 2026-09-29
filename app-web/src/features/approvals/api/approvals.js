export async function postApprovalDecision(requestId, decision) {
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

export async function postBrowserRuntimeDecision(request, decision) {
  await postRuntimeDecision('browser_runtime', request, decision);
}

export async function postComputerRuntimeDecision(request, decision) {
  await postRuntimeDecision('computer_runtime', request, decision);
}
