import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rowSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const nameModelSource = fs.readFileSync(new URL('../../src/features/chat/model/assistant-name.js', import.meta.url), 'utf8');
const agentsModelSource = fs.readFileSync(new URL('../../src/features/agents/model/agent-settings.js', import.meta.url), 'utf8');
const modelPickersSource = fs.readFileSync(new URL('../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');

test('the assistant bubble names the agent instead of a fixed label', () => {
  assert.match(rowSource, /const agentName = String\(message\.agentName \|\| ''\)\.trim\(\);/);
  assert.match(rowSource, /<span>\{agentName \|\| 'Assistant'\}<\/span>/);
  // 名字只能来自 message.agentName；写死的 "Assistant" 不许再回到气泡上。
  assert.doesNotMatch(rowSource, /<span>Assistant<\/span>/);
});

test('every assistant row carries the agent that ran that turn', () => {
  assert.match(shellSource, /import \{ assistantNameForTask \} from '\.\.\/chat\/model\/assistant-name\.js';/);
  assert.match(shellSource, /const agentNameFor = \(task\) => assistantNameForTask\(task, currentConversation, agentOptions\);/);
  assert.match(shellSource, /^\s+agentName,$/m);
  assert.match(shellSource, /agentName: agentNameFor\(taskRuntimeState\.pendingTask\),/);
  // catalog 异步到达时名字会变，缓存不能只比 live。
  assert.match(shellSource, /if \(cachedRows && cachedRows\.live === live && cachedRows\.agentName === agentName\) \{/);
  assert.match(shellSource, /rowCache\.set\(task, \{ rows: taskRows, live, agentName \}\);/);
  assert.match(shellSource, /\}, \[agentOptions, conversationId, taskRuntimeState, currentConversation\]\);/);
});

test('the name is resolved from records first and the picker catalog second', () => {
  assert.match(nameModelSource, /return cleanName\(task\?\.profileDisplayName\)\n {4}\|\| agentDisplayNameForId\(task\?\.profileId \|\| task\?\.requestedAgentId, agentOptions\);/);
  assert.match(nameModelSource, /return cleanName\(conversation\?\.profileDisplayName\)\n {4}\|\| agentDisplayNameForId\(conversation\?\.agentId, agentOptions\);/);
  assert.match(nameModelSource, /return taskAgentName\(task, agentOptions\) \|\| conversationAgentName\(conversation, agentOptions\);/);
  // 气泡和选择器共用同一份 catalog 的 label，所以两边永远写同一个名字。
  assert.match(agentsModelSource, /const match = \(Array\.isArray\(agentOptions\) \? agentOptions : \[\]\)\.find\(\(item\) => item\.id === id\);\n {2}return String\(match\?\.label \|\| ''\)\.trim\(\);/);
  assert.match(modelPickersSource, /const agentLabel = currentAgent \? currentAgent\.label : 'Agent';/);
});
