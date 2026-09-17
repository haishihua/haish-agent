import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlaySource = fs.readFileSync(new URL('../../src/features/approvals/components/ApprovalOverlay.jsx', import.meta.url), 'utf8');
const approvalStoreSource = fs.readFileSync(new URL('../../src/features/approvals/model/approval-store.js', import.meta.url), 'utf8');
const approvalStyles = fs.readFileSync(new URL('../../styles/approvals.css', import.meta.url), 'utf8');
const timelineSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
const formSource = fs.readFileSync(new URL('../../src/features/chat/components/AskUserInlineForm.jsx', import.meta.url), 'utf8');
const draftModelSource = fs.readFileSync(new URL('../../src/features/chat/model/ask-user-draft.js', import.meta.url), 'utf8');
const timelineBuilderSource = fs.readFileSync(new URL('../../src/features/chat/model/chat-timeline.js', import.meta.url), 'utf8');
const chatPanelSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
const streamHandlersSource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);
const workflowRuntimeCss = fs.readFileSync(new URL('../../styles/workflow-runtime.css', import.meta.url), 'utf8');
const approvalSurfaceCss = fs.readFileSync(new URL('../../src/shared/ui/agent-elements/approval-surface.css', import.meta.url), 'utf8');

test('ask_user form is declarative and never mounted by the legacy overlay', () => {
  assert.match(timelineSource, /import \{ AskUserInlineForm \} from '\.\/AskUserInlineForm\.jsx';/);
  assert.match(timelineSource, /<AskUserInlineForm/);
  assert.match(timelineSource, /conversationId=\{conversationId\}/);
  assert.match(timelineSource, /taskId=\{taskId\}/);
  assert.match(timelineSource, /selectActiveAskUserItemId\(safeItems, streaming\)/);
  assert.match(timelineSource, /askUserActive=\{item\.id === activeAskUserItemId\}/);
  assert.match(timelineSource, /active=\{askUserActive\}/);
  assert.match(timelineSource, /const status = item\.status \|\| 'pending';/);
  assert.doesNotMatch(timelineSource, /isAskUser && askUserActive \? 'running'/);
  assert.match(chatPanelSource, /import \{ ApprovalInline \} from '\.\.\/\.\.\/approvals\/components\/ApprovalOverlay\.jsx';/);
  assert.match(chatPanelSource, /<ApprovalInline \/>/);
  assert.doesNotMatch(timelineSource, /className="ask-user-form-slot"/);
  assert.doesNotMatch(overlaySource, /input_requested|input_resolved|pending_user_inputs/);
  assert.doesNotMatch(overlaySource, /ask-user-form-slot|isUserInputRequest|UserInputCard/);
  assert.doesNotMatch(overlaySource, /createRoot|insertBefore|MutationObserver|haish:mount-approval-overlay/);
});

test('ask_user option state stays inside the main React tree with square controls', () => {
  assert.match(formSource, /const \[drafts, setDrafts\] = React\.useState\(\{\}\);/);
  assert.match(formSource, /onChange=\{\(\) => toggleSelection\(question, label\)\}/);
  assert.match(formSource, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);|className="haish-user-input-options"/);
  assert.match(formSource, /className="haish-user-input-native-control"/);
  assert.match(formSource, /className="haish-user-input-check"/);
  assert.match(formSource, /className="haish-user-input-textarea"/);
  assert.match(formSource, /usePendingInputs\(active\)/);
  assert.match(formSource, /selectPendingUserInput\(pending/);
  assert.doesNotMatch(formSource, /pending\.length === 1 \? pending\[0\]/);
  assert.match(formSource, /approvalStore.subscribeInputs\(setPending\)/);
  assert.doesNotMatch(formSource, /approvals\/state|scheduleInitialRetry/);
  assert.doesNotMatch(formSource, /new EventSource/);
  assert.equal((approvalStoreSource.match(/new EventSource/g) || []).length, 0);
  assert.match(approvalStoreSource, /onApprovalEvent/);
  assert.match(approvalStoreSource, /payload.type === 'input_resolved'/);
  assert.doesNotMatch(formSource, /function closeWhenResolved/);
  assert.match(formSource, /approvalStore.removeInput\(request.request_id\)/);
  assert.match(approvalStyles, /\.haish-user-input-check \{/);
  assert.match(approvalStyles, /border-radius: 2px;/);
  assert.match(approvalStyles, /\.haish-user-input-option \{[\s\S]*?position: relative;/);
  assert.match(approvalStyles, /\.haish-user-input-native-control \{[\s\S]*?inset: 0;[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(formSource, /className="haish-user-input-prompt"/);
  assert.match(approvalStyles, /\.haish-user-input-question legend \{[\s\S]*?flex-direction: column;/);
  assert.match(approvalStyles, /\.haish-user-input-prompt \{[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(approvalStyles, /\.haish-user-input-card \.haish-approval-body \{[\s\S]*?box-sizing: border-box;[\s\S]*?width: calc\(100% - 36px\);/);
});

test('ask_user answers keep one canonical shape: selection + optional note', () => {
  assert.match(formSource, /from '\.\.\/model\/ask-user-draft\.js';/);
  assert.match(formSource, /const answers = buildAnswers\(questions, drafts\);/);
  assert.match(formSource, /const canSubmit = allQuestionsAnswered\(questions, drafts\);/);
  assert.doesNotMatch(formSource, /kind: '(?:selection|freeform)'/);
  // 「选了选项又写字」= 同一题一条答案带 note；core 只认这个形状。
  assert.match(draftModelSource, /kind: 'selection', values: \[\.\.\.values\], note: text/);
  assert.match(draftModelSource, /kind: 'freeform', text \} : null/);
  // 提示语说人话：只选、只写、又选又写三种都能交（选择 + 可选 note / 纯 freeform）。
  assert.match(formSource, /'Add a note, or type your own answer \(optional\)…'/);
  assert.match(formSource, /: 'Type your answer…'/);
  assert.doesNotMatch(formSource, /Extra details|Enter your answer/);
});

test('the question pager looks and reads like a real control', () => {
  // 「切到下一个问题太隐晦」：以前是 18px 无边框的 ‹ › 字形 + 暗灰的 “1 / 4”。
  assert.match(
    formSource,
    /<span className="aicss-step-count" role="status">Question \{activeStep \+ 1\} of \{questions\.length\}<\/span>/,
  );
  assert.match(formSource, /<StepChevron direction="previous" \/>/);
  assert.match(formSource, /<StepChevron direction="next" \/>/);
  assert.match(formSource, /aria-label="Previous question"/);
  assert.match(formSource, /aria-label="Next question"/);
  // 悬停有说明，和卡片里其它图标按钮一样（Copy / ReRun）。
  assert.match(formSource, /<PortalTooltip text="Previous question" position="above">/);
  assert.match(formSource, /<PortalTooltip text="Next question" position="above">/);
  // 有底、有描边的 26px 圆按钮；旧样式（18px、透明底、无边框）正是不显眼的原因。
  // 底色/描边与卡片里其它次要按钮同一套 token，别做成「再暗一档」的幽灵控件。
  assert.match(
    approvalSurfaceCss,
    /\.aicss-approval \.aicss-step-arrow \{[\s\S]*?width: 26px;[\s\S]*?height: 26px;[\s\S]*?border: 1px solid rgba\(138, 166, 209, 0\.42\);[\s\S]*?border-radius: 999px;[\s\S]*?background: #1a2133;[\s\S]*?color: #daddef;/,
  );
  assert.doesNotMatch(approvalSurfaceCss, /\.aicss-approval \.aicss-step-arrow \{[\s\S]{0,200}?background: transparent;/);
  assert.match(approvalSurfaceCss, /\.aicss-approval \.aicss-step-arrow:hover:not\(:disabled\)/);
  assert.match(approvalSurfaceCss, /\.aicss-approval \.aicss-step-arrow:disabled \{ opacity: \.38;/);
});

test('ask_user focus cannot programmatically scroll the workflow shell off-screen', () => {
  assert.match(workflowRuntimeCss, /\.app-workflow-stage \{[\s\S]*?overflow: clip;/);
  assert.match(workflowRuntimeCss, /\.workflow-run-canvas \{[\s\S]*?overflow: clip;/);
});

test('ask_user remains a top-level timeline item instead of entering a tool group', () => {
  assert.match(timelineBuilderSource, /normalizeToolName\(it\.toolName\) !== 'ask_user'/);
  assert.match(streamHandlersSource, /waitingForInput[\s\S]*status: 'waiting_input'/);
  assert.match(streamHandlersSource, /case 'workflow_run_waiting'/);
});

test('conversation switching does not silently discard sends while model options reload', () => {
  assert.match(chatPanelSource, /const sendModelId =/);
  assert.match(chatPanelSource, /currentProvider\?\.defaultModelId/);
  assert.doesNotMatch(chatPanelSource, /if \(modelLoading \|\| !activeModelOptions\.some/);
});
