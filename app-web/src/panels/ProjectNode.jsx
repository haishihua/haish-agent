// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';
import { ConversationAction } from './ConversationIcons.jsx';
import { ConversationNode } from './ConversationNode.jsx';
import { TaskRecordCompact } from './ConversationTaskCards.jsx';
import { useConversationOrderAnimation } from './useConversationOrderAnimation.js';
import { projectCreatedTimestamp, projectWorkflowTasks } from '../lib/workspace-state.js';

function formatProjectCreated(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ConversationDropEnd({ projectId, onDropConversation }) {
  const [dragOver, setDragOver] = React.useState(false);
  return (
    <div
      className={`conversation-drop-end${dragOver ? ' drag-over' : ''}`}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('text/plain')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragOver(false);
      }}
      onDrop={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('text/plain')) return;
        event.preventDefault();
        setDragOver(false);
        const sourceId = event.dataTransfer.getData('text/plain');
        if (sourceId) {
          onDropConversation?.(projectId, sourceId, null, 'after');
        }
      }}
    />
  );
}

export function ProjectNode({
  project,
  workspaceState,
  now,
  terminalNotices,
  taskTerminalNotices,
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
  onRequestDeleteConversation,
  onRequestDeleteTask,
  onRequestRenameConversation,
  onPinConversation,
  onPinProject,
  onDragStartConversation,
  onDragOverConversation,
  onDropConversation,
  onDragEndConversation,
  onDragStartProject,
  onDragOverProject,
  onDropProject,
  onDragEndProject,
  onOpenTaskReport,
  onRetryTask,
  taskPreviewLimit = 5,
  conversationPreviewLimit = 3,
}) {
  const isActiveProject = workspaceState.activeProjectId === project.id;
  const isPinned = Boolean(project.pinned);
  const projectCreated = projectCreatedTimestamp(project);
  const allConversations = Array.isArray(project.conversations) ? project.conversations : [];
  const allWorkflowTasks = workflowTaskMode ? projectWorkflowTasks(project) : [];
  const conversationLimit = Math.max(1, Number(conversationPreviewLimit) || 3);
  const listExpanded = Boolean(workflowTaskMode
    ? project.workflowTasksExpanded
    : project.chatConversationsExpanded);
  const visibleConversations = listExpanded
    ? allConversations
    : allConversations.slice(0, conversationLimit);
  const hiddenConversationCount = Math.max(0, allConversations.length - conversationLimit);
  const taskLimit = Math.max(1, Number(taskPreviewLimit) || 5);
  const visibleWorkflowTasks = listExpanded
    ? allWorkflowTasks
    : allWorkflowTasks.slice(0, taskLimit);
  const hiddenWorkflowTaskCount = Math.max(0, allWorkflowTasks.length - taskLimit);
  const registerConversationNode = useConversationOrderAnimation(visibleConversations);
  const [dropPosition, setDropPosition] = React.useState(null);

  function handleDragStart(event) {
    event.dataTransfer.setData('application/x-project-id', project.id);
    event.dataTransfer.effectAllowed = 'move';
    onDragStartProject?.(project.id);
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const isAfter = (event.clientY - rect.top) > rect.height / 2;
    setDropPosition(isAfter ? 'after' : 'before');
    onDragOverProject?.(project.id);
  }

  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropPosition(null);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData('application/x-project-id');
    const position = dropPosition;
    setDropPosition(null);
    if (sourceId && sourceId !== project.id) {
      onDropProject?.(sourceId, project.id, position);
    }
  }

  function handleDragEnd() {
    setDropPosition(null);
    onDragEndProject?.();
  }

  return (
    <div className={`project-node ${isActiveProject ? 'active' : ''} ${dropPosition ? `drag-over drag-over-${dropPosition}` : ''}`}>
      <div
        role="button"
        tabIndex={0}
        aria-current={isActiveProject ? 'location' : undefined}
        className="project-row"
        draggable={true}
        onClick={() => onSelectProject(project.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectProject(project.id); }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      >
        <button
          type="button"
          className="project-icon-toggle"
          aria-label={project.expanded ? 'Collapse project' : 'Expand project'}
          aria-expanded={project.expanded}
          onClick={(event) => { event.stopPropagation(); onToggleProject(project.id); }}
        >
          <span className={`ico ${project.expanded ? 'ico-folder-open' : 'ico-folder'}`} aria-hidden="true" />
        </button>
        <PortalTooltip
          position="below"
          multiline
          text={(
            <span className="project-tooltip-content">
              <span className="project-tooltip-name">{project.name}</span>
              {project.workspacePath ? <span className="project-tooltip-path">{project.workspacePath}</span> : null}
              {projectCreated ? <span className="project-tooltip-meta">创建于 {formatProjectCreated(projectCreated)}</span> : null}
            </span>
          )}
        >
          <span className="project-name">{project.name}</span>
        </PortalTooltip>
        <span className="conversation-actions">
          <PortalTooltip text={isPinned ? 'Unpin project' : 'Pin project'} position="below">
            <button
              type="button"
              className={`conversation-icon-btn conversation-pin-toggle${isPinned ? ' pinned' : ''}`}
              aria-label={isPinned ? 'Unpin project' : 'Pin project'}
              onClick={(event) => { event.stopPropagation(); onPinProject?.(project.id); }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 17v5"/>
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
              </svg>
            </button>
          </PortalTooltip>
          {!workflowTaskMode ? (
            <ConversationAction
              label="New Conversation"
              icon="multiple"
              tooltipPosition="below"
              onClick={() => {
                if (!project.expanded) onToggleProject(project.id);
                onAddConversation(project.id);
              }}
            />
          ) : null}
          {project.removable && <ConversationAction label="Remove project" icon="trash" tooltipPosition="below" onClick={() => onRemoveProject(project)} />}
        </span>
      </div>

      {project.expanded && (
        <div className="project-conversations">
          {workflowTaskMode ? visibleWorkflowTasks.map(({ task, conversation, conversationId }) => {
            const taskId = task.taskId || task.task_id || task.id;
            const conversationPinned = Boolean(conversation?.pinned);
            return (
              <TaskRecordCompact
                key={taskId}
                task={task}
                active={isActiveProject && taskId === activeTaskId}
                terminalNotice={taskTerminalNotices?.[taskId] || ''}
                onSelect={() => onSelectTask?.(project.id, conversationId, task)}
                showStatusIcon={false}
                actions={(
                  <span className="conversation-actions">
                    <PortalTooltip text={conversationPinned ? 'Unpin conversation' : 'Pin conversation'} position="above">
                      <button
                        type="button"
                        className={`conversation-icon-btn conversation-pin-toggle${conversationPinned ? ' pinned' : ''}`}
                        aria-label={conversationPinned ? 'Unpin conversation' : 'Pin conversation'}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPinConversation?.(project.id, conversationId);
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 17v5" />
                          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
                        </svg>
                      </button>
                    </PortalTooltip>
                    <ConversationAction
                      label="Delete task"
                      icon="trash"
                      onClick={() => onRequestDeleteTask?.(project, conversation, task)}
                    />
                  </span>
                )}
              />
            );
          }) : visibleConversations.map((conversation) => (
            <ConversationNode
              key={conversation.id}
              project={project}
              conversation={conversation}
              active={isActiveProject && workspaceState.activeConversationId === conversation.id}
              nodeRef={(node) => registerConversationNode(conversation.id, node)}
              terminalStatus={terminalNotices?.[conversation.id] || ''}
              now={now}
              taskPreviewLimit={taskPreviewLimit}
              onSelectConversation={onSelectConversation}
              showTaskRecords={showTaskRecords}
              onToggleConversationTasks={onToggleConversationTasks}
              onRequestDeleteConversation={onRequestDeleteConversation}
              onRequestRenameConversation={onRequestRenameConversation}
              onPinConversation={onPinConversation}
              onDragStartConversation={onDragStartConversation}
              onDragOverConversation={onDragOverConversation}
              onDropConversation={onDropConversation}
              onDragEndConversation={onDragEndConversation}
              onOpenTaskReport={onOpenTaskReport}
              onRetryTask={onRetryTask}
            />
          ))}
          {(workflowTaskMode ? hiddenWorkflowTaskCount : hiddenConversationCount) > 0 && (
            <button
              type="button"
              className="conversation-show-more"
              onClick={() => onToggleProjectConversations?.(project.id, workflowTaskMode)}
            >
              {listExpanded
                ? 'Show less'
                : `Show ${workflowTaskMode ? hiddenWorkflowTaskCount : hiddenConversationCount} more`}
            </button>
          )}
          {!workflowTaskMode ? <ConversationDropEnd projectId={project.id} onDropConversation={onDropConversation} /> : null}
        </div>
      )}
    </div>
  );
}

export function ProjectDropEnd({ onDropProject }) {
  const [dragOver, setDragOver] = React.useState(false);
  return (
    <div
      className={`project-drop-end${dragOver ? ' drag-over' : ''}`}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('application/x-project-id')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setDragOver(false);
      }}
      onDrop={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('application/x-project-id')) return;
        event.preventDefault();
        setDragOver(false);
        const sourceId = event.dataTransfer.getData('application/x-project-id');
        if (sourceId) {
          onDropProject?.(sourceId, null, 'after');
        }
      }}
    />
  );
}
