import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skillAllowPayload } from './createSettingsHandlers.js';

const appShellSource = fs.readFileSync(
  new URL('../AppShell.jsx', import.meta.url),
  'utf8',
);
const activationSource = fs.readFileSync(
  new URL('./createConversationActivationHandlers.js', import.meta.url),
  'utf8',
);
const conversationHandlersSource = fs.readFileSync(
  new URL('./createConversationHandlers.js', import.meta.url),
  'utf8',
);

test('skill allow payload preserves all, none, and explicit selections', () => {
  assert.equal(skillAllowPayload(null), null);
  assert.deepEqual(skillAllowPayload([]), []);
  assert.deepEqual(skillAllowPayload(['esx']), ['esx']);
  assert.deepEqual(skillAllowPayload(undefined), []);
});

test('workflow catalog waits for the local runtime during desktop startup', () => {
  assert.match(appShellSource, /if \(attempt < 8\)/);
  assert.match(appShellSource, /Math\.min\(400 \* \(attempt \+ 1\), 2000\)/);
  assert.match(appShellSource, /applyWorkflowSettingsPayload\(payload\);\s*setWorkflowLoading\(false\);/);
});

test('startup restores an empty workflow conversation from its own execution mode', () => {
  assert.match(activationSource, /latestTask\?\.execution_mode \|\| detail\.execution_mode/);
  assert.match(activationSource, /restoredExecutionMode === 'bot' \? 'workflow' : 'chat'/);
});

test('mode switching restores the selected conversation latest task runtime', () => {
  const toggleHandler = conversationHandlersSource.match(
    /async function performToggleViewMode\(\) \{[\s\S]*?\n {2}\}/,
  )?.[0] || '';
  assert.match(toggleHandler, /const requestSeq = invalidateConversationActivation\(\);/);
  assert.match(toggleHandler, /fetchConversationDetail\(targetConversationId, \{ signal: detailController\.signal \}\)/);
  assert.match(toggleHandler, /activateConversationDetail\(detail, \{ activationSeq: requestSeq \}\)/);
  assert.match(toggleHandler, /modeLocationRef\.current\[currentViewMode\]/);
  assert.match(toggleHandler, /const rememberedLocation = modeLocationRef\.current\[nextViewMode\]/);
  assert.match(toggleHandler, /const currentProject = rememberedProject/);
  assert.match(
    toggleHandler,
    /activateConversationShell\(currentProject\?\.id, targetConversationId\);\s*viewModeRef\.current = nextViewMode;\s*setViewMode\(nextViewMode\);/,
  );
  assert.doesNotMatch(toggleHandler, /restoreLatest: false/);
});

test('mode switching reuses the in-flight toggle instead of creating duplicate conversations', () => {
  assert.match(appShellSource, /const viewModeTogglePromiseRef = useRef\(null\);/);
  assert.match(
    conversationHandlersSource,
    /if \(!viewModeTogglePromiseRef\.current\) \{\s*viewModeTogglePromiseRef\.current = performToggleViewMode\(\)\.finally/,
  );
  assert.match(conversationHandlersSource, /return viewModeTogglePromiseRef\.current;/);
});
