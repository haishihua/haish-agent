// @haish-esm
export function normalizeWorkflowApprovalMarkdown(source) {
  return String(source || '').replace(/[;；]\s*(?=\d{1,3}(?:[.)、．）])\s)/g, '\n');
}

export function workflowApprovalInput(value, depth = 0) {
  if (depth > 3) return {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.summaryText != null) return value;
    const nested = workflowApprovalInput(value.message, depth + 1);
    return Object.keys(nested).length ? { ...nested, title: nested.title || value.title } : value;
  }
  if (typeof value !== 'string') return {};
  try {
    return workflowApprovalInput(JSON.parse(value), depth + 1);
  } catch {
    return {};
  }
}
