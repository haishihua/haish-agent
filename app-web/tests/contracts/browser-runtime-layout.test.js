import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOOL_APPROVAL_LABELS } from '../../src/core/tool-names.js';
import { resolveToolIconClass } from '../../src/features/chat/components/nodes/shared.js';

const overlaySource = fs.readFileSync(new URL('../../src/features/approvals/components/ApprovalOverlay.jsx', import.meta.url), 'utf8');
// 节点按类型分文件：工具节点本体在 ChatTimelineNodes.jsx，图标映射在 nodes/shared.js。
const timelineSource = [
  fs.readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('../../src/features/chat/components/nodes/shared.js', import.meta.url), 'utf8'),
].join('\n');
const approvalStyles = fs.readFileSync(new URL('../../styles/approvals.css', import.meta.url), 'utf8');

test('browser runtime request uses the shared runtime card inside the browser_use tool node', () => {
  assert.ok(timelineSource.includes('RuntimeApprovalCard,'));
  // 选择逻辑从 model 直接取（不经组件文件转发），守的是「共享而非自己实现」。
  assert.match(timelineSource, /import \{ selectRuntimeRequest \} from '\.\.\/\.\.\/approvals\/model\/approval-presentation\.js';/);
  assert.ok(timelineSource.includes('useRuntimeRequests,'));
  assert.ok(timelineSource.includes('selectRuntimeRequest(pendingRuntime, {'));
  assert.ok(timelineSource.includes('toolName: item.toolName,'));
  assert.ok(timelineSource.includes('status,'));
  assert.ok(timelineSource.includes('<RuntimeApprovalCard request={runtimeRequest} embedded />'));
});

test('browser_use tool node gets its own browser icon instead of the generic default', () => {
  // browser_use used to fall through resolveToolIconClass to the generic
  // ico-tool (wrench). It now maps to a dedicated ico-browser icon class.
  assert.equal(resolveToolIconClass('browser_use', 'ico-tool'), 'ico-browser');
  assert.equal(resolveToolIconClass('browser', 'ico-tool'), 'ico-browser');
});

test('RuntimeApprovalCard claims its request so ApprovalInline skips the standalone row', () => {
  assert.ok(overlaySource.includes('export function useRuntimeRequests(conversationId, active = true)'));
  assert.match(timelineSource, /useRuntimeRequests\(conversationId, isRuntimeTool\)/);
  assert.ok(overlaySource.includes('export function RuntimeApprovalCard({ request, embedded = false })'));
  // Exclusive claim: only the first mounted card wins and actually renders.
  assert.ok(overlaySource.includes('const won = approvalStore.claimRuntime(request.request_id);'));
  assert.ok(overlaySource.includes('setActive(won);'));
  assert.ok(overlaySource.includes('if (won) approvalStore.unclaimRuntime(request.request_id);'));
  assert.ok(overlaySource.includes('if (!active) return null;'));
  // Unclaimed browser-runtime requests still fall back to the standalone row.
  assert.ok(
    overlaySource.includes(
      '&& !approvalStore.isRuntimeClaimed(request.request_id)',
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
  assert.ok(overlaySource.includes('{!runtimeRequest ? ('));
  // 命令块的字段名跟着工具走：exec_command 的说法登记在审批用的 approvalLabel 里（不是工具栏的 'Shell'）。
  assert.equal(TOOL_APPROVAL_LABELS.get('exec_command'), 'Command (runs in terminal)');
  assert.ok(overlaySource.includes("TOOL_APPROVAL_LABELS.get(normalizeToolName(request.tool_name)) || 'Requested operation'"));
  assert.ok(overlaySource.includes("request.raw_command || '(empty)'"));
  assert.ok(!overlaySource.includes("'Runtime action'"));
});

test('deny is not the default-focused button and sits after the primary action', () => {
  // The Deny button used to carry autoFocus, which made it the highlighted
  // default. It is removed so nothing is pre-selected.
  assert.ok(!overlaySource.includes('autoFocus'));
  // Deny is rendered after the primary action (Install Browser Runtime for
  // browser-runtime requests, Allow Once for regular approvals).
  const installIndex = overlaySource.indexOf('Install Browser Runtime');
  const denyIndex = overlaySource.indexOf("{replacingRuntime ? 'Keep Current Version' : 'Deny'}");
  assert.notEqual(installIndex, -1, 'Install Browser Runtime button label exists');
  assert.notEqual(denyIndex, -1, 'runtime decline button exists');
  assert.ok(installIndex < denyIndex, 'primary action renders before Deny');
});
