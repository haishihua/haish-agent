import React from 'react';
import { TerminalBlock } from './terminal-block';
import { CodeDiff } from './code-diff';
import './elements.css';

export function TerminalDetail({ view }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const output = ref.current?.querySelector('[data-terminal-output]');
    if (output && view.running) output.scrollTop = output.scrollHeight;
  }, [view.stdout, view.stderr, view.running]);
  const lines = view.stdout ? view.stdout.split('\n') : [];
  return <div ref={ref} className="haish-tool-elements dark">
    <TerminalBlock command={view.command || 'Process output'} cwd={view.cwd}
      lines={lines} visibleCount={lines.length} done={!view.running}
      stderr={view.stderr} exitCode={view.exitCode} failed={view.failed} />
  </div>;
}

export function DiffDetail({ view }) {
  if (view.failed) return <div role="status" className="haish-approval-error">{view.body}</div>;
  const lines = String(view.body || '').split('\n').map((text) => {
    const kind = text.startsWith('+') && !text.startsWith('+++') ? 'added'
      : text.startsWith('-') && !text.startsWith('---') ? 'removed' : 'context';
    return { kind, text: kind === 'context' ? text : text.slice(1) };
  });
  return <div className="haish-tool-elements dark">
    <CodeDiff filename={view.path || 'Changes'} additions={view.added || 0}
      deletions={view.removed || 0} lines={view.body ? lines : []} cycle={0} />
  </div>;
}
