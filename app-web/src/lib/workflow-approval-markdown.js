// @haish-esm
export function normalizeWorkflowApprovalMarkdown(source) {
  return String(source || '').replace(/[;；]\s*(?=\d{1,3}(?:[.)、．）])\s)/g, '\n');
}
