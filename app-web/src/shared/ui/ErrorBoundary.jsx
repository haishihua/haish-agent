import React from 'react';
import { ErrorState } from './agent-elements/ErrorState.jsx';

/**
 * Last-resort boundary so a single panel crash does not blank the whole desktop UI.
 * Renders the shared ErrorState (the same red card a failed chat turn uses) full-screen,
 * keeps the raw stack one click away, and keeps the stale-bundle reload detection: a
 * window that still points at chunks a rebuild has removed says "Reload app" instead of
 * "Try again".
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const needsReload = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(String(error?.message || error));
    return (
      <div className="aui-error-screen">
        <div className="aui-error-screen-inner">
          <ErrorState
            className="aui-error-screen-card"
            title={this.props.title || 'UI ERROR'}
            detail={String(error?.message || error)}
            retryLabel={needsReload ? 'Reload app' : 'Try again'}
            retryHint={needsReload ? 'Reload to fetch the current bundle' : 'Re-render the app shell'}
            onRetry={() => {
              if (needsReload) {
                window.location.reload();
                return;
              }
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          />
          <details className="aui-error-screen-stack">
            <summary>Technical details</summary>
            <pre>{String(error?.stack || error?.message || error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
