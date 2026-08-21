import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normalizeWorkflowApprovalMarkdown,
  workflowApprovalInput,
} from './workflow-approval-markdown.js';

const editorSource = fs.readFileSync(
  new URL('../features/settings/WorkflowConfigEditor.jsx', import.meta.url),
  'utf8',
);
const overlaySource = fs.readFileSync(new URL('../approval-overlay.jsx', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(
  new URL('../features/workflow/WorkflowRuntimePage.jsx', import.meta.url),
  'utf8',
);

test('workflow editor exposes a configurable human approval node', () => {
  assert.match(editorSource, /human_approval: \{ icon: 'workflow-approval' \}/);
  assert.match(editorSource, /baseType === 'human_approval'/);
  assert.match(editorSource, /selectedNode\.type === 'human_approval'/);
  assert.match(editorSource, /summaryText: '\{\{input\.message\}\}'/);
  assert.match(editorSource, /title="Review content"/);
  assert.match(editorSource, /<WorkflowOutputContract node=\{selectedNode\} \/>/);
});

test('workflow approval card submits to its own endpoint and requires rejection feedback', () => {
  assert.match(overlaySource, /\/api\/workflow-approvals\/\$\{encodeURIComponent\(requestId\)\}\/resolve/);
  assert.match(overlaySource, /approval_kind === 'workflow_human_approval'/);
  assert.match(overlaySource, /disabled=\{!feedback\.trim\(\)\}/);
  assert.match(overlaySource, /onDecide\('reject', feedback\)/);
  assert.match(overlaySource, /request\.feedback \? <p>\{request\.feedback\}<\/p>/);
  assert.match(overlaySource, /pending_workflow_approvals/);
  assert.match(overlaySource, /<Markdown source=\{summaryText\} \/>/);
  assert.match(runtimeSource, /const reviewedInput = workflowApprovalInput\(inputValue\);/);
  assert.match(overlaySource, />\s*Next\s*<\/button>/);
  assert.match(overlaySource, />\s*Back\s*<\/button>/);
  assert.match(overlaySource, /required when going back/);
  assert.match(overlaySource, /className="haish-approval-btn haish-approval-btn-always"[\s\S]*?onDecide\('reject', feedback\)[\s\S]*?>\s*Back/);
  assert.doesNotMatch(overlaySource, /workflowApprovalPayloadText|>Context<|request\.payload/);
  assert.doesNotMatch(
    overlaySource,
    /function WorkflowApprovalCard[\s\S]*?<span className="haish-approval-icon"/,
  );
});

test('workflow approval nodes reuse the approval card without a duplicate assistant message', () => {
  assert.match(runtimeSource, /if \(node\.type === 'human_approval'\)/);
  assert.match(runtimeSource, /<WorkflowApprovalInline/);
  assert.match(runtimeSource, /allowLiveRequest=\{showApproval\}/);
  assert.match(runtimeSource, /resolvedRequest=\{resolvedRequest\}/);
  assert.match(runtimeSource, /onRetry=\{onRetry\}/);
  assert.match(runtimeSource, /createdAt=\{createdAt\}/);
  assert.match(runtimeSource, /completedAt=\{completedAt\}/);
  assert.match(overlaySource, /const activeRequest = allowLiveRequest \? request : null/);
  assert.match(overlaySource, /className="chat-bubble-clock"/);
  assert.match(overlaySource, /aria-label=\{copied \? 'Copied' : 'Copy message'\}/);
  assert.match(overlaySource, /aria-label="ReRun this node"/);
  assert.match(overlaySource, /!isWorkflowApprovalRequest\(request\)/);
  assert.match(overlaySource, /resolved=\{!activeRequest\}/);
  assert.match(overlaySource, /key=\{displayRequest\.request_id\}/);
  assert.match(overlaySource, /setBusy\(''\);\s*approvalStore\.remove\(requestId\)/);
  assert.match(runtimeSource, /runStatus === 'waiting_approval'/);
  assert.doesNotMatch(runtimeSource, /if \(node\.type === 'human_approval'\) \{\s*return showApproval/);
});

test('inline numbered approval items become a real markdown list', () => {
  assert.equal(
    normalizeWorkflowApprovalMarkdown('1. First；2. Second; 3. Third, version 2.0 stays inline'),
    '1. First\n2. Second\n3. Third, version 2.0 stays inline',
  );
});

test('persisted approval JSON renders its summary instead of the raw payload', () => {
  assert.deepEqual(
    workflowApprovalInput('{"summaryText":"Rendered summary","title":"Review"}'),
    { summaryText: 'Rendered summary', title: 'Review' },
  );
  assert.deepEqual(
    workflowApprovalInput({ message: '{"summaryText":"Nested summary","title":"Nested review"}' }),
    { summaryText: 'Nested summary', title: 'Nested review' },
  );
  assert.deepEqual(workflowApprovalInput('not json'), {});
});
