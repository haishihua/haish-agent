import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlaySource = fs.readFileSync(new URL('../../src/features/approvals/components/ApprovalOverlay.jsx', import.meta.url), 'utf8');
const timelineSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
const approvalStyles = fs.readFileSync(new URL('../../styles/approvals.css', import.meta.url), 'utf8');

test('browser runtime request renders inside the browser_use tool node, not as a separate dialog', () => {
  assert.ok(
    timelineSource.includes(
      "import { BrowserRuntimeCard, selectBrowserRuntimeRequest, useBrowserRuntimeRequests } from '../../approvals/components/ApprovalOverlay.jsx';",
    ),
  );
  assert.ok(timelineSource.includes('selectBrowserRuntimeRequest(pendingBrowserRuntime, {'));
  assert.ok(timelineSource.includes('toolName: item.toolName,'));
  assert.ok(timelineSource.includes('status,'));
  assert.ok(timelineSource.includes('<BrowserRuntimeCard request={browserRuntimeRequest} embedded />'));
});

test('browser_use tool node gets its own browser icon instead of the generic default', () => {
  // browser_use used to fall through resolveToolIconClass to the generic
  // ico-tool (wrench). It now maps to a dedicated ico-browser icon class.
  assert.ok(timelineSource.includes("if (name === 'browser_use' || name === 'browser') {"));
  assert.ok(timelineSource.includes("return 'ico-browser';"));
});

test('selection tolerates backend call-id remapping via scope fallback', () => {
  assert.ok(overlaySource.includes('export function selectBrowserRuntimeRequest('));
  // Primary anchor: exact tool_call_id match.
  assert.ok(overlaySource.includes('request.tool_call_id && request.tool_call_id === callId'));
  // Remapped call-id streams: attach only to an ACTIVE browser_use node
  // when exactly one request is pending in the conversation/task scope.
  assert.ok(overlaySource.includes("String(toolName || '').toLowerCase() !== 'browser_use'"));
  assert.ok(overlaySource.includes('request.conversation_id === conversationId'));
  assert.ok(overlaySource.includes('request.task_id === taskId'));
  assert.ok(overlaySource.includes("const isActive = status === 'pending' || status === 'running';"));
  assert.ok(overlaySource.includes('if (!isActive || scoped.length !== 1) return null;'));
});

test('BrowserRuntimeCard claims its request so ApprovalInline skips the standalone row', () => {
  assert.ok(overlaySource.includes('export function useBrowserRuntimeRequests(active = true)'));
  assert.match(timelineSource, /useBrowserRuntimeRequests\(isBrowserUse\)/);
  assert.ok(overlaySource.includes('export function BrowserRuntimeCard({ request, embedded = false })'));
  // Exclusive claim: only the first mounted card wins and actually renders.
  assert.ok(overlaySource.includes('const won = approvalStore.claimBrowserRuntime(request.request_id);'));
  assert.ok(overlaySource.includes('setActive(won);'));
  assert.ok(overlaySource.includes('if (won) approvalStore.unclaimBrowserRuntime(request.request_id);'));
  assert.ok(overlaySource.includes('if (!active) return null;'));
  // Unclaimed browser-runtime requests still fall back to the standalone row.
  assert.ok(
    overlaySource.includes(
      '!isBrowserRuntimeRequest(request) || !approvalStore.isBrowserRuntimeClaimed(request.request_id)',
    ),
  );
});

test('embedded rendering drops the approval card header and flattens into the tool card', () => {
  // ApprovalCard accepts an `embedded` flag; the header row is skipped and the
  // body is always shown, so only the browser_use tool card header remains.
  assert.ok(
    overlaySource.includes(
      'function ApprovalCard({ request, busy, onDecide, collapsed, onToggleCollapsed, embedded = false })',
    ),
  );
  assert.ok(overlaySource.includes('{!embedded ? ('));
  assert.ok(overlaySource.includes('!collapsed || embedded ? ('));
  assert.ok(overlaySource.includes('embedded={embedded}'));
  assert.ok(overlaySource.includes('collapsed={embedded ? false : collapsed}'));
  // Embedded slot/body styles flatten the card into the tool body language.
  assert.ok(approvalStyles.includes('.chat-timeline-tool > .haish-approval-slot.is-embedded'));
  assert.ok(approvalStyles.includes('.haish-approval-card.is-embedded .haish-approval-body'));
  // The first-row warning icon is gone: no ::before on the embedded intent.
  assert.ok(!approvalStyles.includes('.haish-approval-intent::before'));
});

test('browser runtime card no longer shows a redundant Runtime action row', () => {
  // The "Runtime action / install_browser_runtime" block only existed because
  // the browser-runtime card reuses the generic ApprovalCard (which shows the
  // shell command for regular approvals). The Install Browser Runtime button
  // already conveys the action, so the block is gated behind !browserRuntime.
  assert.ok(overlaySource.includes('{!browserRuntime ? ('));
  assert.ok(overlaySource.includes('<span>Command (runs in terminal)</span>'));
  assert.ok(overlaySource.includes("request.raw_command || '(empty)'"));
  assert.ok(!overlaySource.includes("'Runtime action'"));
});

test('deny is not the default-focused button and sits after the primary action', () => {
  // The Deny button used to carry autoFocus, which made it the highlighted
  // default. It is removed so nothing is pre-selected.
  assert.ok(!overlaySource.includes('autoFocus'));
  // Deny is rendered after the primary action (Install Browser Runtime for
  // browser-runtime requests, Allow Once for regular approvals).
  const installMatch = overlaySource.match(/Install Browser Runtime\s*<\/button>/);
  const denyMatch = overlaySource.match(/Deny\s*<\/button>/);
  assert.ok(installMatch, 'Install Browser Runtime button exists');
  assert.ok(denyMatch, 'Deny button exists');
  assert.ok(installMatch.index < denyMatch.index, 'primary action renders before Deny');
});
