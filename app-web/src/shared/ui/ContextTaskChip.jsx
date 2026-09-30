import React from 'react';
import { ClipboardList } from 'lucide-react';
import { PortalTooltip } from './PortalTooltip.jsx';

/**
 * 输入框上的「来源任务」标签：直接复用文件附件芯片（composer-file-chip）的皮，
 * 只换图标与副标题——用户要的就是「标签可以复用文件这种」。
 * 数据形状：{ taskId, title, conversationId }。
 */
export function ContextTaskChip({ task, onClear, disabled = false }) {
  if (!task) return null;
  const taskId = task.taskId || task.task_id || '';
  const name = String(task.title || '').trim() || 'Untitled task';
  return (
    <PortalTooltip text={`Context from task: ${name}`} position="above">
      <span
        className="composer-file-chip is-context-task"
        aria-label={`Context from task ${name}`}
        data-task-id={taskId}
      >
        <span className="composer-file-icon is-ready" aria-hidden="true">
          <ClipboardList size={20} strokeWidth={1.5} />
        </span>
        <span className="composer-file-copy">
          <span className="composer-file-name">{name}</span>
          <span className="composer-file-kind">TASK</span>
        </span>
        {onClear && (
          <button
            type="button"
            className="composer-file-remove"
            onClick={onClear}
            aria-label={`Remove context task ${name}`}
            disabled={disabled}
          >
            ×
          </button>
        )}
      </span>
    </PortalTooltip>
  );
}
