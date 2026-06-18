// Visual effects layer — particles, rings, energy lines

function FXRing({ x, y }) {
  return <div className="fx-ring" style={{ left: x, top: y }} />;
}
window.FXRing = FXRing;

function FXParticles({ x, y, count = 12, color = 'var(--gold)' }) {
  const particles = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2;
      const r = 24 + Math.random() * 16;
      return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, d: 0.6 + Math.random() * 0.4 };
    });
  }, [count]);
  return (
    <>
      {particles.map((p, i) => (
        <div key={i} className="fx-particle"
          style={{
            left: x, top: y, background: color, boxShadow: `0 0 8px ${color}`,
            animation: `fx-fly-${i} ${p.d}s ease-out forwards`,
          }} />
      ))}
      <style>{particles.map((p, i) => `
        @keyframes fx-fly-${i} {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(calc(-50% + ${p.dx}px), calc(-50% + ${p.dy}px)) scale(.3); opacity: 0; }
        }
      `).join('\n')}</style>
    </>
  );
}
window.FXParticles = FXParticles;

// Burst of FX at a point. Auto-removes after 1.5s.
function useFXBursts() {
  const [bursts, setBursts] = React.useState([]);
  const fire = React.useCallback((x, y, color) => {
    const id = Math.random().toString(36).slice(2);
    setBursts(b => [...b, { id, x, y, color }]);
    setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 1400);
  }, []);
  const node = (
    <>
      {bursts.map(b => (
        <React.Fragment key={b.id}>
          <FXRing x={b.x} y={b.y} />
          <FXParticles x={b.x} y={b.y} color={b.color || 'var(--gold)'} />
        </React.Fragment>
      ))}
    </>
  );
  return [node, fire];
}
window.useFXBursts = useFXBursts;

// ─── Lightweight markdown renderer (no external deps) ──────────────────────
function inlineMarkdown(text) {
  if (!text) return '';
  const out = [];
  // Order matters: code first (greedy quoting), then link `[text](url)`, then bold/italic, then bare URL.
  const re = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|((?:https?|file):\/\/[^\s<>"`)]+)/g;
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    if (m[1]) {
      out.push(<code key={`ic-${key++}`} className="md-icode">{m[1].slice(1, -1)}</code>);
    } else if (m[2]) {
      out.push(<a key={`a-${key++}`} className="md-link" href={m[4]} target="_blank" rel="noopener noreferrer">{m[3]}</a>);
    } else if (m[5]) {
      out.push(<strong key={`b-${key++}`}>{m[5].slice(2, -2)}</strong>);
    } else if (m[6]) {
      out.push(<em key={`i-${key++}`}>{m[6].slice(1, -1)}</em>);
    } else if (m[7]) {
      out.push(<em key={`u-${key++}`}>{m[7].slice(1, -1)}</em>);
    } else if (m[8]) {
      out.push(<a key={`au-${key++}`} className="md-link" href={m[8]} target="_blank" rel="noopener noreferrer">{m[8]}</a>);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  if (out.length === 0) return text;
  return out;
}

function leadingColumns(line) {
  let columns = 0;
  for (const char of String(line || '')) {
    if (char === ' ') columns += 1;
    else if (char === '\t') columns += 4;
    else break;
  }
  return columns;
}

function stripColumns(line, columns) {
  let remaining = columns;
  let index = 0;
  const text = String(line || '');
  while (index < text.length && remaining > 0) {
    if (text[index] === ' ') remaining -= 1;
    else if (text[index] === '\t') remaining -= 4;
    else break;
    index += 1;
  }
  return text.slice(index);
}

function normalizeMarkdownLines(lines) {
  const output = [];
  for (let i = 0; i < lines.length; i += 1) {
    const markerOnly = lines[i].match(/^([ \t]*)([-*+]|\d+[.)])\s*$/);
    if (!markerOnly) {
      output.push(lines[i]);
      continue;
    }

    let nextIndex = i + 1;
    while (nextIndex < lines.length && lines[nextIndex].trim() === '') nextIndex += 1;
    const nextLine = lines[nextIndex] || '';
    const nextIsList = /^[ \t]*(?:[-*+]|\d+[.)])\s+/.test(nextLine);
    const nextIsBoundary = /^(#{1,6}\s|```|~~~|>|[-*_]{3,}\s*$)/.test(nextLine.trimStart());
    if (nextIndex < lines.length && nextLine.trim() && !nextIsList && !nextIsBoundary) {
      output.push(`${markerOnly[1]}${markerOnly[2]} ${nextLine.trimStart()}`);
      i = nextIndex;
    } else {
      output.push(lines[i]);
    }
  }
  return output;
}

function parseMarkdown(src) {
  if (!src) return [];
  const lines = normalizeMarkdownLines(String(src).replace(/\r\n/g, '\n').split('\n'));
  const state = { key: 0 };
  const isTableSep = (s) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(s);
  const splitRow = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());
  const listMatch = (line) => {
    const match = String(line || '').match(/^([ \t]*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!match) return null;
    const marker = match[2];
    return {
      indent: leadingColumns(match[1]),
      ordered: /^\d/.test(marker),
      start: Number(marker.replace(/\D/g, '')) || 1,
      content: match[3],
    };
  };

  const isBlockStart = (line, minIndent) => {
    if (!line || line.trim() === '') return false;
    const stripped = stripColumns(line, minIndent);
    return /^(#{1,6}\s|>|```|~~~)/.test(stripped)
      || /^[ ]{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(stripped)
      || (listMatch(line) && listMatch(line).indent >= minIndent);
  };

  const parseList = (startIndex, indent, ordered) => {
    const items = [];
    let i = startIndex;
    let start = 1;
    while (i < lines.length) {
      let itemIndex = i;
      while (itemIndex < lines.length && lines[itemIndex].trim() === '') itemIndex += 1;
      const item = listMatch(lines[itemIndex]);
      if (!item || item.indent !== indent || item.ordered !== ordered) break;
      if (items.length === 0) start = item.start;
      i = itemIndex + 1;

      const children = [];
      if (item.content.trim()) {
        children.push(<React.Fragment key={`li-text-${state.key++}`}>{inlineMarkdown(item.content.trim())}</React.Fragment>);
      }
      const nested = parseBlocks(i, indent + 2, true);
      children.push(...nested.nodes);
      i = nested.index;
      items.push(children);
    }

    const Tag = ordered ? 'ol' : 'ul';
    const props = {
      key: `${ordered ? 'ol' : 'ul'}-${state.key++}`,
      className: ordered ? 'md-ol' : 'md-ul',
    };
    if (ordered) props.start = start;
    return {
      index: i,
      node: <Tag {...props}>{items.map((children, idx) => <li key={idx}>{children}</li>)}</Tag>,
    };
  };

  const parseBlocks = (startIndex, minIndent = 0, stopOnOutdent = false) => {
    const nodes = [];
    let i = startIndex;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') { i++; continue; }
      if (stopOnOutdent && leadingColumns(line) < minIndent) break;
      const stripped = stripColumns(line, minIndent);

      let match = stripped.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = Math.min(match[1].length, 6);
        nodes.push(React.createElement(`h${level}`, { key: `h-${state.key++}`, className: `md-h md-h${level}` }, inlineMarkdown(match[2])));
        i++;
        continue;
      }

      match = stripped.match(/^```(\w*)\s*$/);
      if (match) {
        i++;
        const codeLines = [];
        while (i < lines.length && !/^```\s*$/.test(stripColumns(lines[i], minIndent))) {
          codeLines.push(stripColumns(lines[i], minIndent));
          i++;
        }
        i++;
        nodes.push(
          <pre key={`pre-${state.key++}`} className="md-pre">
            {codeLines.map((codeLine, idx) => (
              <div key={idx} className="md-code-line">
                <span className="md-code-no">{idx + 1}</span>
                <code className="md-code-text">{codeLine || ' '}</code>
              </div>
            ))}
          </pre>
        );
        continue;
      }

      if (/^>/.test(stripped)) {
        const bqLines = [];
        while (i < lines.length && /^>/.test(stripColumns(lines[i], minIndent))) {
          bqLines.push(stripColumns(lines[i], minIndent).replace(/^>\s?/, ''));
          i++;
        }
        nodes.push(<blockquote key={`bq-${state.key++}`} className="md-bq">{inlineMarkdown(bqLines.join(' '))}</blockquote>);
        continue;
      }

      const currentList = listMatch(line);
      if (currentList && currentList.indent >= minIndent) {
        const parsed = parseList(i, currentList.indent, currentList.ordered);
        nodes.push(parsed.node);
        i = parsed.index;
        continue;
      }

      if (stripped.includes('|') && i + 1 < lines.length && isTableSep(stripColumns(lines[i + 1], minIndent))) {
        const headers = splitRow(stripped);
        i += 2;
        const rows = [];
        while (i < lines.length && stripColumns(lines[i], minIndent).includes('|') && lines[i].trim() !== '') {
          rows.push(splitRow(stripColumns(lines[i], minIndent)));
          i++;
        }
        nodes.push(
          <table key={`tb-${state.key++}`} className="md-table">
            <thead>
              <tr>{headers.map((header, idx) => <th key={idx}>{inlineMarkdown(header)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => <td key={cellIdx}>{inlineMarkdown(cell)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        );
        continue;
      }

      if (/^[ ]{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(stripped)) {
        nodes.push(<hr key={`hr-${state.key++}`} className="md-hr" />);
        i++;
        continue;
      }

      const paraLines = [stripped];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !(stopOnOutdent && leadingColumns(lines[i]) < minIndent) &&
        !isBlockStart(lines[i], minIndent) &&
        !(stripColumns(lines[i], minIndent).includes('|') && i + 1 < lines.length && isTableSep(stripColumns(lines[i + 1], minIndent)))
      ) {
        paraLines.push(stripColumns(lines[i], minIndent));
        i++;
      }
      nodes.push(<p key={`p-${state.key++}`} className="md-p">{inlineMarkdown(paraLines.join(' '))}</p>);
    }

    return { nodes, index: i };
  };

  return parseBlocks(0, 0, false).nodes;
}

function Markdown({ source }) {
  const nodes = React.useMemo(() => parseMarkdown(source), [source]);
  return <div className="md-root">{nodes}</div>;
}
window.Markdown = Markdown;

function exportReport(title, md) {
  try {
    const blob = new Blob([md || ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safe = (title || 'report').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'report';
    a.download = `${safe}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (e) {
    console.error('Export failed', e);
  }
}
window.exportReport = exportReport;

// Reusable octagonal pixel frame: transparent fill that lets the backdrop
// show through, with explicit edge + corner decorations on top.
function PixelFrameDecorations() {
  return (
    <>
      <span className="hp-edge top" aria-hidden="true" />
      <span className="hp-edge bottom" aria-hidden="true" />
      <span className="hp-edge left" aria-hidden="true" />
      <span className="hp-edge right" aria-hidden="true" />
      <span className="hp-corner tl" aria-hidden="true" />
      <span className="hp-corner tr" aria-hidden="true" />
      <span className="hp-corner bl" aria-hidden="true" />
      <span className="hp-corner br" aria-hidden="true" />
    </>
  );
}

function PixelFrame({ className, children }) {
  return (
    <div className={`hp-frame ${className || ''}`}>
      <span className="hp-frame-bg" aria-hidden="true" />
      <PixelFrameDecorations />
      <div className="hp-frame-content">{children}</div>
    </div>
  );
}
window.PixelFrame = PixelFrame;

// Hollow Purple result modal
function HollowPurple({ open, title, result, onClose }) {
  if (!open) return null;
  return (
    <div className="hollow-overlay" onClick={onClose}>
      <div className="hollow-stage" onClick={e => e.stopPropagation()}>
        <div className="hollow-visual" aria-hidden="true" />
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
            <button type="button" className="iv-btn iv-btn-close" onClick={onClose}>
              Close
            </button>
            <button type="button" className="iv-btn iv-btn-export" onClick={() => exportReport(title, result)}>
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
window.HollowPurple = HollowPurple;
