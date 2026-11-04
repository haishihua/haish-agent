// Conversations side panel shell (leaf components live in sibling modules).
import React from 'react';
import { Bell, ListTodo, MessagesSquare } from 'lucide-react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { ConversationDialog } from './ConversationTaskCards.jsx';
import { ProjectNode, ProjectDropEnd } from './ProjectNode.jsx';
import { PREVIEW_PAGE_SIZE } from '../model/list-preview.js';
import { AppUpdateFooter } from './AppUpdateFooter.jsx';
import { ThreadSearch } from './ThreadSearch.jsx';
import { ActivityView } from './ActivityView.jsx';
import { useActivityProjects } from '../hooks/useActivityProjects.js';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';
import { taskDetailToRuntimeTask } from '../../tasks/model/task-runtime.js';

// Chevron direction follows the action; the curved border is shared by both states.
const EDGE_CHEVRON_COLLAPSE = 'M7.15 2.5 3.65 6l3.5 3.5';
const EDGE_CHEVRON_EXPAND = 'M4.85 2.5 8.35 6l-3.5 3.5';

function usePanelWidth() {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () => setWidth(element.offsetWidth || 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function ConversationsPanel({
  workspaceState,
  terminalNotices = {},
  taskTerminalNotices = {},
  activityNotices = {},
  activityOwnerId = '',
  activityOpen: controlledActivityOpen,
  onActivityOpenChange,
  isNewConversationSelected = false,
  onSelectActivity,
  windowFocused = true,
  acknowledgeActiveConversation = true,
  onViewConversationCompletions,
  extensionStyle,
  collapsed = false,
  onToggleCollapsed,
  onAddProject,
  onSelectProject,
  onToggleProject,
  onRemoveProject,
  onAddConversation,
  onSelectConversation,
  onSelectTask,
  onToggleConversationTasks,
  showTaskRecords = true,
  workflowTaskMode = false,
  activeTaskId = null,
  onToggleProjectConversations,
  onDeleteConversation,
  onDeleteTask,
  onRenameConversation,
  onRenameProject,
  onPinConversation,
  onPinProject,
  onReorderConversations,
  onReorderProjects,
  onOpenTaskReport,
  onRetryTask,
  taskPreviewLimit = PREVIEW_PAGE_SIZE,
  conversationPreviewLimit = PREVIEW_PAGE_SIZE,
  onToast,
}) {
  const [panelRef, panelWidth] = usePanelWidth();
  const [dialog, setDialog] = React.useState(null);
  const [uncontrolledActivityOpen, setUncontrolledActivityOpen] = React.useState(false);
  const activityOpen = controlledActivityOpen ?? uncontrolledActivityOpen;
  const toggleActivity = () => {
    const next = !activityOpen;
    if (controlledActivityOpen === undefined) setUncontrolledActivityOpen(next);
    onActivityOpenChange?.(next);
  };
  const activityMode = workflowTaskMode ? 'bot' : 'chat';
  const activity = useActivityProjects(activityOpen && !collapsed, activityOwnerId, activityMode);
  const activityConversationIds = React.useMemo(() => new Set(
    workspaceState.projects.flatMap((project) => (project.conversations || []).map((conversation) => conversation.id)),
  ), [workspaceState.projects]);
  const hasUnreadActivity = Object.values(activityNotices).some((notice) => activityConversationIds.has(notice.conversationId));
  const activeProjectId = workspaceState?.activeProjectId;
  const activeConversationId = workspaceState?.activeConversationId;

  // A background completion may belong to the already-selected conversation.
  // It becomes viewed only when the window returns to the foreground.
  React.useEffect(() => {
    if (!acknowledgeActiveConversation || !windowFocused || !activeConversationId || !terminalNotices[activeConversationId]) return;
    onViewConversationCompletions?.(activeConversationId);
  }, [acknowledgeActiveConversation, activeConversationId, activeProjectId, onViewConversationCompletions, terminalNotices, windowFocused]);

  const selectConversationAndClearNotice = React.useCallback((projectId, conversationId) => {
    if (acknowledgeActiveConversation && conversationId) onViewConversationCompletions?.(conversationId);
    onSelectConversation(projectId, conversationId);
  }, [acknowledgeActiveConversation, onSelectConversation, onViewConversationCompletions]);

  const scrollBodyRef = React.useRef(null);

  // Auto-scroll the project/conversation list while dragging near the
  // top or bottom edge of the scroll container. Uses capture-phase
  // listeners so child stopPropagation() calls don't block it.
  React.useEffect(() => {
    const container = scrollBodyRef.current;
    if (!container) return;
    const EDGE = 48;
    const SPEED = 9;
    let raf = null;
    let direction = 0;
    const step = () => {
      if (direction === 0) { raf = null; return; }
      container.scrollTop += direction * SPEED;
      raf = requestAnimationFrame(step);
    };
    const start = (dir) => {
      if (direction === dir && raf) return;
      direction = dir;
      if (!raf) raf = requestAnimationFrame(step);
    };
    const stop = () => {
      direction = 0;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    };
    const onDragOver = (event) => {
      const rect = container.getBoundingClientRect();
      const y = event.clientY - rect.top;
      if (y < EDGE) start(-1);
      else if (y > rect.height - EDGE) start(1);
      else stop();
    };
    const onDragEnd = () => stop();
    const onDrop = () => stop();
    const onDragLeave = (event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      stop();
    };
    container.addEventListener('dragover', onDragOver, true);
    container.addEventListener('dragend', onDragEnd, true);
    container.addEventListener('drop', onDrop, true);
    container.addEventListener('dragleave', onDragLeave, false);
    return () => {
      container.removeEventListener('dragover', onDragOver, true);
      container.removeEventListener('dragend', onDragEnd, true);
      container.removeEventListener('drop', onDrop, true);
      container.removeEventListener('dragleave', onDragLeave, false);
      stop();
    };
  }, []);

  function dropConversation(projectId, sourceId, targetId, position) {
    if (!sourceId) return;
    if (targetId === null) {
      onReorderConversations?.(projectId, sourceId, null, position || 'after');
    } else if (sourceId !== targetId) {
      onReorderConversations?.(projectId, sourceId, targetId, position || 'before');
    }
  }

  function dropProject(sourceId, targetId, position) {
    if (!sourceId) return;
    if (targetId === null) {
      onReorderProjects?.(sourceId, null, position || 'after');
    } else if (sourceId !== targetId) {
      onReorderProjects?.(sourceId, targetId, position || 'before');
    }
  }

  function requestRenameConversation(project, conversation) {
    setDialog({
      kind: 'rename',
      title: 'Rename conversation',
      value: conversation.name || 'Default Session',
      confirmLabel: 'Rename',
      onConfirm: (nextName) => onRenameConversation(project.id, conversation.id, nextName),
    });
  }

  function requestRenameProject(project) {
    setDialog({
      kind: 'rename',
      title: 'Rename project',
      value: project.name || '',
      confirmLabel: 'Rename',
      onConfirm: (nextName) => onRenameProject(project.id, nextName),
    });
  }

  function requestDeleteConversation(project, conversation) {
    setDialog({
      kind: 'delete',
      title: 'Delete conversation',
      message: `Delete "${conversation.name || 'this conversation'}" and all task records under it?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => onDeleteConversation(project.id, conversation.id),
    });
  }

  function requestDeleteTask(project, conversation, task) {
    setDialog({
      kind: 'delete-task',
      title: 'Delete task',
      message: `Delete "${task?.title || 'this task'}"? Other tasks in this project will not be affected.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => onDeleteTask(project.id, conversation.id, task),
    });
  }

  async function openActivityReport(entry) {
    try {
      const response = await apiFetch(`${API_BASE}/api/tasks/${encodeURIComponent(entry.taskId)}?event_view=runtime`,
        { method: 'GET' }, { json: false });
      if (!response.ok) throw new Error('Could not load task report');
      const detail = await response.json();
      if (detail.task_id !== entry.taskId || detail.conversation_id !== entry.conversation.id) {
        throw new Error('Task report does not match the selected activity');
      }
      onOpenTaskReport?.(taskDetailToRuntimeTask(detail, entry.task));
    } catch (error) {
      onToast?.('error', String(error?.message || error));
    }
  }

  function requestRemoveProject(project) {
    setDialog({
      kind: 'delete-project',
      title: 'Remove project',
      message: `Remove "${project.name || 'this project'}" and all conversations in it? The other mode and local files will not be affected.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => onRemoveProject(project.id),
    });
  }

  const panelName = workflowTaskMode ? 'task' : 'conversation';
  const panelBodyId = React.useId();
  const panelToggle = (
    <PortalTooltip text={collapsed ? 'Expand' : 'Collapse'} position="below">
      <button
        type="button"
        className="conversations-edge-toggle"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? `Expand ${panelName} panel` : `Collapse ${panelName} panel`}
        aria-expanded={!collapsed}
        aria-controls={panelBodyId}
        data-collapsed={collapsed ? '1' : '0'}
      >
        <svg className="conversations-edge-contour" viewBox="0 0 28 88" preserveAspectRatio="none" aria-hidden="true">
          <path d="M28 0 C28 12 24 16 18 20 C8 26 4 31 4 44 C4 57 8 62 18 68 C24 72 28 76 28 88 L28 0 Z" />
          <path className="conversations-edge-contour-line" d="M28 0 C28 12 24 16 18 20 C8 26 4 31 4 44 C4 57 8 62 18 68 C24 72 28 76 28 88" />
        </svg>
        <svg className="conversations-edge-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d={collapsed ? EDGE_CHEVRON_EXPAND : EDGE_CHEVRON_COLLAPSE}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </PortalTooltip>
  );

  return (
    <div className={`side-panel left conversations-panel${collapsed ? ' is-collapsed' : ''}`} ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      {/* 收起时整块表头一起收走：面板只剩 32px 宽的窄条，唯一的入口就是右缘那枚把手。 */}
      {!collapsed ? (
        <div className="side-panel-head">
          <div className="conversation-head-primary">
            <div className="title conversation-brand">
              <span className="conversation-brand-icon" aria-hidden="true">
                {workflowTaskMode ? <ListTodo size={20} strokeWidth={1.75} /> : <MessagesSquare size={20} strokeWidth={1.75} />}
              </span>
              <span>{workflowTaskMode ? 'Task' : 'Conversation'}</span>
            </div>
          </div>
          <div className="conversation-head-actions">
            <PortalTooltip text={activityOpen ? 'Close activity' : 'Activity'} position="below">
              <button type="button" className={`conversation-head-action activity-toggle${activityOpen ? ' is-active' : ''}`}
                onClick={toggleActivity} aria-label={activityOpen ? 'Close activity' : 'Open activity'}
                aria-pressed={activityOpen}>
                <Bell size={16} aria-hidden="true" />
                {hasUnreadActivity ? <span className="activity-toggle-unread" aria-label="Unread activity" /> : null}
              </button>
            </PortalTooltip>
            <PortalTooltip text="Add Project" position="below">
              <button
                type="button"
                className="conversation-head-action"
                onClick={onAddProject}
                aria-label="Add project"
              >
                <span className="ico ico-folder-plus-circle" aria-hidden="true" />
              </button>
            </PortalTooltip>
          </div>
        </div>
      ) : null}
      {panelToggle}
      <div className="side-panel-body conversations-body" data-activity={activityOpen ? '1' : undefined} ref={scrollBodyRef} id={panelBodyId} hidden={collapsed}>
        {activityOpen ? (
          <ActivityView key={activityMode} mode={activityMode} projects={activity.projects} workspaceProjects={workspaceState.projects}
            notices={activityNotices} terminalNotices={terminalNotices} taskTerminalNotices={taskTerminalNotices}
            activeConversationId={activeConversationId} activeTaskId={activeTaskId}
            loading={activity.loading} error={activity.error} onSelect={onSelectActivity}
            onPin={onPinConversation} onDeleteConversation={requestDeleteConversation} onDeleteTask={requestDeleteTask}
            onOpenReport={openActivityReport} isNewConversationSelected={isNewConversationSelected}
            onNewConversation={() => onAddConversation?.(activeProjectId)} />
        ) : (<>
        {/* 两个标签页都有搜索框：会话模式搜会话、任务模式搜任务——同一只组件、同一套
            样式与键盘操作，选中后分别跳对应会话 / 对应任务。 */}
        <ThreadSearch
          projects={workspaceState.projects}
          mode={workflowTaskMode ? 'tasks' : 'conversations'}
          onSelect={selectConversationAndClearNotice}
          onSelectTask={onSelectTask}
        />
        {workspaceState.projects.map((project) => (
          <ProjectNode
            key={project.id}
            project={project}
            workspaceState={workspaceState}
            terminalNotices={terminalNotices}
            taskTerminalNotices={taskTerminalNotices}
            taskPreviewLimit={taskPreviewLimit}
            conversationPreviewLimit={conversationPreviewLimit}
            panelCollapsed={collapsed}
            onSelectProject={onSelectProject}
            onToggleProject={onToggleProject}
            onRemoveProject={requestRemoveProject}
            onAddConversation={onAddConversation}
            onSelectConversation={selectConversationAndClearNotice}
            onSelectTask={onSelectTask}
            showTaskRecords={showTaskRecords}
            workflowTaskMode={workflowTaskMode}
            activeTaskId={activeTaskId}
            onToggleConversationTasks={onToggleConversationTasks}
            onToggleProjectConversations={onToggleProjectConversations}
            onRequestDeleteConversation={requestDeleteConversation}
            onRequestDeleteTask={requestDeleteTask}
            onRequestRenameConversation={requestRenameConversation}
            onRequestRenameProject={requestRenameProject}
            onPinConversation={onPinConversation}
            onPinProject={onPinProject}
            onDropConversation={dropConversation}
            onDropProject={dropProject}
            onOpenTaskReport={onOpenTaskReport}
            onRetryTask={onRetryTask}
          />
        ))}
        <ProjectDropEnd onDropProject={dropProject} />
        </>)}
      </div>
      {!collapsed ? <AppUpdateFooter onToast={onToast} /> : null}
      <ConversationDialog dialog={dialog} onCancel={() => setDialog(null)} />
    </div>
  );
}
