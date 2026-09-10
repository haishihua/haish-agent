import React from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import { collectConversationMatches, conversationMatchPositions, scrollToConversationMatch } from '../model/conversation-search.js';

export function ConversationSearch({ scrollRef, onSearchChange }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [index, setIndex] = React.useState(0);
  const [hits, setHits] = React.useState([]);
  const [positions, setPositions] = React.useState([]);
  React.useEffect(() => {
    const searching = open && Boolean(query.trim());
    onSearchChange(searching);
    if (!searching) { setHits([]); return undefined; }
    const container = scrollRef.current;
    let frame;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHits(collectConversationMatches(container, query)));
    };
    refresh();
    const observer = new MutationObserver(refresh);
    if (container) observer.observe(container, { childList: true, characterData: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [open, query, scrollRef, onSearchChange]);
  React.useEffect(() => () => onSearchChange(false), [onSearchChange]);
  const active = hits[Math.min(index, hits.length - 1)];
  React.useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!open || !hits.length || !container) { setPositions([]); return undefined; }
    let frame;
    const measure = () => setPositions(conversationMatchPositions(container, hits));
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    // Images, expanded tools and wrapping can change content height without
    // resizing the fixed-height scroll viewport.
    for (const message of container.children) observer.observe(message);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [open, hits, scrollRef]);
  React.useEffect(() => {
    if (!globalThis.CSS?.highlights || !globalThis.Highlight || !hits.length) return undefined;
    CSS.highlights.set('conversation-matches', new Highlight(...hits.map((hit) => hit.range)));
    return () => CSS.highlights.delete('conversation-matches');
  }, [hits]);
  React.useEffect(() => {
    scrollToConversationMatch(scrollRef.current, active?.range);
  }, [active, scrollRef]);
  React.useEffect(() => {
    if (!globalThis.CSS?.highlights || !globalThis.Highlight || !active) return undefined;
    const highlight = new Highlight(active.range);
    highlight.priority = 1;
    CSS.highlights.set('conversation-active-match', highlight);
    return () => CSS.highlights.delete('conversation-active-match');
  }, [active]);
  const step = (delta) => { if (hits.length) setIndex((value) => (Math.min(value, hits.length - 1) + delta + hits.length) % hits.length); };
  const containerRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  React.useEffect(() => {
    const handleFind = (event) => {
      if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'f') return;
      if (!containerRef.current?.closest('.chat-workspace')?.getClientRects().length) return;
      event.preventDefault();
      if (!open) previousFocusRef.current = document.activeElement;
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', handleFind);
    return () => document.removeEventListener('keydown', handleFind);
  }, [open]);
  const close = () => { setOpen(false); setQuery(''); previousFocusRef.current?.focus?.(); };
  return <div ref={containerRef} className="haish-conversation-search" onKeyDown={(event) => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    {open && <div className="haish-conversation-search-panel">
      <div className="haish-search-field">
        <Search size={17} aria-hidden="true" className="haish-search-leading-icon" />
        <input ref={inputRef} autoFocus aria-label="Find in conversation" placeholder="Find in conversation" value={query}
          onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
          }} />
        {query.trim() && <small className="haish-search-count" aria-live="polite">{hits.length ? `${Math.min(index + 1, hits.length)} / ${hits.length}` : '0 matches'}</small>}
        <button type="button" disabled={!hits.length} aria-label="Previous match" onClick={() => step(-1)}><ChevronUp size={16} /></button>
        <button type="button" disabled={!hits.length} aria-label="Next match" onClick={() => step(1)}><ChevronDown size={16} /></button>
        <button type="button" aria-label="Close search" title="Close search" onClick={close}><X size={16} /></button>
      </div>
      {active ? <button type="button" className="haish-search-match-preview" aria-label="Jump to match" onClick={() => scrollToConversationMatch(scrollRef.current, active.range)}>{active.before}<mark>{active.match}</mark>{active.after}</button> : query.trim() && <p>No matches in loaded messages</p>}
    </div>}
    {open && query.trim() && hits.length > 0 && <div className="haish-search-hit-track" role="group" aria-label="Search match locations">
      {positions.map((position, hitIndex) => position !== null && <button
        key={hitIndex}
        type="button"
        className={`haish-search-hit-marker${hits[hitIndex] === active ? ' is-active' : ''}`}
        style={{ top: `${position}%` }}
        aria-label={`Jump to match ${hitIndex + 1} of ${hits.length}`}
        aria-current={hits[hitIndex] === active ? 'true' : undefined}
        tabIndex={hits[hitIndex] === active ? 0 : -1}
        onClick={() => { setIndex(hitIndex); scrollToConversationMatch(scrollRef.current, hits[hitIndex].range); }}
      />)}
    </div>}
  </div>;
}
