/*!
 * Adapted from assistant-ui JobProgress (MIT), Copyright (c) 2025 AgentbaseAI Inc.
 * https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react/assistant-ui/elements/job-progress.tsx
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import React from 'react';
import { Check, Loader2, X } from 'lucide-react';

export function JobProgress({ title, stages, stageIndex, stageProgress, eta, onCancel, indeterminate = false }) {
  const stage = Math.max(0, Math.min(stages.length, Math.floor(stageIndex)));
  const progress = Math.max(0, Math.min(1, stageProgress || 0));
  const totalWeight = stages.reduce((sum, item) => sum + item.weight, 0) || 1;
  const completed = stages.slice(0, stage).reduce((sum, item) => sum + item.weight, 0);
  const current = stages[stage];
  const overall = 100 * (completed + (current ? current.weight * progress : 0)) / totalWeight;
  const finished = stage >= stages.length;
  return <div data-slot="job-progress" className={`haish-job-progress${finished ? ' is-finished' : ''}`}>
    <div className="haish-job-progress-header">
      {finished ? <Check size={14} /> : <Loader2 size={14} className="haish-job-progress-spinner" />}
      <span className="haish-job-progress-title">{title}</span>
      <span className="haish-job-progress-value" aria-live="polite">{finished ? 'Done' : eta}</span>
      {!finished && onCancel && <button type="button" aria-label="Cancel the job" onClick={onCancel}><X size={14} /></button>}
    </div>
    <span role="progressbar" aria-label={`${title} progress`} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(overall)} aria-valuetext={eta}
      className={`haish-job-progress-track${indeterminate ? ' is-indeterminate' : ''}`}>
      <span style={indeterminate ? undefined : { width: `${overall}%` }} />
    </span>
    <div className="haish-job-progress-stages">
      {stages.map((item, i) => <span key={item.name} className={i === stage ? 'is-current' : i < stage ? 'is-complete' : ''} aria-current={i === stage ? 'step' : undefined}>{item.name}</span>)}
    </div>
  </div>;
}
