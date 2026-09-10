import React from 'react';
import { ChevronRight, Image } from 'lucide-react';
import '../../../../styles/tool-elements.css';

export function VisionToolDetail({ view }) {
  const filename = String(view.mediaPath || '').split(/[\\/]/).filter(Boolean).at(-1);
  const fields = [['Role', view.role], ['System prompt', view.systemPrompt], ['Task', view.task]].filter(([, value]) => value);
  const result = view.failed ? view.error || view.finalText : view.finalText || view.streamAnswerText;
  const progress = !result && view.isRunning ? view.streamLines.map((line) => line.text).join('\n') : '';
  const status = view.failed ? 'Analysis failed' : view.cancelled ? 'Analysis cancelled' : view.isRunning ? 'Analyzing…' : 'Analysis';
  return <section className="aui-vision-detail" aria-label="Image analysis">
    <div className="aui-vision-source">
      <Image size={16} aria-hidden="true" />
      <span className="aui-vision-filename">{filename || 'Image analysis'}</span>
      {view.visionMode && <span className="aui-vision-mode">{view.visionMode}</span>}
    </div>
    {fields.length > 0 && <details className="aui-vision-task">
      <summary><ChevronRight size={13} className="aui-tool-chevron" aria-hidden="true" />Task</summary>
      {fields.map(([label, value]) => <div className="aui-vision-field" key={label}>
        {fields.length > 1 && <div className="aui-vision-label">{label}</div>}
        <div className="aui-vision-prompt" tabIndex={0}>{value}</div>
      </div>)}
    </details>}
    <div className={`aui-vision-result ${view.failed ? 'is-error' : ''}`}>
      <div className="aui-vision-label" role="status">{status}</div>
      {result || progress ? <div className="aui-vision-output" tabIndex={0}>{result || progress}</div>
        : !view.isRunning && !view.failed && !view.cancelled ? <p className="aui-vision-empty">No analysis returned.</p> : null}
    </div>
  </section>;
}
