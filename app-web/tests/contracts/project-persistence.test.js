import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const handlersSource = fs.readFileSync(
  new URL('../../src/features/conversations/hooks/createConversationHandlers.js', import.meta.url),
  'utf8',
);
const activationHandlersSource = fs.readFileSync(
  new URL('../../src/features/conversations/hooks/createConversationActivationHandlers.js', import.meta.url),
  'utf8',
);
const workspaceStateSource = fs.readFileSync(
  new URL('../../src/features/conversations/model/workspace-state.js', import.meta.url),
  'utf8',
);
const conversationPollingSource = fs.readFileSync(
  new URL('../../src/features/conversations/hooks/useConversationListPolling.js', import.meta.url),
  'utf8',
);

test('project pin is isolated from child conversation pins', () => {
  const pinStart = handlersSource.indexOf('function handlePinProject(projectId) {');
  const pinEnd = handlersSource.indexOf('function handleReorderProjects', pinStart);
  const pinProjectBody = handlersSource.slice(pinStart, pinEnd);
  assert.match(pinProjectBody, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(pinProjectBody, /body: JSON\.stringify\(\{ pinned: newPinned \}\)/);
  assert.doesNotMatch(pinProjectBody, /for \(const conversation of/);
  assert.doesNotMatch(pinProjectBody, /\/api\/conversations\/\$\{encodeURIComponent/);
});

test('project and project conversation reorder use scoped backend routes', () => {
  assert.match(handlersSource, /\/api\/projects\/reorder/);
  assert.match(handlersSource, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/conversations\/reorder/);
  assert.doesNotMatch(handlersSource, /\/api\/conversations\/reorder/);
});

test('conversation activation restores changed task runtimes in one batch', () => {
  assert.match(activationHandlersSource, /const restoreOrder = \[/);
  assert.match(activationHandlersSource, /latestTaskId,[\s\S]*taskIdsToRestore\.slice\(\)\.reverse\(\)/);
  assert.match(activationHandlersSource, /await restoreTaskRuntimes\(restoreOrder/);
  assert.doesNotMatch(activationHandlersSource, /for \(const taskId of restoreOrder\)/);
});

test('mode switch uses the already-loaded target execution mode', () => {
  assert.doesNotMatch(handlersSource, /api\/projects\?execution_mode=\$\{nextExecutionMode\}/);
  assert.match(handlersSource, /workspaceState\.projects\.find\(\(project\) => \(/);
  assert.match(handlersSource, /project\.type === 'system' && project\.executionMode === nextExecutionMode/);
});

test('conversation polling refreshes immediately only on initial startup', () => {
  assert.match(conversationPollingSource, /const initialRefreshDoneRef = React\.useRef\(false\);/);
  assert.match(
    conversationPollingSource,
    /immediate: !initialRefreshDoneRef\.current/,
  );
});

test('local storage keeps UI state but omits backend ordering fields', () => {
  const compactStart = workspaceStateSource.indexOf('export function compactWorkspaceStateForStorage');
  const compactEnd = workspaceStateSource.indexOf('export function getWorkspaceConversationIds', compactStart);
  const compactBody = workspaceStateSource.slice(compactStart, compactEnd);
  assert.match(compactBody, /userExpanded/);
  assert.doesNotMatch(compactBody, /sortOrder:/);
  assert.doesNotMatch(compactBody, /pinned:/);
});
