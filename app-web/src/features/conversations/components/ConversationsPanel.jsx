// Conversations side panel shell (leaf components live in sibling modules).
import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { usePanelWidth } from '../../tasks/components/TaskRecords.jsx';
import { ConversationDialog } from './ConversationTaskCards.jsx';
import { ProjectNode, ProjectDropEnd } from './ProjectNode.jsx';
import { AppUpdateFooter } from './AppUpdateFooter.jsx';

export function ConversationsPanel({
  workspaceState,
  now,
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

  const dragSourceIdRef = React.useRef(null);
  const dragProjectSourceRef = React.useRef(null);
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

  function dragStartConversation(projectId, conversationId) {
    dragSourceIdRef.current = conversationId;
  }

  function dragOverConversation(_projectId, _conversationId) {
    // no-op for now; the drop target highlights via ConversationNode local state
  }

  function dropConversation(projectId, sourceId, targetId, position) {
    if (!sourceId) return;
    if (targetId === null) {
      onReorderConversations?.(projectId, sourceId, null, position || 'after');
    } else if (sourceId !== targetId) {
      onReorderConversations?.(projectId, sourceId, targetId, position || 'before');
    }
  }

  function dragEndConversation() {
    dragSourceIdRef.current = null;
  }

  function dragStartProject(projectId) {
    dragProjectSourceRef.current = projectId;
  }

  function dragOverProject(_projectId) {
    // no-op for now; the drop target highlights via ProjectNode local state
  }

  function dropProject(sourceId, targetId, position) {
    if (!sourceId) return;
    if (targetId === null) {
      onReorderProjects?.(sourceId, null, position || 'after');
    } else if (sourceId !== targetId) {
      onReorderProjects?.(sourceId, targetId, position || 'before');
    }
  }

  function dragEndProject() {
    dragProjectSourceRef.current = null;
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
      message: `Remove "${project.name || 'this project'}" from the current mode? Other modes and local files will not be affected.`,
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
        <span
          className={`ico ico-conversation-panel-toggle${collapsed ? ' is-expand' : ''}`}
          aria-hidden="true"
        />
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
            now={now}
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
            onDragStartConversation={dragStartConversation}
            onDragOverConversation={dragOverConversation}
            onDropConversation={dropConversation}
            onDragEndConversation={dragEndConversation}
            onDragStartProject={dragStartProject}
            onDragOverProject={dragOverProject}
            onDropProject={dropProject}
            onDragEndProject={dragEndProject}
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
