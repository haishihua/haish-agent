// Conversations side panel shell (leaf components live in sibling modules).
import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { ConversationDialog } from './ConversationTaskCards.jsx';
import { ProjectNode, ProjectDropEnd } from './ProjectNode.jsx';
import { AppUpdateFooter } from './AppUpdateFooter.jsx';

const SIDEBAR_TOGGLE_OUTER = 'M11 3H13C16.7712 3 18.6569 3 19.8284 4.17157C21 5.34315 21 7.22876 21 11V13C21 16.7712 21 18.6569 19.8284 19.8284C18.6569 21 16.7712 21 13 21H11C7.2288 21 5.3431 21 4.1716 19.8284C3 18.6569 3 16.7712 3 13V11C3 7.22876 3 5.34315 4.1716 4.17157C5.3431 3 7.2288 3 11 3Z';
const SIDEBAR_TOGGLE_CLOSED = 'M10 5.5 C10 4.793 10 4.439 9.780 4.220 C9.560 4 9.207 4 8.5 4 H8.5 C6.379 4 5.318 4 4.659 4.659 C4 5.318 4 6.379 4 8.5 V15.5 C4 17.621 4 18.682 4.659 19.341 C5.318 20 6.379 20 8.5 20 H8.5 C9.207 20 9.561 20 9.780 19.780 C10 19.561 10 19.207 10 18.5 V5.5 Z';
const SIDEBAR_TOGGLE_OPEN = 'M14 6 C14 5.057 14 4.586 13.707 4.293 C13.414 4 12.943 4 12 4 H10 C7.172 4 5.757 4 4.879 4.879 C4 5.757 4 7.172 4 10 V14 C4 16.828 4 18.243 4.879 19.121 C5.757 20 7.172 20 10 20 H12 C12.943 20 13.414 20 13.707 19.707 C14 19.414 14 18.943 14 18 V6 Z';

function SidebarToggleIcon({ isOpen }) {
  return (
    <svg className="sidebar-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={SIDEBAR_TOGGLE_OUTER}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="sidebar-toggle-icon-panel"
        d={isOpen ? SIDEBAR_TOGGLE_OPEN : SIDEBAR_TOGGLE_CLOSED}
      />
    </svg>
  );
}

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
  onPinConversation,
  onPinProject,
  onReorderConversations,
  onReorderProjects,
  onOpenTaskReport,
  onRetryTask,
  taskPreviewLimit = 5,
  conversationPreviewLimit = 3,
  onToast,
}) {
  const [panelRef, panelWidth] = usePanelWidth();
  const [dialog, setDialog] = React.useState(null);
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

  const panelToggle = (
    <PortalTooltip text={collapsed ? `Expand ${workflowTaskMode ? 'Task' : 'Conversation'}` : `Collapse ${workflowTaskMode ? 'Task' : 'Conversation'}`} position="below">
      <button
        type="button"
        className="conversation-head-action conversation-panel-toggle"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand conversation panel' : 'Collapse conversation panel'}
        aria-expanded={!collapsed}
      >
        <SidebarToggleIcon isOpen={collapsed} />
      </button>
    </PortalTooltip>
  );

  return (
    <div className={`side-panel left conversations-panel${collapsed ? ' is-collapsed' : ''}`} ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      <div className="side-panel-head">
        <div className="conversation-head-primary">
          {collapsed ? panelToggle : <div className="title">{workflowTaskMode ? 'Task' : 'Conversation'}</div>}
        </div>
        {!collapsed ? (
          <div className="conversation-head-actions">
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
            {panelToggle}
          </div>
        ) : null}
      </div>
      <div className="side-panel-body conversations-body" ref={scrollBodyRef} hidden={collapsed}>
        {workspaceState.projects.map((project) => (
          <ProjectNode
            key={project.id}
            project={project}
            workspaceState={workspaceState}
            terminalNotices={terminalNotices}
            taskTerminalNotices={taskTerminalNotices}
            taskPreviewLimit={taskPreviewLimit}
            conversationPreviewLimit={conversationPreviewLimit}
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
            onPinConversation={onPinConversation}
            onPinProject={onPinProject}
            onDropConversation={dropConversation}
            onDropProject={dropProject}
            onOpenTaskReport={onOpenTaskReport}
            onRetryTask={onRetryTask}
          />
        ))}
        <ProjectDropEnd onDropProject={dropProject} />
      </div>
      {!collapsed ? <AppUpdateFooter onToast={onToast} /> : null}
      <ConversationDialog dialog={dialog} onCancel={() => setDialog(null)} />
    </div>
  );
}
