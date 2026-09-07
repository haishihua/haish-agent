import React from 'react';

// Highlight received chunks only; preserve whitespace and never replay history.
export function IncrementalText({ text = '', streaming = false }) {
  const source = String(text);
  const [snapshot, setSnapshot] = React.useState(() => ({ text: source, prefix: source, chunks: [] }));
  if (source !== snapshot.text) {
    if (streaming && source.startsWith(snapshot.text)) {
      const now = Date.now();
      const settled = snapshot.chunks.filter((chunk) => now - chunk.at >= 700);
      const recent = snapshot.chunks.filter((chunk) => now - chunk.at < 700);
      setSnapshot({
        text: source,
        prefix: snapshot.prefix + settled.map((chunk) => chunk.text).join(''),
        chunks: [...recent, { text: source.slice(snapshot.text.length), offset: snapshot.text.length, at: now }],
      });
    } else {
      setSnapshot({ text: source, prefix: source, chunks: [] });
    }
  }
  return (
    <span className="chat-timeline-text-body">
      {snapshot.prefix}
      {snapshot.chunks.map((chunk) => (
        <span key={chunk.offset} className="chat-incremental-text">{chunk.text}</span>
      ))}
    </span>
  );
}
