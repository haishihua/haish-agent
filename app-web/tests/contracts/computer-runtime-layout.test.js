import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlaySource = fs.readFileSync(
  new URL('../../src/features/approvals/components/ApprovalOverlay.jsx', import.meta.url),
  'utf8',
);
const timelineSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);
const storeSource = fs.readFileSync(
  new URL('../../src/features/approvals/model/approval-store.js', import.meta.url),
  'utf8',
);
const approvalApiSource = fs.readFileSync(
  new URL('../../src/features/approvals/api/approvals.js', import.meta.url),
  'utf8',
);
const desktopApiSource = fs.readFileSync(
  new URL('../../../src/shared/haish-api.ts', import.meta.url),
  'utf8',
);
const baseStyles = fs.readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8');

test('computer runtime events enter and leave the shared approval store', () => {
  assert.match(storeSource, /pending_computer_runtime_installs/);
  assert.match(storeSource, /computer_runtime_install_required/);
  assert.match(storeSource, /computer_runtime_install_resolved/);
  assert.match(storeSource, /export function isComputerRuntimeRequest/);
});

test('computer runtime request reuses the shared runtime card inside computer_use', () => {
  assert.match(timelineSource, /useRuntimeRequests\(conversationId, isRuntimeTool\)/);
  assert.match(timelineSource, /selectRuntimeRequest\(pendingRuntime/);
  assert.match(timelineSource, /<RuntimeApprovalCard request=\{runtimeRequest\} embedded \/>/);
  assert.match(overlaySource, /if \(normalized === 'computer_use'\) return isComputerRuntimeRequest\(request\)/);
  assert.match(overlaySource, /export function RuntimeApprovalCard/);
});

test('tool groups auto-expand so a computer runtime card cannot fall into the standalone row', () => {
  assert.match(timelineSource, /const runtimeRequests = useRuntimeRequests\(conversationId, true\)/);
  assert.match(timelineSource, /const needsRuntimeApproval = tools\.some/);
  assert.match(timelineSource, /const expanded = open \|\| needsApproval \|\| needsRuntimeApproval/);
});

test('computer runtime request stays scoped to its owning conversation', () => {
  assert.match(overlaySource, /selectConversationApprovalRequests\(next, conversationId\)/);
  assert.match(overlaySource, /requestBelongsToConversation\(request, conversationId\)/);
  assert.match(overlaySource, /export function ApprovalInline\(\{ conversationId \}\)/);
});

test('computer_use and its runtime approval use the dedicated desktop-control icon', () => {
  assert.match(timelineSource, /if \(name === 'computer_use'\) \{/);
  assert.match(timelineSource, /return 'ico-computer-use';/);
  assert.match(overlaySource, /computerRuntime \? 'ico-computer-use' : 'ico-browser'/);
  const rule = baseStyles.match(/\.ico-computer-use\s*\{([^}]+)\}/);
  assert.ok(rule, '.ico-computer-use must be declared in base.css');
  assert.match(rule[1], /computer-use\.svg/);
  assert.doesNotMatch(rule[1], /tool\.png|browser\.svg/);
  assert.ok(fs.existsSync(new URL('../../assets/ui/icons/computer-use.svg', import.meta.url)));
});

test('computer runtime card has dedicated install and shared replacement copy', () => {
  assert.match(overlaySource, /Computer Runtime Required/);
  assert.match(overlaySource, /Computer Runtime Replacement Required/);
  assert.match(overlaySource, /Install Computer Runtime/);
  assert.match(overlaySource, /Replace and Continue/);
  assert.match(overlaySource, /Keep Current Version/);
  assert.match(overlaySource, /This replaces the shared Cua Driver app used by other sessions on this Mac/);
  assert.match(overlaySource, /postComputerRuntimeDecision\(request, decision\)/);
  assert.match(approvalApiSource, /postRuntimeDecision\('computer_runtime', request, decision\)/);
  assert.match(desktopApiSource, /'computer_runtime'/);
});
