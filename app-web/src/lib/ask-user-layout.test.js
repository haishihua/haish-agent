import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlaySource = fs.readFileSync(new URL('../approval-overlay.jsx', import.meta.url), 'utf8');
const timelineSource = fs.readFileSync(new URL('../panels/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
const formSource = fs.readFileSync(new URL('../panels/AskUserInlineForm.jsx', import.meta.url), 'utf8');
const timelineBuilderSource = fs.readFileSync(new URL('./chat-timeline.js', import.meta.url), 'utf8');
const appShellSource = fs.readFileSync(new URL('../features/app/AppShell.jsx', import.meta.url), 'utf8');
const chatPanelSource = fs.readFileSync(new URL('../panels/ChatPanel.jsx', import.meta.url), 'utf8');
const streamHandlersSource = fs.readFileSync(
  new URL('../features/app/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);
const workflowRuntimeCss = fs.readFileSync(new URL('../../styles/workflow-runtime.css', import.meta.url), 'utf8');

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
  assert.match(chatPanelSource, /import \{ ApprovalInline \} from '\.\.\/approval-overlay\.jsx';/);
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
  assert.match(formSource, /scheduleInitialRetry\(\);/);
  assert.match(formSource, /if \(!response\.ok\) throw new Error/);
  assert.match(formSource, /unsubscribeEvents = subscribeApprovalEvents/);
  assert.doesNotMatch(formSource, /new EventSource/);
  assert.equal((overlaySource.match(/new EventSource/g) || []).length, 1);
  assert.match(formSource, /if \(payload\.type === 'input_resolved'\) remove\(payload\.request_id\);/);
  assert.match(formSource, /if \(!controller\.signal\.aborted && pending\.length === 0\) scheduleInitialRetry\(\);/);
  assert.doesNotMatch(formSource, /function closeWhenResolved/);
  assert.match(formSource, /listeners\.delete\(listener\);[\s\S]*resetWhenIdle\(\);/);
  assert.match(overlaySource, /\.haish-user-input-check \{/);
  assert.match(overlaySource, /border-radius: 2px;/);
  assert.match(overlaySource, /\.haish-user-input-option \{[\s\S]*?position: relative;/);
  assert.match(overlaySource, /\.haish-user-input-native-control \{[\s\S]*?inset: 0;[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(formSource, /className="haish-user-input-prompt"/);
  assert.match(overlaySource, /\.haish-user-input-question legend \{[\s\S]*?flex-direction: column;/);
  assert.match(overlaySource, /\.haish-user-input-prompt \{[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(overlaySource, /\.haish-user-input-card \.haish-approval-body \{[\s\S]*?box-sizing: border-box;[\s\S]*?width: calc\(100% - 36px\);/);
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

test('running background conversations keep refreshing until they become terminal', () => {
  assert.match(appShellSource, /restoreLatestTaskRuntime\(activeTaskIdForPolling,\s*\{/);
  assert.match(appShellSource, /targetConversationId/);
  assert.match(appShellSource, /isCurrentActivation: isCurrentPoll/);
  assert.match(appShellSource, /conversationIdRef\.current === targetConversationId/);
  assert.match(appShellSource, /backgroundTaskPollTargets/);
  assert.match(appShellSource, /fetchTaskRuntimeDetail\(taskId\)/);
  assert.match(appShellSource, /workspaceStateWithConversationRuntimeTask/);
});

test('conversation switching does not silently discard sends while model options reload', () => {
  assert.match(chatPanelSource, /const sendModelId =/);
  assert.match(chatPanelSource, /currentProvider\?\.defaultModelId/);
  assert.doesNotMatch(chatPanelSource, /if \(modelLoading \|\| !activeModelOptions\.some/);
});
