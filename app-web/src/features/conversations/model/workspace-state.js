import { stripChatImageAugmentation } from '../../chat/model/chat-text.js';
import { API_BASE } from '../../../shared/api/base.js';
import {
  WORKSPACE_STORAGE_KEY,
  CONVERSATION_STORAGE_KEY,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  DEFAULT_SESSION_NAME,
  DEFAULT_CONVERSATION_NAMES,
  buildUserScopedStorageKey,
} from '../../../shared/api/auth.js';

export function generateHexId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

export function getStoredConversationId() {
  const key = buildUserScopedStorageKey(CONVERSATION_STORAGE_KEY);
  return String(window.localStorage.getItem(key) || '').trim() || null;
}

export function setStoredConversationId(conversationId) {
  const key = buildUserScopedStorageKey(CONVERSATION_STORAGE_KEY);
  if (!conversationId) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, conversationId);
}

export function createDefaultProject() {
  return {
    id: DEFAULT_PROJECT_ID,
    type: 'system',
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
    projects: [createDefaultProject()],
    activeProjectId: DEFAULT_PROJECT_ID,
    activeConversationId: null,
  };
}

function parseStoredWorkspaceState(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    const defaultProject = createDefaultProject();
    const projectsById = new Map(parsed.projects.map((project) => [project.id, project]));
    // Preserve the saved project order (manual drag). Only inject Default when
    // missing — never force it back to the top after the user moved it.
    const orderedProjects = parsed.projects.filter((project) => project?.id);
    if (!projectsById.has(DEFAULT_PROJECT_ID)) {
      orderedProjects.unshift(defaultProject);
    }
    const projects = orderedProjects.map((project) => {
      const isDefault = project.id === DEFAULT_PROJECT_ID;
      return {
        ...project,
        type: isDefault ? 'system' : 'custom',
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
      activeProjectId: parsed.activeProjectId || DEFAULT_PROJECT_ID,
      activeConversationId: parsed.activeConversationId || getStoredConversationId(),
    });
  } catch (error) {
    console.warn('Failed to load workspace state:', error);
    return null;
  }
}

export function loadStoredWorkspaceState() {
  const key = buildUserScopedStorageKey(WORKSPACE_STORAGE_KEY);
  return parseStoredWorkspaceState(window.localStorage.getItem(key)) || createEmptyWorkspaceState();
}

export function loadLegacyWorkspaceState() {
  return parseStoredWorkspaceState(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
}

export function filterWorkspaceStateByConversationIds(state, conversationIds) {
  if (!state) return null;
  const allowed = new Set(conversationIds);
  const projects = state.projects
    .map((project) => ({
      ...project,
      conversations: project.conversations.filter((conversation) => allowed.has(conversation.id)),
    }))
    .filter((project) => project.id === DEFAULT_PROJECT_ID || project.conversations.length > 0);
  if (!projects.some((project) => project.conversations.length > 0)) return null;
  return normalizeWorkspaceOrdering({
    ...state,
    projects,
    activeConversationId: allowed.has(state.activeConversationId) ? state.activeConversationId : null,
  });
}

export function legacyWorkspaceMigrationCompleted() {
  const key = buildUserScopedStorageKey(`${WORKSPACE_STORAGE_KEY}:legacy-migrated-v1`);
  return window.localStorage.getItem(key) === '1';
}

export function markLegacyWorkspaceMigrationCompleted() {
  const key = buildUserScopedStorageKey(`${WORKSPACE_STORAGE_KEY}:legacy-migrated-v1`);
  window.localStorage.setItem(key, '1');
}

export function saveWorkspaceState(state) {
  try {
    window.localStorage.setItem(
      buildUserScopedStorageKey(WORKSPACE_STORAGE_KEY),
      JSON.stringify(compactWorkspaceStateForStorage(state)),
    );
  } catch (error) {
    console.warn('Failed to save workspace state:', error);
  }
}

export function compactWorkspaceStateForStorage(state) {
  return {
    activeProjectId: state?.activeProjectId || DEFAULT_PROJECT_ID,
    activeConversationId: state?.activeConversationId || null,
    projects: (state?.projects || []).map((project) => ({
      id: project.id,
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

export function removeProjectModeFromWorkspace(state, projectId, executionMode) {
  const mode = executionMode === 'bot' ? 'bot' : 'chat';
  const projects = (state?.projects || []).flatMap((project) => {
    if (project.id !== projectId) return [project];
    const conversations = (project.conversations || []).filter(
      (conversation) => conversation.executionMode !== mode,
    );
    if (conversations.length === 0) return [];
    return [{
      ...project,
      hiddenModes: [...new Set([...(project.hiddenModes || []), mode])],
      conversations,
    }];
  });
  return normalizeWorkspaceOrdering({
    ...state,
    projects,
    activeProjectId: DEFAULT_PROJECT_ID,
    activeConversationId: null,
  });
}

export function projectIdForWorkspacePath(workspacePath) {
  const raw = String(workspacePath || '').trim();
  return raw ? `workspace:${encodeURIComponent(raw)}` : DEFAULT_PROJECT_ID;
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


export function chatImagePreviewUrl(ref, conversationId, ownerId = '') {
  const existing = String(ref?.previewUrl || '').trim();
  if (existing) return existing;
  const path = String(ref?.path || '').trim();
  if (!path || !conversationId) return '';
  if (/^(blob:|data:|https?:|file:)/i.test(path)) return path;
  const params = new URLSearchParams({ image_path: path });
  if (ownerId) params.set('owner_id', ownerId);
  return `${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/messages/images/preview?${params.toString()}`;
}

export function isProtectedChatImagePreviewUrl(value) {
  const url = String(value || '');
  return url.includes('/api/conversations/') && url.includes('/messages/images/preview');
}

export function normalizeChatImageRefs(refs, conversationId, ownerId = '') {
  return (Array.isArray(refs) ? refs : [])
    .filter((ref) => ref && (ref.path || ref.previewUrl))
    .map((ref, index) => {
      const previewUrl = chatImagePreviewUrl(ref, conversationId, ownerId);
      const explicitAuthPreviewUrl = String(ref.authPreviewUrl || '').trim();
      const protectedPreviewUrl = isProtectedChatImagePreviewUrl(previewUrl);
      const authPreviewUrl = explicitAuthPreviewUrl || (protectedPreviewUrl ? previewUrl : '');
      return {
        image_id: ref.image_id || ref.imageId || `image-${index}`,
        path: ref.path || '',
        mime: ref.mime || null,
        previewUrl: protectedPreviewUrl ? '' : previewUrl,
        authPreviewUrl,
      };
    });
}

export function mergeChatImageRefValue(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    image_id: incoming.image_id || incoming.imageId || existing.image_id || existing.imageId,
    path: incoming.path || existing.path || '',
    mime: incoming.mime || existing.mime || null,
    previewUrl: incoming.previewUrl || existing.previewUrl || '',
    authPreviewUrl: incoming.authPreviewUrl || existing.authPreviewUrl || '',
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

export function chatImageFallbacksByTaskIdFromMessages(messages, conversationId, ownerId = '') {
  const map = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.role !== 'user' || !message.task_id) continue;
    const parsed = stripChatImageAugmentation(message.content);
    if (parsed.imageRefs.length === 0) continue;
    const existing = map.get(message.task_id) || [];
    map.set(
      message.task_id,
      normalizeChatImageRefs(mergeChatImageRefs(existing, parsed.imageRefs), conversationId, ownerId),
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
  // item the user has never touched stays collapsed. This stops the
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
    expanded: project.userExpanded === true,
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
  const activeProjectId = state?.activeProjectId || DEFAULT_PROJECT_ID;
  const activeConversationId = state?.activeConversationId || getStoredConversationId();
  // Backend order is authoritative. The frontend only groups pinned rows
  // ahead of unpinned rows while preserving the relative order returned by
  // the backend. Running state and recent activity never participate in the
  // persisted/display ordering, so temporary runtime state cannot leak into
  // a later drag reorder request.
  const projects = (Array.isArray(state?.projects) ? state.projects : [])
    .map((project) => withDefaultExpansion(project))
    .map((project) => ({
      ...project,
      conversations: [...project.conversations].sort((a, b) => {
        const aPinned = Boolean(a.pinned);
        const bPinned = Boolean(b.pinned);
        if (aPinned && !bPinned) return -1;
        if (bPinned && !aPinned) return 1;
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
    // The backend is authoritative; local values only support old servers.
    pinned: typeof detail.pinned === 'boolean'
      ? detail.pinned
      : Boolean(previousConversation?.pinned),
    sortOrder: typeof detail.sort_order === 'number'
      ? detail.sort_order
      : (previousConversation?.sortOrder ?? 0),
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
    const isDefault = Boolean(detail.is_default) || projectId === DEFAULT_PROJECT_ID;
    return {
      id: projectId,
      type: isDefault ? 'system' : 'custom',
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
      conversations: (detail.conversations || []).map((conversation) => (
        conversationDetailToWorkspaceConversation(
          conversation,
          previousConversations.get(conversation.conversation_id),
          mapTask,
        )
      )),
    };
  }).filter(Boolean);
  if (!projects.some((project) => project.id === DEFAULT_PROJECT_ID)) {
    projects.push(createDefaultProject());
  }
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
    activeProjectId: activeProject?.id || DEFAULT_PROJECT_ID,
    activeConversationId,
  });
}

export function buildWorkspaceStateFromConversationDetails(
  details,
  previousState,
  mapTask = (task) => task,
) {
  const previous = previousState || createEmptyWorkspaceState();
  const previousProjects = new Map(previous.projects.map((project) => [project.id, project]));
  const previousConversations = new Map(
    previous.projects.flatMap((project) => project.conversations.map((conversation) => [conversation.id, conversation]))
  );
  const projectsById = new Map();
  // Seed Default project metadata, but do NOT force it to the front of the
  // rebuilt list — previous.projects order is the user's drag order.
  projectsById.set(DEFAULT_PROJECT_ID, {
    ...(previousProjects.get(DEFAULT_PROJECT_ID) || createDefaultProject()),
    id: DEFAULT_PROJECT_ID,
    type: 'system',
    name: DEFAULT_PROJECT_NAME,
    workspacePath: null,
    workspaceLabel: null,
    removable: false,
    createdAt: previousProjects.get(DEFAULT_PROJECT_ID)?.createdAt || null,
    updatedAt: previousProjects.get(DEFAULT_PROJECT_ID)?.updatedAt || null,
    chatConversationsExpanded: Boolean(previousProjects.get(DEFAULT_PROJECT_ID)?.chatConversationsExpanded),
    workflowTasksExpanded: Boolean(previousProjects.get(DEFAULT_PROJECT_ID)?.workflowTasksExpanded),
    pinned: false,
    sortOrder: 0,
    hiddenModes: previousProjects.get(DEFAULT_PROJECT_ID)?.hiddenModes || [],
    userExpanded: typeof previousProjects.get(DEFAULT_PROJECT_ID)?.userExpanded === 'boolean'
      ? previousProjects.get(DEFAULT_PROJECT_ID).userExpanded
      : undefined,
    conversations: [],
  });

  for (const detail of details) {
    if (!detail?.conversation_id) continue;
    const workspacePath = String(detail.workspace_path || '').trim();
    const projectId = detail.project_id || projectIdForWorkspacePath(workspacePath);
    if (!projectsById.has(projectId)) {
      const previousProject = previousProjects.get(projectId);
      const label = detail.workspace_label || projectNameFromPath(workspacePath);
      projectsById.set(projectId, {
        id: projectId,
        type: 'custom',
        name: previousProject?.name || label,
        workspacePath,
        workspaceLabel: label,
        removable: true,
        createdAt: previousProject?.createdAt || null,
        updatedAt: previousProject?.updatedAt || null,
        userExpanded: typeof previousProject?.userExpanded === 'boolean'
          ? previousProject.userExpanded
          : undefined,
        chatConversationsExpanded: Boolean(previousProject?.chatConversationsExpanded),
        workflowTasksExpanded: Boolean(previousProject?.workflowTasksExpanded),
        pinned: false,
        sortOrder: projectsById.size,
        hiddenModes: previousProject?.hiddenModes || [],
        conversations: [],
      });
    }
    const project = projectsById.get(projectId);
    project.conversations.push(
      conversationDetailToWorkspaceConversation(
        detail,
        previousConversations.get(detail.conversation_id),
        mapTask,
      )
    );
  }

  // Rebuild in previous manual order first, then append any newly discovered
  // projects. Map insertion order alone would always put Default project first.
  const orderedProjects = [];
  const seen = new Set();
  for (const previousProject of previous.projects) {
    const project = projectsById.get(previousProject.id);
    if (!project || seen.has(project.id)) continue;
    if (project.id !== DEFAULT_PROJECT_ID && project.conversations.length === 0) continue;
    orderedProjects.push(project);
    seen.add(project.id);
  }
  for (const project of projectsById.values()) {
    if (seen.has(project.id)) continue;
    if (project.id !== DEFAULT_PROJECT_ID && project.conversations.length === 0) continue;
    orderedProjects.push(project);
    seen.add(project.id);
  }
  // Ensure Default project always exists somewhere in the list.
  if (!seen.has(DEFAULT_PROJECT_ID)) {
    orderedProjects.push(projectsById.get(DEFAULT_PROJECT_ID) || createDefaultProject());
  }
  const projects = orderedProjects;
  const activeConversationExists = projects.some((project) => (
    project.conversations.some((conversation) => conversation.id === previous.activeConversationId)
  ));
  const fallbackProject = projects.find((project) => project.conversations.length > 0) || projects[0] || createDefaultProject();
  const activeConversationId = activeConversationExists
    ? previous.activeConversationId
    : fallbackProject.conversations[0]?.id || null;
  const activeProject = projects.find((project) => (
    project.conversations.some((conversation) => conversation.id === activeConversationId)
  )) || fallbackProject;

  return normalizeWorkspaceOrdering({
    projects,
    activeProjectId: activeProject.id,
    activeConversationId,
  });
}

export function workspaceStateWithConversationDetail(
  state,
  detail,
  activate = true,
  mapTask = (task) => task,
) {
  const workspacePath = String(detail?.workspace_path || '').trim();
  const projectId = detail?.project_id || projectIdForWorkspacePath(workspacePath);
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
      workspacePath: projectId === DEFAULT_PROJECT_ID ? null : workspacePath,
      workspaceLabel: projectId === DEFAULT_PROJECT_ID ? null : projectLabel,
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
      type: projectId === DEFAULT_PROJECT_ID ? 'system' : 'custom',
      name: projectId === DEFAULT_PROJECT_ID ? DEFAULT_PROJECT_NAME : projectLabel,
      workspacePath: projectId === DEFAULT_PROJECT_ID ? null : workspacePath,
      workspaceLabel: projectId === DEFAULT_PROJECT_ID ? null : projectLabel,
      removable: projectId !== DEFAULT_PROJECT_ID,
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
