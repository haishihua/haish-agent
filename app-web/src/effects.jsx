// @haish-esm
import React from 'react';

// Visual effects layer — particles, rings, energy lines

export function FXRing({ x, y }) {
  return <div className="fx-ring" style={{ left: x, top: y }} />;
}
export function FXParticles({ x, y, count = 12, color = 'var(--gold)' }) {
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
// Burst of FX at a point. Auto-removes after 1.5s.
export function useFXBursts() {
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
// ─── Lightweight markdown renderer (no external deps) ──────────────────────
function inlineMarkdown(text) {
  if (!text) return '';
  const out = [];
  // Order matters: code first (greedy quoting), then link `[text](url)`, then bold/italic, then bare URL.
  // Underscore emphasis is intentionally not parsed because it breaks IDs such as mem_408719a58646.
  const re = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|((?:https?|file):\/\/[^\s<>"`)]+)/g;
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
      out.push(<a key={`au-${key++}`} className="md-link" href={m[7]} target="_blank" rel="noopener noreferrer">{m[7]}</a>);
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

// Fenced code open: ```lang / ~~~lang, optional same-line body, optional same-line close.
// Info string keeps common LLM forms such as c++, objective-c.
function matchFenceOpen(line) {
  const text = String(line || '');
  const markerMatch = text.match(/^([`~]{3,})/);
  if (!markerMatch) return null;
  const marker = markerMatch[1];
  const char = marker[0];
  if (![...marker].every((c) => c === char)) return null;

  let rest = text.slice(marker.length);
  // Drop one optional space/tab after the opening fence.
  if (rest.startsWith(' ') || rest.startsWith('\t')) rest = rest.slice(1);

  // Same-line close: ```python code``` or ```code```
  const closeIdx = rest.search(new RegExp(`${char}{${marker.length},}[ \t]*$`));
  let selfClosing = false;
  if (closeIdx >= 0) {
    rest = rest.slice(0, closeIdx).replace(/[ \t]+$/, '');
    selfClosing = true;
  }

  // Info string is the first non-space token; remainder is same-line body.
  let lang = '';
  let firstLine = '';
  if (rest) {
    const infoMatch = rest.match(/^([^\s`~]+)(?:[ \t]+(.*))?$/);
    if (infoMatch) {
      lang = infoMatch[1];
      firstLine = infoMatch[2] || '';
    } else {
      firstLine = rest;
    }
  }

  return {
    marker,
    char,
    length: marker.length,
    lang,
    firstLine,
    selfClosing,
  };
}

function matchFenceClose(line, open) {
  if (!open) return false;
  return new RegExp(`^${open.char}{${open.length},}[ \t]*$`).test(String(line || ''));
}

function renderCodeBlock(codeLines, lang, key) {
  const lines = codeLines.length > 0 ? codeLines : [' '];
  return (
    <pre
      key={key}
      className="md-pre"
      data-lang={lang || undefined}
    >
      {lines.map((codeLine, idx) => (
        <div key={idx} className="md-code-line">
          <span className="md-code-no">{idx + 1}</span>
          <code className="md-code-text">{codeLine || ' '}</code>
        </div>
      ))}
    </pre>
  );
}

// Extract fenced blocks embedded after prose on the same line / in a text chunk,
// e.g. "命中: ```python x = 1```".
function splitTextAndFences(text) {
  const src = String(text || '');
  if (!/[`~]{3,}/.test(src)) return [{ type: 'text', text: src }];

  const segments = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let textBuf = [];
  let i = 0;

  const flushText = () => {
    if (!textBuf.length) return;
    const chunk = textBuf.join('\n');
    textBuf = [];
    if (chunk.length) segments.push({ type: 'text', text: chunk });
  };

  while (i < lines.length) {
    const line = lines[i];
    const openAt = line.search(/[`~]{3,}/);
    if (openAt < 0) {
      textBuf.push(line);
      i += 1;
      continue;
    }

    const prefix = line.slice(0, openAt);
    // Only accept fence after line-start / whitespace / light punctuation so mid-token ``` is ignored.
    if (prefix && !/[\s:：,，;；]$/.test(prefix)) {
      textBuf.push(line);
      i += 1;
      continue;
    }

    const fenceOpen = matchFenceOpen(line.slice(openAt));
    if (!fenceOpen) {
      textBuf.push(line);
      i += 1;
      continue;
    }

    if (prefix.trim()) textBuf.push(prefix.replace(/[ \t]+$/, ''));
    flushText();

    const codeLines = [];
    if (fenceOpen.firstLine) codeLines.push(fenceOpen.firstLine);
    i += 1;
    if (!fenceOpen.selfClosing) {
      while (i < lines.length) {
        const body = lines[i];
        if (matchFenceClose(body.trimStart(), fenceOpen)) {
          i += 1;
          break;
        }
        codeLines.push(body);
        i += 1;
      }
    }
    segments.push({ type: 'code', lang: fenceOpen.lang, lines: codeLines });
  }
  flushText();
  return segments.length ? segments : [{ type: 'text', text: src }];
}

function renderTextSegments(text, state) {
  const segments = splitTextAndFences(text);
  const nodes = [];
  for (const seg of segments) {
    if (seg.type === 'code') {
      nodes.push(renderCodeBlock(seg.lines, seg.lang, `pre-${state.key++}`));
      continue;
    }
    const joined = String(seg.text || '').replace(/\n+/g, ' ').trim();
    if (!joined) continue;
    nodes.push(
      <React.Fragment key={`txt-${state.key++}`}>
        {inlineMarkdown(joined)}
      </React.Fragment>
    );
  }
  return nodes;
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
    return /^(#{1,6}\s|>)/.test(stripped)
      || Boolean(matchFenceOpen(stripped))
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
      // List item text may embed fenced code (LLM often puts ``` inside the item line).
      if (item.content.trim()) {
        children.push(...renderTextSegments(item.content.trim(), state));
      }
      const nested = parseBlocks(i, indent + 2, true);
      children.push(...nested.nodes);
      i = nested.index;
      items.push(children);
    }

    const listKey = `${ordered ? 'ol' : 'ul'}-${state.key++}`;
    const listClass = ordered ? 'md-ol' : 'md-ul';
    const listChildren = items.map((children, idx) => <li key={idx}>{children}</li>);
    return {
      index: i,
      node: ordered
        ? <ol key={listKey} className={listClass} start={start}>{listChildren}</ol>
        : <ul key={listKey} className={listClass}>{listChildren}</ul>,
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

      const fenceOpen = matchFenceOpen(stripped);
      if (fenceOpen) {
        const codeLines = [];
        if (fenceOpen.firstLine) codeLines.push(fenceOpen.firstLine);
        i += 1;
        if (!fenceOpen.selfClosing) {
          while (i < lines.length) {
            // Unclosed fences must not swallow later list items (breaks 1.2.3.4 numbering).
            const bodyList = listMatch(lines[i]);
            if (bodyList && bodyList.indent <= minIndent) break;
            const body = stripColumns(lines[i], minIndent);
            if (matchFenceClose(body, fenceOpen)) {
              i += 1;
              break;
            }
            codeLines.push(body);
            i += 1;
          }
        }
        nodes.push(renderCodeBlock(codeLines, fenceOpen.lang, `pre-${state.key++}`));
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
      i += 1;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !(stopOnOutdent && leadingColumns(lines[i]) < minIndent) &&
        !isBlockStart(lines[i], minIndent) &&
        !(stripColumns(lines[i], minIndent).includes('|') && i + 1 < lines.length && isTableSep(stripColumns(lines[i + 1], minIndent)))
      ) {
        paraLines.push(stripColumns(lines[i], minIndent));
        i += 1;
      }
      const paraText = paraLines.join('\n');
      const segments = splitTextAndFences(paraText);
      const hasCode = segments.some((seg) => seg.type === 'code');
      if (hasCode) {
        // Mixed prose + fence: emit text paragraphs and code blocks separately.
        for (const seg of segments) {
          if (seg.type === 'code') {
            nodes.push(renderCodeBlock(seg.lines, seg.lang, `pre-${state.key++}`));
          } else {
            const joined = String(seg.text || '').replace(/\n+/g, ' ').trim();
            if (joined) {
              nodes.push(<p key={`p-${state.key++}`} className="md-p">{inlineMarkdown(joined)}</p>);
            }
          }
        }
      } else {
        nodes.push(
          <p key={`p-${state.key++}`} className="md-p">
            {inlineMarkdown(paraLines.join(' '))}
          </p>
        );
      }
    }

    return { nodes, index: i };
  };

  return parseBlocks(0, 0, false).nodes;
}

export function Markdown({ source }) {
  const nodes = React.useMemo(() => parseMarkdown(source), [source]);
  return <div className="md-root">{nodes}</div>;
}
export function exportReport(title, md) {
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

export function PixelFrame({ className, children }) {
  return (
    <div className={`hp-frame ${className || ''}`}>
      <span className="hp-frame-bg" aria-hidden="true" />
      <PixelFrameDecorations />
      <div className="hp-frame-content">{children}</div>
    </div>
  );
}
// Hollow Purple result modal
export function HollowPurple({ open, title, result, onClose }) {
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
