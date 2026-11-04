import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationsPanel } from '../../src/features/conversations/components/ConversationsPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/panels.css';
import '../../styles/chat.css';

window.haish = {};
const task = (index, conversationId, mode) => ({
  task_id: `task-${mode}-${index}`, conversation_id: conversationId, execution_mode: mode, title: `Task ${index}`,
  status: 'done', stage: 'done',
  created_at: new Date(1700000000000 + index * 1000).toISOString(),
  updated_at: new Date(1700000000000 + index * 1000).toISOString(),
  completed_at: new Date(1700000000000 + index * 1000).toISOString(),
});
const chatConversations = Array.from({ length: 25 }, (_, index) => ({
  conversation_id: `chat-${index}`, execution_mode: 'chat', title: `Conversation ${index}`, updated_at: null,
  tasks: [task(index, `chat-${index}`, 'chat')],
}));
chatConversations[24].tasks.push(task(26, 'chat-24', 'chat'));
const project = { project_id: 'project-chat', name: 'Chat project', execution_mode: 'chat', conversations: chatConversations };
const botTasks = [task(0, 'bot-1', 'bot'), task(1, 'bot-1', 'bot'), task(2, 'bot-1', 'bot')];
const botProject = { project_id: 'project-bot', name: 'Bot project', execution_mode: 'bot', conversations: [{ conversation_id: 'bot-1', execution_mode: 'bot', title: 'Workflow', updated_at: null }], tasks: botTasks };
const originalFetch = window.fetch.bind(window);
window.__activityRequests = [];
window.fetch = (url, options) => {
  if (String(url).includes('/api/projects?')) {
    const bot = String(url).includes('execution_mode=bot');
    window.__activityRequests.push(bot ? 'bot' : 'chat');
    const response = new Response(JSON.stringify({ owner_id: 'test', projects: [bot ? botProject : project] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Promise((resolve) => setTimeout(() => resolve(response), 500));
  }
  if (String(url).includes('/api/tasks/')) {
    const selectedTask = botTasks.find((item) => String(url).includes(item.task_id));
    return Promise.resolve(new Response(JSON.stringify({ ...selectedTask, description: '', answer_text: 'Fixture report', events: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return originalFetch(url, options);
};
const workspace = (bot, pins, activeId) => ({ activeProjectId: bot ? 'project-bot' : 'project-chat', activeConversationId: bot ? 'bot-1' : activeId, projects: [{
  id: bot ? 'project-bot' : 'project-chat', name: bot ? 'Bot project' : 'Chat project', executionMode: bot ? 'bot' : 'chat', expanded: true,
  conversations: bot ? [{ id: 'bot-1', name: 'Workflow', executionMode: 'bot', tasks: [] }] : [
    ...chatConversations.map((item) => ({ id: item.conversation_id, name: item.title, executionMode: 'chat', pinned: Boolean(pins[item.conversation_id]),
      tasks: item.conversation_id === 'chat-24' ? [{ taskId: 'current-running', status: 'running', createdAt: 1800000000000 }] : [] })),
    { id: 'new-running', name: 'New running conversation', executionMode: 'chat', tasks: [{ taskId: 'new-task', status: 'running', createdAt: 1800000000000 }] },
  ],
}] });
const selected = [];
const actions = [];
window.__activityActions = actions;
function Fixture() {
  const [bot, setBot] = React.useState(false);
  const [settings, setSettings] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [pins, setPins] = React.useState({});
  const [activeId, setActiveId] = React.useState('chat-24');
  return <AppTooltipProvider><button type="button" id="switch-mode" onClick={() => setBot((value) => !value)}>Switch mode</button>
    <button type="button" id="toggle-settings" onClick={() => setSettings((value) => !value)}>Toggle settings</button>
    {settings ? <div data-testid="fixture-settings">Settings</div> : <div style={{ width: 300, height: 700 }}>
      <ConversationsPanel activityOpen={activityOpen} onActivityOpenChange={setActivityOpen}
        workspaceState={workspace(bot, pins, activeId)} workflowTaskMode={bot} activeTaskId={bot ? 'task-bot-1' : null} acknowledgeActiveConversation={false}
        terminalNotices={{ 'chat-24': 'done', 'chat-23': 'failed', 'chat-22': 'cancelled' }}
        taskTerminalNotices={{ 'task-bot-0': 'done', 'task-bot-1': 'failed', 'task-bot-2': 'cancelled' }}
        activityNotices={{
          'chat-24:task-chat-24': { conversationId: 'chat-24', status: 'done' },
          'bot-1:task-bot-1': { conversationId: 'bot-1', status: 'failed' },
        }}
        onSelectActivity={(entry) => { selected.push({ project: entry.project.id, task: entry.taskId }); if (!bot) setActiveId(entry.conversation.id); }}
        onPinConversation={(projectId, conversationId) => {
          actions.push({ action: 'pin', projectId, conversationId });
          setPins((current) => ({ ...current, [conversationId]: !current[conversationId] }));
        }}
        onDeleteConversation={(projectId, conversationId) => actions.push({ action: 'delete-conversation', projectId, conversationId })}
        onDeleteTask={(projectId, conversationId, task) => actions.push({ action: 'delete-task', projectId, conversationId, taskId: task.taskId })}
        onOpenTaskReport={(task) => actions.push({ action: 'report', taskId: task.taskId, answer: task.answerText })}
        onSelectConversation={() => {}} onSelectProject={() => {}} />
    </div>}</AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
window.__activitySelected = selected;
