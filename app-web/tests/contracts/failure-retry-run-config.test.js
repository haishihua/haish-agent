import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatPanelSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url),
  'utf8',
);
const appShellSource = fs.readFileSync(
  new URL('../../src/features/app/AppShell.jsx', import.meta.url),
  'utf8',
);
const conversationSource = fs.readFileSync(
  new URL('../../src/features/conversations/hooks/createConversationHandlers.js', import.meta.url),
  'utf8',
);
const streamSource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);
const runConfigSource = fs.readFileSync(
  new URL('../../src/features/chat/hooks/useRunConfig.js', import.meta.url),
  'utf8',
);

function retryMessageBody() {
  const start = chatPanelSource.indexOf('const retryMessage = React.useCallback(');
  assert.ok(start >= 0, 'ChatPanel must expose the retry row action');
  return chatPanelSource.slice(start, chatPanelSource.indexOf('const editMessage = React.useCallback(', start));
}

function handleRetryTaskBranch() {
  const start = conversationSource.indexOf('async function handleRetryTask');
  assert.ok(start >= 0, 'handleRetryTask must exist');
  return conversationSource.slice(start, conversationSource.indexOf('\n\n  return {', start));
}

test('failure retry carries the composer run config, not the failed attempt one', () => {
  // Wait for the current commit before retrying; missing overrides use server current selection.
  const retry = retryMessageBody();
  assert.match(retry, /composerRunConfigRef\.current/);
  assert.match(retry, /await current\?\.ensureSaved\?\.\(\)/);
  assert.match(retry, /provider: saved\.provider, modelId: saved\.model_id, reasoningEffort: saved\.reasoning_effort/);
});

test('the retry handoff forwards the config into the task attempt request', () => {
  assert.match(appShellSource, /onRetryTask=\{\(taskId, runConfig\) => \{/);
  assert.match(
    appShellSource,
    /\(pendingTaskId === taskId \? pendingTask : null\),\n\s*null,\n\s*runConfig,/,
  );
  const branch = handleRetryTaskBranch();
  assert.match(branch, /attempt: editedMessage == null \? 'rerun' : 'edit',/);
  assert.match(branch, /runConfig: runConfig \|\| null,/);
  assert.doesNotMatch(
    branch,
    /runConfig: editedMessage == null \? null : runConfig/,
    'rerun must not drop the run config override',
  );
  // 旧数据入口（没有 userMessageId / 没有实时通道）也优先用同一份选择。
  assert.match(branch, /await ctx\.configSync\?\.waitForSave\(targetConversationId\)/);
  assert.match(branch, /await ctx\.configSync\?\.load\(targetConversationId\)/);
  assert.match(branch, /: runConfig\.modelId/);
  assert.match(branch, /: runConfig\.provider/);
});

test('the retry command body carries provider, model and reasoning overrides', () => {
  const start = streamSource.indexOf('const requestBody = fullAttempt ?');
  assert.ok(start >= 0, 'executeQuest must build the full-attempt request body');
  const body = streamSource.slice(start, streamSource.indexOf('} : rerunningNode ?', start));
  assert.match(body, /request_id: streamRequest\.requestId,/);
  assert.match(body, /\.\.\.\(streamRequest\.runConfig \? \{/);
  assert.match(body, /provider: streamRequest\.runConfig\.provider,/);
  assert.match(body, /model_id: streamRequest\.runConfig\.modelId,/);
  assert.match(body, /reasoning_effort: streamRequest\.runConfig\.reasoningEffort,/);
  // 重跑不接受 message：只有编辑重发才带文本。
  assert.match(body, /streamRequest\.attempt === 'edit' \? \{ message: streamRequest\.message \} : \{\}/);
});

test('the sidebar retry uses the persisted current server selection, not stale local storage', () => {
  assert.match(appShellSource, /onRetryTask=\{\(task\) => handleRetryTask\(task\)\}/);
  assert.doesNotMatch(appShellSource, /storedRunConfigRequest/);
  // Legacy local helper remains unused here; missing Chat configuration must not replay the source Task.
  const stored = runConfigSource.slice(runConfigSource.indexOf('export function storedRunConfigRequest'));
  assert.match(stored, /if \(!stored\?\.providerId \|\| !stored\.modelId\) return null;/);
  assert.match(stored, /if \(!request\) return null;/);
  assert.doesNotMatch(stored, /firstRunProvider/);
});
