import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rowSource = fs.readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const nameModelSource = fs.readFileSync(new URL('../../src/features/chat/model/assistant-name.js', import.meta.url), 'utf8');
const agentsModelSource = fs.readFileSync(new URL('../../src/features/agents/model/agent-settings.js', import.meta.url), 'utf8');
const modelPickersSource = fs.readFileSync(new URL('../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
const workflowRuntimeSource = fs.readFileSync(new URL('../../src/features/workflow/components/WorkflowRuntimePage.jsx', import.meta.url), 'utf8');
const approvalOverlaySource = fs.readFileSync(new URL('../../src/features/approvals/components/ApprovalOverlay.jsx', import.meta.url), 'utf8');

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
  assert.match(shellSource, /\}, \[agentOptions, conversationId, currentConversation, settledRuntimeTaskIds, taskRuntimeState\]\);/);
});

test('the name is resolved from records first and the picker catalog second', () => {
  assert.match(nameModelSource, /return cleanName\(task\?\.profileDisplayName\)\n {4}\|\| agentDisplayNameForId\(task\?\.profileId \|\| task\?\.requestedAgentId, agentOptions\);/);
  assert.match(nameModelSource, /return cleanName\(conversation\?\.profileDisplayName\)\n {4}\|\| agentDisplayNameForId\(conversation\?\.agentId, agentOptions\);/);
  assert.match(nameModelSource, /return taskAgentName\(task, agentOptions\) \|\| conversationAgentName\(conversation, agentOptions\);/);
  // 气泡和选择器共用同一份 catalog 的 label，所以两边永远写同一个名字。
  assert.match(agentsModelSource, /function findAgentOption\(agentId, agentOptions\) \{/);
  assert.match(
    agentsModelSource,
    /export function agentDisplayNameForId\(agentId, agentOptions = \[\]\) \{\n {2}return String\(findAgentOption\(agentId, agentOptions\)\?\.label \|\| ''\)\.trim\(\);\n\}/,
  );
  const nameFunction = agentsModelSource.match(/export function agentDisplayNameForId\([\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(nameFunction, /return\s+id\b|\|\|\s*id\b/, '内部 id 绝不许当名字返回');
  assert.match(modelPickersSource, /const agentLabel = currentAgent \? currentAgent\.label : 'Agent';/);
});

test('a workflow agent node names its reply, the nodes without an agent stay unnamed', () => {
  // 只有 agent 节点在配置里绑了 agent_id，所以工作流节点详情的回复气泡只有它能署名；
  // llm / tool / 审批节点没有 agent，返回 ''，气泡仍是 "Assistant"（审批卡不改）。
  assert.match(nameModelSource, /export function workflowNodeAgentName\(node, agentOptions = \[\]\) \{\n {2}if \(node\?\.type !== 'agent'\) return '';\n {2}return agentDisplayNameForId\(node\.agent_id, agentOptions\);\n\}/);
  assert.match(
    workflowRuntimeSource,
    /import \{ workflowNodeAgentName \} from '\.\.\/\.\.\/chat\/model\/assistant-name\.js';/,
  );
  assert.match(
    workflowRuntimeSource,
    /const selectedNodeAgentName = selectedNode\n {4}\? workflowNodeAgentName\(selectedNode, agentOptions\)\n {4}: '';/,
  );
  assert.match(workflowRuntimeSource, /^ {10}agentName=\{selectedNodeAgentName\}$/m);
  assert.match(
    workflowRuntimeSource,
    /function NodeConversation\(\{[\s\S]*?onRetry, agentName = '' \}\) \{/,
  );
  assert.match(workflowRuntimeSource, /^ {4}agentName,$/m);
  assert.match(workflowRuntimeSource, /^ {10}agentName=\{agentName\}$/m);
  // catalog 是异步到的：名字变了 useMemo 要重算。
  assert.match(workflowRuntimeSource, /\}\), \[agentName, attempt\?\.id, completedAt, createdAt, node\.id, resultText, running, scopedTask, task\?\.conversationId, task\?\.taskId, timeline\?\.latestTodos, timelineItems, timelineStatus\]\);/);
  assert.match(approvalOverlaySource, /<span>Assistant<\/span>/);
});
