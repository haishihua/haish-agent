import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { assistantNameForTask } from '../../src/features/chat/model/assistant-name.js';
import '../../styles/base.css';
import '../../styles/chat.css';
import '../../styles/markdown.css';

// 助手气泡上方写的名字必须跟着会话选定的 agent 走，而不是写死的 "Assistant"。
// 这里挂的是生产 ChatMessageRow：agent 行带的是 AppShell 算出来的 agentName
//（AppShell 用同一个 model 从任务 / 会话记录里解析），user 行永远是 "You"。
const AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant' },
  { id: 'custom.agent-code', label: 'Code Agent' },
  { id: 'custom.agent-simple', label: 'Simple Agent' },
];

// 会话开始时选的是 Code Agent，整段对话锁定。
const CONVERSATION = { agentId: 'custom.agent-code', profileDisplayName: 'Code Agent' };
// 早期会话在任务上没记 agent，只剩会话记录里的名字（本地库里真实存在这种轮次）。
const LEGACY_CONVERSATION = { agentId: 'custom.agent-simple', profileDisplayName: null };

const CASES = [
  {
    id: 'turn-recorded',
    expected: 'Code Agent',
    task: { taskId: 'task-recorded', profileId: 'custom.agent-code', profileDisplayName: 'Code Agent' },
    conversation: CONVERSATION,
    text: '读一下 chat-timeline.js，把工具分组的下标改对。',
  },
  {
    id: 'turn-streaming',
    // 这一轮刚发出去、还没落库：名字来自这一轮记下的 agent id。
    expected: 'Code Agent',
    task: { taskId: 'task-streaming', requestedAgentId: 'custom.agent-code', profileDisplayName: '' },
    conversation: CONVERSATION,
    text: '',
    streaming: true,
  },
  {
    id: 'turn-legacy',
    expected: 'Simple Agent',
    task: { taskId: 'task-legacy' },
    conversation: LEGACY_CONVERSATION,
    text: '为什么登陆失败了？',
  },
  {
    id: 'turn-unknown',
    // 连会话记录都没有 agent（历史遗留）：不许把内部 id 当名字写出来。
    expected: 'Assistant',
    task: { taskId: 'task-unknown' },
    conversation: {},
    text: '分析一下当前项目。',
  },
];

const rows = CASES.map((entry) => ({
  id: entry.id,
  messageId: `${entry.id}-message`,
  conversationId: 'fixture',
  taskId: entry.task.taskId,
  role: 'agent',
  agentName: assistantNameForTask(entry.task, entry.conversation, AGENT_OPTIONS),
  text: entry.text,
  status: 'done',
  streaming: Boolean(entry.streaming),
  createdAt: Date.now(),
}));

rows.push({
  id: 'turn-user',
  messageId: 'turn-user-message',
  conversationId: 'fixture',
  taskId: 'task-recorded',
  role: 'user',
  text: '读一下 chat-timeline.js。',
  status: 'done',
  createdAt: Date.now(),
});

flushSync(() => createRoot(document.getElementById('root')).render(
  <AppTooltipProvider>
    <main className="app-shell" style={{ padding: 24, width: 'min(760px, 92vw)' }}>
      <div className="chat-message-list" id="rows">
        {rows.map((message) => (
          <ChatMessageRow key={message.id} message={message} annotationNumbers={new Map()} />
        ))}
      </div>
    </main>
  </AppTooltipProvider>,
));

function speakerOf(id) {
  const meta = document.querySelector(`#rows [data-message-id="${id}"] .chat-bubble-meta-main`);
  return meta ? meta.textContent.trim() : null;
}

window.__agentNameChecks = () => {
  const results = CASES.map((entry) => {
    const spoken = speakerOf(entry.id);
    return {
      name: `${entry.id} is announced as "${entry.expected}"`,
      ok: spoken === entry.expected,
      detail: JSON.stringify(spoken),
    };
  });
  const user = speakerOf('turn-user');
  results.push({ name: 'the user bubble still says "You"', ok: user === 'You', detail: JSON.stringify(user) });
  const leaked = rows
    .map((row) => speakerOf(row.id) || '')
    .filter((spoken) => spoken.includes('custom.') || spoken.includes('preset.'));
  results.push({ name: 'no internal agent id reaches the bubble', ok: leaked.length === 0, detail: JSON.stringify(leaked) });
  return { passed: results.every((entry) => entry.ok), results };
};
