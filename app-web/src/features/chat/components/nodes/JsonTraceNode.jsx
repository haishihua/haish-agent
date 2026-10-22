import React from 'react';

export function ChatJsonBlock({ text, compact = false }) {
  if (!text) return null;
  return <pre className={`chat-json-block ${compact ? 'compact' : ''}`}>{text}</pre>;
}

export function ChatJsonPair({ requestJson, responseJson }) {
  const id = React.useId();
  const segments = [];
  if (requestJson) segments.push({ id: 'request', label: 'Request', text: requestJson });
  if (responseJson) segments.push({ id: 'response', label: 'Response', text: responseJson });
  const [activeId, setActiveId] = React.useState('response');
  const active = segments.find((seg) => seg.id === activeId) || segments[segments.length - 1];
  if (!active) return null;
  return (
    <div className="chat-json-card">
      {segments.length > 1 ? (
        <div className="chat-json-segments" role="tablist" aria-label="Tool data">
          {segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              role="tab"
              id={`${id}-${seg.id}`}
              aria-controls={`${id}-panel`}
              tabIndex={seg.id === active.id ? 0 : -1}
              aria-selected={seg.id === active.id}
              className={`chat-json-segment ${seg.id === active.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(seg.id)}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? segments[0] : event.key === 'End' ? segments.at(-1)
                  : segments.find((segment) => segment.id !== active.id);
                setActiveId(next.id);
                document.getElementById(`${id}-${next.id}`)?.focus();
              }}
            >
              {seg.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-json-card-head">
          <span className="chat-json-card-title">{active.label}</span>
        </div>
      )}
      <pre className="chat-json-card-body" id={`${id}-panel`} role={segments.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={segments.length > 1 ? `${id}-${active.id}` : undefined} tabIndex={0}>
        <JsonText text={active.text} />
      </pre>
    </div>
  );
}

function JsonText({ text }) {
  // Tokenize as text so truncated JSON remains readable and never becomes HTML.
  return String(text).split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b)/g).map((part, index) => {
    const kind = part.startsWith('"') ? (part.trimEnd().endsWith(':') ? 'key' : 'string')
      : /^(?:true|false|null|-?\d)/.test(part) ? 'value' : '';
    return kind ? <span key={index} className={`aui-json-${kind}`}>{part}</span> : part;
  });
}
