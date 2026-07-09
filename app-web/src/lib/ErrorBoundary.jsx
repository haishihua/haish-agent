// @haish-esm
import React from 'react';

/**
 * Lightweight error boundary so a single panel crash does not blank the whole desktop UI.
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
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#05060b',
          color: '#daddef',
          fontFamily: 'ui-monospace, monospace',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 720,
            padding: '24px 28px',
            border: '1px solid rgba(239,191,100,0.28)',
            background: '#10131d',
          }}
        >
          <div style={{ color: '#efbf64', fontSize: 16, marginBottom: 12 }}>
            {this.props.title || 'UI ERROR'}
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {String(error?.stack || error?.message || error)}
          </pre>
          <button
            type="button"
            style={{
              marginTop: 16,
              padding: '8px 14px',
              background: '#1a2133',
              color: '#efbf64',
              border: '1px solid rgba(239,191,100,0.35)',
              cursor: 'pointer',
            }}
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
