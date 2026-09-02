import { stripChatImageAugmentation } from '../../chat/model/chat-text.js';
import { API_BASE } from '../../../shared/api/base.js';
import {
  WORKSPACE_STORAGE_KEY,
  CONVERSATION_STORAGE_KEY,
  DEFAULT_PROJECT_NAME,
  DEFAULT_SESSION_NAME,
  DEFAULT_CONVERSATION_NAMES,
  buildOwnerScopedStorageKey,
} from '../../../shared/api/client.js';

export function generateHexId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

export function getStoredConversationId(ownerId) {
  const key = buildOwnerScopedStorageKey(CONVERSATION_STORAGE_KEY, ownerId);
  return key ? String(window.localStorage.getItem(key) || '').trim() || null : null;
}

export function setStoredConversationId(ownerId, conversationId) {
  const key = buildOwnerScopedStorageKey(CONVERSATION_STORAGE_KEY, ownerId);
  if (!key) return;
  if (!conversationId) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, conversationId);
}

export function defaultProjectIdForMode(executionMode = 'chat') {
  return `default-project-${executionMode === 'bot' ? 'bot' : 'chat'}`;
}

export function createDefaultProject(executionMode = 'chat') {
  return {
    id: defaultProjectIdForMode(executionMode),
    type: 'system',
    executionMode: executionMode === 'bot' ? 'bot' : 'chat',
    name: DEFAULT_PROJECT_NAME,
    workspacePath: null,
    workspaceLabel: null,
    removable: false,
    createdAt: null,
    updatedAt: null,
    pinned: false,
    sortOrder: 0,
    chatConversationsExpanded: false,
    workflowTasksExpanded: false,
    hiddenModes: [],
    conversations: [],
  };
}

export function createEmptyWorkspaceState() {
  return {
    projects: [createDefaultProject('chat'), createDefaultProject('bot')],
    activeProjectId: defaultProjectIdForMode('chat'),
    activeConversationId: null,
  };
}

function parseStoredWorkspaceState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    const orderedProjects = parsed.projects.filter(
      (project) => project?.id && ['chat', 'bot'].includes(project.executionMode),
    );
    const projects = orderedProjects.map((project) => {
      const isDefault = project.type === 'system';
      return {
        ...project,
        type: isDefault ? 'system' : 'custom',
        executionMode: project.executionMode,
        name: isDefault ? DEFAULT_PROJECT_NAME : (project.name || project.workspaceLabel || 'Custom project'),
        workspacePath: isDefault ? null : (project.workspacePath || null),
        workspaceLabel: isDefault ? null : (project.workspaceLabel || project.name || null),
        removable: !isDefault,
        createdAt: project.createdAt || project.created_at || null,
        updatedAt: project.updatedAt || project.updated_at || null,
        // `userExpanded` is the sole source of truth for sidebar expansion.
        // Activation handlers set it to true on the active project / conversation;
        // chevron toggle flips it; everything else remains in whatever state the
        // user last left it. We intentionally drop the legacy `expanded` field
        // on load so old snapshots don't carry forward "every project expanded".
        userExpanded: typeof project.userExpanded === 'boolean' ? project.userExpanded : undefined,
        chatConversationsExpanded: Boolean(project.chatConversationsExpanded),
        workflowTasksExpanded: Boolean(project.workflowTasksExpanded),
        pinned: Boolean(project.pinned),
        sortOrder: typeof project.sortOrder === 'number' ? project.sortOrder : 0,
        hiddenModes: Array.isArray(project.hiddenModes)
          ? project.hiddenModes.filter((mode) => mode === 'chat' || mode === 'bot')
          : [],
        conversations: Array.isArray(project.conversations)
          ? project.conversations.flatMap((conversation) => {
            if (!conversation?.id || !['chat', 'bot'].includes(conversation.executionMode)) return [];
            return [{
              id: conversation.id,
              name: conversation.name || DEFAULT_SESSION_NAME,
              executionMode: conversation.executionMode,
              tasks: Array.isArray(conversation.tasks)
                ? conversation.tasks.filter((task) => task?.executionMode === conversation.executionMode)
                : [],
              createdAt: conversation.createdAt || conversation.created_at || null,
              updatedAt: conversation.updatedAt || conversation.updated_at || null,
              userExpanded: typeof conversation.userExpanded === 'boolean' ? conversation.userExpanded : undefined,
              tasksExpanded: Boolean(conversation.tasksExpanded),
              pinned: Boolean(conversation.pinned),
              sortOrder: typeof conversation.sortOrder === 'number' ? conversation.sortOrder : 0,
            }];
          })
          : [],
      };
    });
    return normalizeWorkspaceOrdering({
      projects,
      activeProjectId: parsed.activeProjectId || defaultProjectIdForMode('chat'),
      activeConversationId: parsed.activeConversationId || null,
    });
  } catch (error) {
    console.warn('Failed to load workspace state:', error);
    return null;
  }
}

export function loadStoredWorkspaceState(ownerId) {
  const key = buildOwnerScopedStorageKey(WORKSPACE_STORAGE_KEY, ownerId);
  return parseStoredWorkspaceState(key ? window.localStorage.getItem(key) : null) || createEmptyWorkspaceState();
}

export function saveWorkspaceState(ownerId, state) {
  const key = buildOwnerScopedStorageKey(WORKSPACE_STORAGE_KEY, ownerId);
  if (!key) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(compactWorkspaceStateForStorage(state)),
    );
  } catch (error) {
    console.warn('Failed to save workspace state:', error);
  }
}

export function compactWorkspaceStateForStorage(state) {
  return {
    activeProjectId: state?.activeProjectId || defaultProjectIdForMode('chat'),
    activeConversationId: state?.activeConversationId || null,
    projects: (state?.projects || []).map((project) => ({
      id: project.id,
      executionMode: project.executionMode,
      userExpanded: project.userExpanded,
      chatConversationsExpanded: Boolean(project.chatConversationsExpanded),
      workflowTasksExpanded: Boolean(project.workflowTasksExpanded),
      hiddenModes: project.hiddenModes || [],
      conversations: (project.conversations || []).map((conversation) => ({
        id: conversation.id,
        userExpanded: conversation.userExpanded,
        tasksExpanded: Boolean(conversation.tasksExpanded),
        executionMode: conversation.executionMode,
        tasks: (conversation.tasks || [])
          .filter((task) => task?.executionMode === conversation.executionMode)
          .map((task) => ({
            id: task.id || task.taskId || task.task_id || null,
            taskId: task.taskId || task.id || task.task_id || null,
            title: task.title || 'Task',
            description: task.description || '',
            status: task.status || null,
            stage: task.stage || null,
            createdAt: task.createdAt || task.created_at || null,
            updatedAt: task.updatedAt || task.updated_at || null,
            completedAt: task.completedAt || task.completed_at || null,
            executionMode: task.executionMode,
          })),
      })),
    })),
  };
}

export function getWorkspaceConversationIds(state) {
  return (state?.projects || [])
    .flatMap((project) => project.conversations || [])
    .map((conversation) => conversation.id)
    .filter(Boolean);
}

export function projectNameFromPath(workspacePath, fallback = 'Custom project') {
  const raw = String(workspacePath || '').trim();
  if (!raw) return fallback;
  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

export function isDefaultConversationName(name) {
  const normalized = String(name || '').trim();
  return DEFAULT_CONVERSATION_NAMES.has(normalized)
    || /^New Chat \d+$/.test(normalized)
    || /^New Conversation \d+$/.test(normalized);
}

export function titleFromTaskText(text, maxLength = 48) {
  const normalized = stripChatImageAugmentation(text).text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}


export function chatImagePreviewUrl(ref, conversationId) {
  const existing = String(ref?.previewUrl || '').trim();
  if (existing) return existing;
  const path = String(ref?.path || '').trim();
  if (!path || !conversationId) return '';
  if (/^(blob:|data:|https?:|file:)/i.test(path)) return path;
  const params = new URLSearchParams({ image_path: path });
  return `${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/messages/images/preview?${params.toString()}`;
}

export function normalizeChatImageRefs(refs, conversationId) {
  return (Array.isArray(refs) ? refs : [])
    .filter((ref) => ref && (ref.path || ref.previewUrl))
    .map((ref, index) => ({
      image_id: ref.image_id || ref.imageId || `image-${index}`,
      path: ref.path || '',
      mime: ref.mime || null,
      previewUrl: chatImagePreviewUrl(ref, conversationId),
    }));
}

export function mergeChatImageRefValue(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    image_id: incoming.image_id || incoming.imageId || existing.image_id || existing.imageId,
    path: incoming.path || existing.path || '',
    mime: incoming.mime || existing.mime || null,
    previewUrl: incoming.previewUrl || existing.previewUrl || '',
  };
}

export function mergeChatImageRefs(...groups) {
  // 去重以 path 为优先 key——同一张图被多个源头（服务端记录 / 消息标记还原 /
  // 上一轮客户端 state）各自合成的 image_id 不同，但 path 是真正稳定的"内容标识"。
  // 历史实现按 image_id 优先，导致重启恢复 task 时 2 张图被算成 4 张。
  const order = [];
  const mergedByKey = new Map();
  groups.flat().forEach((ref) => {
    if (!ref) return;
    const path = String(ref.path || '').trim();
    const key = path || ref.image_id || ref.imageId || ref.previewUrl;
    if (!key) return;
    if (!mergedByKey.has(key)) {
      order.push(key);
      mergedByKey.set(key, ref);
      return;
    }
    mergedByKey.set(key, mergeChatImageRefValue(mergedByKey.get(key), ref));
  });
  return order.map((key) => mergedByKey.get(key)).filter(Boolean);
}

export function chatImageFallbacksByTaskIdFromMessages(messages, conversationId) {
  const map = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.role !== 'user' || !message.task_id) continue;
    const parsed = stripChatImageAugmentation(message.content);
    if (parsed.imageRefs.length === 0) continue;
    const existing = map.get(message.task_id) || [];
    map.set(
      message.task_id,
      normalizeChatImageRefs(mergeChatImageRefs(existing, parsed.imageRefs), conversationId),
    );
  }
  return map;
}

export function timestampValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function taskUpdatedTimestamp(task) {
  if (!task) return 0;
  return Math.max(
    timestampValue(task.updatedAt),
    timestampValue(task.updated_at),
    timestampValue(task.completedAt),
    timestampValue(task.completed_at),
    timestampValue(task.createdAt),
    timestampValue(task.created_at),
  );
}

export function projectWorkflowTasks(project) {
  return (Array.isArray(project?.conversations) ? project.conversations : [])
    .flatMap((conversation) => (
      (Array.isArray(conversation?.tasks) ? conversation.tasks : []).map((task) => ({
        task,
        conversation,
        conversationId: conversation.id,
      }))
    ))
    .filter((entry) => entry.conversationId && (entry.task?.taskId || entry.task?.task_id || entry.task?.id))
    .sort((a, b) => (
      Number(Boolean(b.conversation?.pinned)) - Number(Boolean(a.conversation?.pinned))
      || taskUpdatedTimestamp(b.task) - taskUpdatedTimestamp(a.task)
    ));
}

export function taskCreatedTimestamp(task) {
  if (!task) return 0;
  return Math.max(
    timestampValue(task.createdAt),
    timestampValue(task.created_at),
  );
}

export function conversationUpdatedTimestamp(conversation) {
  if (!conversation) return 0;
  const taskUpdatedAt = Array.isArray(conversation.tasks)
    ? conversation.tasks.reduce((latest, task) => Math.max(latest, taskUpdatedTimestamp(task)), 0)
    : 0;
  return Math.max(
    timestampValue(conversation.updatedAt),
    timestampValue(conversation.updated_at),
    timestampValue(conversation.createdAt),
    timestampValue(conversation.created_at),
    taskUpdatedAt,
  );
}

export function projectUpdatedTimestamp(project) {
  if (!project) return 0;
  const conversationUpdatedAt = Array.isArray(project.conversations)
    ? project.conversations.reduce((latest, conversation) => Math.max(latest, conversationUpdatedTimestamp(conversation)), 0)
    : 0;
  return Math.max(
    timestampValue(project.updatedAt),
    timestampValue(project.updated_at),
    timestampValue(project.createdAt),
    timestampValue(project.created_at),
    conversationUpdatedAt,
  );
}

export function inferProjectCreatedAt(project) {
  const directCreatedAt = project?.createdAt || project?.created_at;
  if (timestampValue(directCreatedAt)) return directCreatedAt;
  const conversations = Array.isArray(project?.conversations) ? project.conversations : [];
  let earliest = null;
  for (const conversation of conversations) {
    const createdAt = conversation?.createdAt || conversation?.created_at;
    const timestamp = timestampValue(createdAt);
    if (!timestamp) continue;
    if (!earliest || timestamp < earliest.timestamp) {
      earliest = { timestamp, createdAt };
    }
  }
  return earliest?.createdAt || null;
}

export function projectCreatedTimestamp(project) {
  return timestampValue(inferProjectCreatedAt(project));
}

export function withDefaultExpansion(project) {
  // The sidebar expansion is purely user-driven now: `userExpanded` is the
  // single source of truth. Activation handlers below set it to true on the
  // newly-selected project / conversation; the chevron toggle flips it; an
  // untouched chat projects stay collapsed; workflow projects reveal their
  // compact task preview. This stops the
  // previously-active project from auto-collapsing the moment the user
  // navigates to another conversation — the regression the user reported as
  // "click a project and the other projects/conversations get folded up".
  const conversations = Array.isArray(project.conversations)
    ? project.conversations.map((conversation) => {
      const tasks = Array.isArray(conversation.tasks) ? conversation.tasks : [];
      return {
        ...conversation,
        tasks,
        updatedAt: conversationUpdatedTimestamp({ ...conversation, tasks }) || conversation.updatedAt || null,
        expanded: conversation.userExpanded === true,
        tasksExpanded: Boolean(conversation.tasksExpanded),
      };
    })
    : [];
  return {
    ...project,
    conversations,
    createdAt: inferProjectCreatedAt({ ...project, conversations }),
    updatedAt: projectUpdatedTimestamp({ ...project, conversations }) || project.updatedAt || null,
    expanded: project.executionMode === 'bot'
      ? project.userExpanded !== false
      : project.userExpanded === true,
    chatConversationsExpanded: Boolean(project.chatConversationsExpanded),
    workflowTasksExpanded: Boolean(project.workflowTasksExpanded),
  };
}

export function conversationHasActiveTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => isTaskActuallyActive(task));
}

export function isTaskActuallyActive(task) {
  const status = String(task?.status || '').toLowerCase();
  if (status !== 'running' && status !== 'queued') return false;
  // Server status alone is unreliable: a task may have already finished
  // from the user's perspective while the persisted status lagged behind
  // (the user-facing symptom is "no task is running but composer is locked").
  // Only terminal completion markers override raw running/queued state.
  // Do NOT treat answerText as done — streaming runs write partial
  // answerText while status remains running; using answer presence here
  // prematurely unlocks the composer and hides the stop button mid-run.
  if (task?.completedAt || task?.completed_at) return false;
  if (task?.serverFinished === true) return false;
  return true;
}

export function normalizeWorkspaceOrdering(state) {
  const activeProjectId = state?.activeProjectId || defaultProjectIdForMode('chat');
  const activeConversationId = state?.activeConversationId || null;
  // Sidebar ordering policy:
  //   - Conversations: pinned first, then any conversation with a running/
  //     queued task floats to the top of its project so active work is always
  //     visible. Within each pinned / running / idle group keep the backend
  //     sortOrder (manual drag) as the stable relative order; updatedAt and
  //     active highlighting do NOT participate in ordering, so clicking
  //     around does not reshuffle the list.
  //   - Projects: pinned first, then backend sortOrder (manual drag). Running
  //     state never participates in project ordering.
  const projects = (Array.isArray(state?.projects) ? state.projects : [])
    .map((project) => withDefaultExpansion(project))
    .map((project) => ({
      ...project,
      conversations: [...project.conversations].sort((a, b) => {
        const aPinned = Boolean(a.pinned);
        const bPinned = Boolean(b.pinned);
        if (aPinned && !bPinned) return -1;
        if (bPinned && !aPinned) return 1;
        const aActive = conversationHasActiveTask(a);
        const bActive = conversationHasActiveTask(b);
        if (aActive && !bActive) return -1;
        if (bActive && !aActive) return 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }),
    }))
    .sort((a, b) => {
        const aPinned = Boolean(a.pinned);
        const bPinned = Boolean(b.pinned);
        if (aPinned && !bPinned) return -1;
        if (bPinned && !aPinned) return 1;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });
  return {
    ...(state || {}),
    projects: projects.length ? projects : [createDefaultProject()],
    activeProjectId,
    activeConversationId,
  };
}

export function conversationDetailToWorkspaceConversation(
  detail,
  previousConversation = null,
  mapTask = (task) => task,
) {
  const detailName = detail.title || detail.label || '';
  const previousName = previousConversation?.name || '';
  const shouldKeepLocalTitle = isDefaultConversationName(detailName)
    && previousName
    && !isDefaultConversationName(previousName);
  const tasks = Array.isArray(detail.tasks)
    ? detail.tasks.map((task) => mapTask(task))
    : (Array.isArray(previousConversation?.tasks) ? previousConversation.tasks : []);
  return {
    id: detail.conversation_id,
    name: shouldKeepLocalTitle ? previousName : (detailName || previousName || DEFAULT_SESSION_NAME),
    executionMode: detail.execution_mode === 'bot' ? 'bot' : 'chat',
    tasks,
    agentId: detail.agent_id || detail.profile_id || previousConversation?.agentId || tasks[0]?.requestedAgentId || null,
    profileId: detail.profile_id || previousConversation?.profileId || null,
    profileDisplayName: detail.profile_display_name || previousConversation?.profileDisplayName || null,
    createdAt: detail.created_at || previousConversation?.createdAt || null,
    updatedAt: detail.updated_at || detail.last_message_at || previousConversation?.updatedAt || null,
    // Preserve the user's explicit toggle when present; otherwise leave it
    // undefined and let withDefaultExpansion compute expanded from activeness.
    userExpanded: typeof previousConversation?.userExpanded === 'boolean'
      ? previousConversation.userExpanded
      : undefined,
    tasksExpanded: Boolean(previousConversation?.tasksExpanded),
    projectId: detail.project_id || previousConversation?.projectId || null,
    pinned: Boolean(detail.pinned),
    sortOrder: typeof detail.sort_order === 'number' ? detail.sort_order : 0,
  };
}

export function buildWorkspaceStateFromProjects(
  projectDetails,
  previousState,
  mapTask = (task) => task,
) {
  const previous = previousState || createEmptyWorkspaceState();
  const previousProjects = new Map(previous.projects.map((project) => [project.id, project]));
  const previousConversations = new Map(
    previous.projects.flatMap((project) => project.conversations.map((conversation) => [conversation.id, conversation]))
  );
  const projects = (Array.isArray(projectDetails) ? projectDetails : []).map((detail) => {
    const projectId = detail?.project_id;
    if (!projectId) return null;
    const previousProject = previousProjects.get(projectId);
    const executionMode = detail.execution_mode;
    if (!['chat', 'bot'].includes(executionMode)) return null;
    const botTasksByConversationId = executionMode === 'bot'
      ? (Array.isArray(detail.tasks) ? detail.tasks : []).reduce((groups, task) => {
        const conversationId = task?.conversation_id;
        if (!conversationId) throw new Error('Bot task summary is missing conversation_id.');
        const tasks = groups.get(conversationId) || [];
        tasks.push(task);
        groups.set(conversationId, tasks);
        return groups;
      }, new Map())
      : null;
    if (botTasksByConversationId) {
      const conversationIds = new Set(
        (Array.isArray(detail.conversations) ? detail.conversations : [])
          .map((conversation) => conversation?.conversation_id)
          .filter(Boolean),
      );
      for (const conversationId of botTasksByConversationId.keys()) {
        if (!conversationIds.has(conversationId)) {
          throw new Error('Bot task summary references a conversation outside its project.');
        }
      }
    }
    const isDefault = Boolean(detail.is_default);
    return {
      id: projectId,
      type: isDefault ? 'system' : 'custom',
      executionMode,
      name: detail.name || (isDefault ? DEFAULT_PROJECT_NAME : projectNameFromPath(detail.workspace_path)),
      workspacePath: detail.workspace_path || null,
      workspaceLabel: detail.workspace_path ? (detail.name || projectNameFromPath(detail.workspace_path)) : null,
      removable: !isDefault,
      createdAt: detail.created_at || null,
      updatedAt: detail.updated_at || null,
      userExpanded: typeof previousProject?.userExpanded === 'boolean' ? previousProject.userExpanded : undefined,
      chatConversationsExpanded: Boolean(previousProject?.chatConversationsExpanded),
      workflowTasksExpanded: Boolean(previousProject?.workflowTasksExpanded),
      hiddenModes: previousProject?.hiddenModes || [],
      pinned: Boolean(detail.pinned),
      sortOrder: typeof detail.sort_order === 'number' ? detail.sort_order : 0,
      conversations: (detail.conversations || []).map((conversation) => {
        if (conversation.execution_mode !== executionMode) {
          throw new Error('Project and conversation execution_mode mismatch.');
        }
        const directoryConversation = executionMode === 'bot'
          ? {
              ...conversation,
              tasks: botTasksByConversationId.get(conversation.conversation_id) || [],
            }
          : conversation;
        return conversationDetailToWorkspaceConversation(
          directoryConversation,
          previousConversations.get(conversation.conversation_id),
          mapTask,
        );
      }),
    };
  }).filter(Boolean);
  const activeConversationExists = projects.some((project) => (
    project.conversations.some((conversation) => conversation.id === previous.activeConversationId)
  ));
  const fallbackProject = projects.find((project) => project.conversations.length > 0) || projects[0];
  const activeConversationId = activeConversationExists
    ? previous.activeConversationId
    : fallbackProject?.conversations[0]?.id || null;
  const activeProject = projects.find((project) => (
    project.conversations.some((conversation) => conversation.id === activeConversationId)
  )) || fallbackProject;
  return normalizeWorkspaceOrdering({
    projects,
    activeProjectId: activeProject?.id || defaultProjectIdForMode('chat'),
    activeConversationId,
  });
}

export function replaceWorkspaceModeFromProjects(
  executionMode,
  projectDetails,
  previousState,
  mapTask = (task) => task,
  activeDraft = null,
) {
  if (executionMode !== 'chat' && executionMode !== 'bot') {
    throw new Error('Workspace execution mode must be chat or bot.');
  }
  const details = Array.isArray(projectDetails) ? projectDetails : [];
  if (details.some((project) => project?.execution_mode !== executionMode)) {
    throw new Error('Project response execution_mode does not match the requested mode.');
  }
  const previous = previousState || createEmptyWorkspaceState();
  const refreshedMode = buildWorkspaceStateFromProjects(details, previous, mapTask);
  const preservedProjects = previous.projects.filter(
    (project) => project.executionMode !== executionMode,
  );
  const activeProject = previous.projects.find(
    (project) => project.id === previous.activeProjectId,
  );
  const draftProject = activeDraft?.executionMode === executionMode
    ? refreshedMode.projects.find((project) => project.id === activeDraft.projectId)
    : null;
  const preserveActiveSelection = Boolean(
    activeProject && activeProject.executionMode !== executionMode,
  );
  return normalizeWorkspaceOrdering({
    projects: [...preservedProjects, ...refreshedMode.projects],
    activeProjectId: draftProject?.id
      || (preserveActiveSelection ? previous.activeProjectId : refreshedMode.activeProjectId),
    activeConversationId: draftProject
      ? null
      : (preserveActiveSelection ? previous.activeConversationId : refreshedMode.activeConversationId),
  });
}

export function workspaceStateWithConversationDetail(
  state,
  detail,
  activate = true,
  mapTask = (task) => task,
) {
  const workspacePath = String(detail?.workspace_path || '').trim();
  const projectId = detail?.project_id;
  if (!projectId) throw new Error('Conversation project_id is required.');
  const projectLabel = detail?.workspace_label || projectNameFromPath(workspacePath);
  let projectFound = false;
  let conversationFound = false;
  const projects = state.projects.map((project) => {
    if (project.id !== projectId) return project;
    projectFound = true;
    const conversations = project.conversations.map((conversation) => {
      if (conversation.id !== detail.conversation_id) return conversation;
      conversationFound = true;
      const merged = conversationDetailToWorkspaceConversation(detail, conversation, mapTask);
      return activate ? { ...merged, userExpanded: false } : merged;
    });
    return {
      ...project,
      workspacePath: project.type === 'system' ? null : workspacePath,
      workspaceLabel: project.type === 'system' ? null : projectLabel,
      userExpanded: activate ? true : project.userExpanded,
      hiddenModes: activate
        ? (project.hiddenModes || []).filter(
            (mode) => mode !== (detail.execution_mode === 'bot' ? 'bot' : 'chat'),
          )
        : (project.hiddenModes || []),
      conversations: conversationFound
        ? conversations
        : [
            (() => {
              const fresh = conversationDetailToWorkspaceConversation(detail, null, mapTask);
              return activate ? { ...fresh, userExpanded: false } : fresh;
            })(),
            ...conversations,
          ],
    };
  });
  if (!projectFound) {
    projects.push({
      id: projectId,
      type: 'custom',
      executionMode: detail.execution_mode,
      name: projectLabel,
      workspacePath,
      workspaceLabel: projectLabel,
      removable: true,
      createdAt: detail.created_at || new Date().toISOString(),
      updatedAt: detail.updated_at || detail.last_message_at || new Date().toISOString(),
      userExpanded: activate ? true : undefined,
      chatConversationsExpanded: false,
      workflowTasksExpanded: false,
      hiddenModes: [],
      conversations: [
        (() => {
          const fresh = conversationDetailToWorkspaceConversation(detail, null, mapTask);
          return activate ? { ...fresh, userExpanded: false } : fresh;
        })(),
      ],
    });
  }
  return normalizeWorkspaceOrdering({
    projects,
    activeProjectId: activate ? projectId : state.activeProjectId,
    activeConversationId: activate ? detail.conversation_id : state.activeConversationId,
  });
}

export function workspaceStateWithTouchedConversation(state, conversationId, patch = {}) {
  if (!conversationId) return normalizeWorkspaceOrdering(state);
  const now = Date.now();
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  let nextActiveProjectId = state.activeProjectId;
  const projects = state.projects.map((project) => {
    const hasConversation = project.conversations.some((conversation) => conversation.id === conversationId);
    if (hasConversation) nextActiveProjectId = project.id;
    return {
      ...project,
      updatedAt: hasConversation ? now : project.updatedAt,
      conversations: project.conversations.map((conversation) => (
        conversation.id === conversationId
          ? {
              ...conversation,
              ...definedPatch,
              tasks: Array.isArray(definedPatch.tasks) ? definedPatch.tasks : (Array.isArray(conversation.tasks) ? conversation.tasks : []),
              updatedAt: now,
            }
          : conversation
      )),
    };
  });
  return normalizeWorkspaceOrdering({
    ...state,
    projects,
    activeProjectId: nextActiveProjectId,
    activeConversationId: conversationId,
  });
}

export function workspaceStateWithConversationRuntimeTask(state, conversationId, nextTask) {
  const taskKey = nextTask?.taskId || nextTask?.id;
  if (!conversationId || !taskKey) return state;
  const taskTimestamp = taskUpdatedTimestamp(nextTask) || Date.now();
  let updated = false;
  const projects = state.projects.map((project) => {
    let projectTouched = false;
    const conversations = project.conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      projectTouched = true;
      const tasks = Array.isArray(conversation.tasks) ? conversation.tasks : [];
      let found = false;
      const nextTasks = tasks.map((task) => {
        const currentKey = task?.taskId || task?.id;
        if (currentKey !== taskKey) return task;
        found = true;
        updated = true;
        return { ...task, ...nextTask };
      });
      if (!found) {
        updated = true;
        nextTasks.push(nextTask);
      }
      return {
        ...conversation,
        tasks: nextTasks,
        updatedAt: Math.max(timestampValue(conversation.updatedAt), taskTimestamp),
      };
    });
    return {
      ...project,
      updatedAt: projectTouched ? Math.max(timestampValue(project.updatedAt), taskTimestamp) : project.updatedAt,
      conversations,
    };
  });
  return updated ? normalizeWorkspaceOrdering({ ...state, projects }) : state;
}

export function mergeConversationTasks(directoryTasks, runtimeTasks) {
  const runtimeById = new Map(
    (Array.isArray(runtimeTasks) ? runtimeTasks : [])
      .map((task) => [task?.taskId || task?.task_id || task?.id, task])
      .filter(([taskId]) => Boolean(taskId)),
  );
  const merged = (Array.isArray(directoryTasks) ? directoryTasks : []).map((task) => {
    const taskId = task?.taskId || task?.task_id || task?.id;
    const runtimeTask = runtimeById.get(taskId);
    if (!runtimeTask) return task;
    runtimeById.delete(taskId);
    return { ...task, ...runtimeTask };
  });
  return [...merged, ...runtimeById.values()];
}

export function findProjectByConversationId(state, conversationId) {
  return state.projects.find((project) => (
    project.conversations.some((conversation) => conversation.id === conversationId)
  )) || null;
}

export function findConversationById(state, conversationId) {
  for (const project of state.projects || []) {
    const conversation = (project.conversations || []).find((item) => item.id === conversationId);
    if (conversation) return conversation;
  }
  return null;
}
