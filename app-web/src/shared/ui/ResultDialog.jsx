import React from 'react';
import { AppIcon } from './AppIcon.jsx';
import { Markdown } from './Markdown.jsx';

function exportReport(title, markdown) {
  const blob = new Blob([markdown || ''], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeTitle = (title || 'report')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'report';

  link.href = url;
  link.download = `${safeTitle}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// 报告对话框：标题行就是任务标题本身（不再有 TASK OUTPUT 那行小标签），动作是底栏三枚
// 图标按钮 —— 关闭 / 以这份产出为上下文开新任务（只在调用方给出 onUseAsContext 时出现，
// 目前只有收工的工作流任务）/ 导出 Markdown；文案走进 title 与 aria-label，按钮本身只有图标。
export function ResultDialog({ open, title, result, onClose, onUseAsContext }) {
  if (!open) return null;

  return (
    <div className="hollow-overlay" onClick={onClose}>
      <div className="hollow-stage" onClick={(event) => event.stopPropagation()}>
        <div className="iv-modal">
          <section className="iv-header">
            <div className="iv-header-inner">
              <div className="iv-title">{title || ''}</div>
            </div>
          </section>
          <section className="iv-body">
            <div className="iv-body-inner">
              <div className="iv-body-scroll">
                <Markdown source={result} />
              </div>
            </div>
          </section>
          <div className="iv-actions">
            <button
              type="button"
              className="iv-btn iv-btn-close"
              title="Close"
              aria-label="Close report"
              onClick={onClose}
            >
              <AppIcon name="close" size={15} />
            </button>
            {onUseAsContext ? (
              <button
                type="button"
                className="iv-btn iv-btn-context"
                title="Use as context for a new task"
                aria-label="Use this task as context for a new task"
                onClick={onUseAsContext}
              >
                <AppIcon name="use-as-context" size={15} />
              </button>
            ) : null}
            <button
              type="button"
              className="iv-btn iv-btn-export"
              title="Export as Markdown"
              aria-label="Export report as Markdown"
              onClick={() => exportReport(title, result)}
            >
              <AppIcon name="download" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
