import React from 'react';
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

export function ResultDialog({ open, title, result, onClose }) {
  if (!open) return null;

  return (
    <div className="hollow-overlay" onClick={onClose}>
      <div className="hollow-stage" onClick={(event) => event.stopPropagation()}>
        <div className="iv-modal">
          <section className="iv-header">
            <div className="iv-header-inner">
              <div className="iv-label">Task Output</div>
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
            <button type="button" className="iv-btn iv-btn-close" onClick={onClose}>Close</button>
            <button
              type="button"
              className="iv-btn iv-btn-export"
              onClick={() => exportReport(title, result)}
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
