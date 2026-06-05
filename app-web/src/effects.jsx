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
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    if (m[1]) out.push(<code key={`ic-${key++}`} className="md-icode">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={`b-${key++}`}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={`i-${key++}`}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) out.push(<em key={`u-${key++}`}>{m[4].slice(1, -1)}</em>);
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  if (out.length === 0) return text;
  return out;
}

function parseMarkdown(src) {
  if (!src) return [];
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const nodes = [];
  let i = 0;
  let key = 0;

  const isTableSep = (s) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(s);
  const splitRow = (l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(s => s.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    // Heading
    let m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const level = Math.min(m[1].length, 6);
      nodes.push(React.createElement(`h${level}`, { key: `h-${key++}`, className: `md-h md-h${level}` }, inlineMarkdown(m[2])));
      i++;
      continue;
    }

    // Fenced code block
    m = line.match(/^```(\w*)\s*$/);
    if (m) {
      i++;
      const codeLines = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      nodes.push(
        <pre key={`pre-${key++}`} className="md-pre">
          {codeLines.map((cl, idx) => (
            <div key={idx} className="md-code-line">
              <span className="md-code-no">{idx + 1}</span>
              <code className="md-code-text">{cl || ' '}</code>
            </div>
          ))}
        </pre>
      );
      continue;
    }

    // Blockquote
    if (/^>/.test(line)) {
      const bqLines = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      nodes.push(
        <blockquote key={`bq-${key++}`} className="md-bq">
          {inlineMarkdown(bqLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''));
        i++;
      }
      nodes.push(
        <ul key={`ul-${key++}`} className="md-ul">
          {items.map((it, idx) => <li key={idx}>{inlineMarkdown(it)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      let start = 1;
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\d+)\.\s+(.*)$/);
        if (!itemMatch) break;
        if (items.length === 0) start = Number(itemMatch[1]) || 1;
        items.push(itemMatch[2]);
        i++;
      }
      nodes.push(
        <ol key={`ol-${key++}`} className="md-ol" start={start}>
          {items.map((it, idx) => <li key={idx}>{inlineMarkdown(it)}</li>)}
        </ol>
      );
      continue;
    }

    // GFM table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const headers = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i++;
      }
      nodes.push(
        <table key={`tb-${key++}`} className="md-table">
          <thead>
            <tr>{headers.map((h, idx) => <th key={idx}>{inlineMarkdown(h)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {row.map((c, cIdx) => <td key={cIdx}>{inlineMarkdown(c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }

    // Horizontal rule: --- / *** / ___ (3+, optional leading spaces)
    if (/^[ ]{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push(<hr key={`hr-${key++}`} className="md-hr" />);
      i++;
      continue;
    }

    // Paragraph (gather contiguous non-special lines)
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|>|[-*+]\s|\d+\.\s|```)/.test(lines[i]) &&
      !/^[ ]{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    nodes.push(<p key={`p-${key++}`} className="md-p">{inlineMarkdown(paraLines.join(' '))}</p>);
  }

  return nodes;
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
              关闭
            </button>
            <button type="button" className="iv-btn iv-btn-export" onClick={() => exportReport(title, result)}>
              导出
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
window.HollowPurple = HollowPurple;
