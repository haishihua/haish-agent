import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationHandlers } from '../../../src/features/conversations/hooks/createConversationHandlers.js';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

const findConversationById = (state, conversationId) => state.projects
  .flatMap((project) => project.conversations)
  .find((conversation) => conversation.id === conversationId) || null;
const findProjectByConversationId = (state, conversationId) => state.projects
  .find((project) => project.conversations.some((conversation) => conversation.id === conversationId)) || null;
const taskUpdatedTimestamp = (task) => task?.updatedAt || 0;

test('selecting a conversation reveals it even beyond the collapsed preview', async () => {
  let state = {
    projects: [{ id: 'project', chatConversationsExpanded: false, conversations: Array.from({ length: 8 }, (_, i) => ({ id: `c${i}` })) }],
  };
  const handlers = createConversationHandlers({
    draftConversationRef: { current: null },
    conversationIdRef: { current: 'c7' },
    setWorkspaceState: (update) => { state = update(state); },
    normalizeWorkspaceOrdering: (next) => next,
  });
  await handlers.handleSelectConversation('project', 'c7');
  assert.equal(state.activeConversationId, 'c7');
  assert.equal(state.activeProjectId, 'project');
  assert.equal(state.projects[0].userExpanded, true);
  assert.equal(state.projects[0].chatConversationsExpanded, true);
});

test('rapid mode switches keep cached conversation selection and send target in sync without requests', async () => {
  const task = (taskId) => ({ taskId, updatedAt: 1, runtimeHydrated: true });
  let workspaceState = {
    activeProjectId: 'chat-project',
    activeConversationId: 'chat-conversation',
    projects: [
      {
        id: 'chat-project',
        type: 'system',
        executionMode: 'chat',
        workspacePath: null,
        conversations: [{
          id: 'chat-conversation',
          executionMode: 'chat',
          tasks: [task('chat-task')],
        }],
      },
      {
        id: 'bot-project',
        type: 'system',
        executionMode: 'bot',
        workspacePath: null,
        conversations: [{
          id: 'bot-conversation',
          executionMode: 'bot',
          tasks: [task('bot-task')],
        }],
      },
    ],
  };
  const conversationIdRef = { current: 'chat-conversation' };
  const viewModeRef = { current: 'chat' };
  const activationSeqRef = { current: 0 };
  let requestCount = 0;
  const runtimes = new Map(['chat', 'bot'].map((mode) => {
    const taskId = `${mode}-task`;
    return [`${mode}-conversation`, {
      shellSeeded: false,
      busy: false,
      activeRunId: null,
      fetchController: null,
      taskRuntimeState: {
        taskOrder: [taskId],
        tasksById: { [taskId]: task(taskId) },
      },
    }];
  }));
  const handlers = createConversationHandlers({
    activateConversationShell: (_projectId, conversationId) => {
      conversationIdRef.current = conversationId;
    },
    conversationDetailAbortRef: { current: null },
    conversationIdRef,
    fetchConversationDetail: async () => {
      requestCount += 1;
      throw new Error('unexpected conversation request');
    },
    findConversationById,
    findProjectByConversationId,
    getRuntime: (conversationId) => runtimes.get(conversationId),
    invalidateConversationActivation: () => {
      activationSeqRef.current += 1;
      return activationSeqRef.current;
    },
    isConversationActivationCurrent: (seq) => activationSeqRef.current === seq,
    modeLocationRef: { current: { chat: null, workflow: null } },
    openDraftConversation: () => assert.fail('unexpected draft'),
    settingsMode: false,
    setActiveTab: () => {},
    setViewMode: () => {},
    setWorkspaceState: (update) => { workspaceState = update(workspaceState); },
    showToast: () => {},
    taskUpdatedTimestamp,
    viewModeRef,
    workspaceState,
  });

  const switchCount = 12;
  for (let index = 0; index < switchCount; index += 1) {
    handlers.handleToggleViewMode();
    const mode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    assert.equal(workspaceState.activeProjectId, `${mode}-project`);
    assert.equal(workspaceState.activeConversationId, conversationIdRef.current);
    const deploy = createDeployHandlers({
      draftConversationRef: { current: null },
      conversationIdRef,
      selectedConversationId: workspaceState.activeConversationId,
      conversationReady: true,
      conversationSelectionPending: workspaceState.activeConversationId !== conversationIdRef.current,
      viewModeRef,
    });
    const request = deploy.buildDeployRequest('hello');
    assert.equal(request.targetConversationId, `${mode}-conversation`);
    assert.equal(deploy.canStartDeployForConversation(request.targetConversationId), true);
  }
  await Promise.resolve();

  assert.equal(viewModeRef.current, 'chat');
  assert.equal(conversationIdRef.current, 'chat-conversation');
  assert.equal(requestCount, 0);
});
