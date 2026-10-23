import React from 'react';
import { autoUpdate, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react';
import { Image as ImageIcon } from 'lucide-react';
import {
  conversationLensTop, conversationLensWindow, conversationMapGeometry, conversationMapNeedsLens,
  conversationTurnPreview, conversationTurnView,
} from '../model/conversation-map.js';

const EMPTY_ENTRIES = [];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function collectTurnEntries(container) {
  const entries = [];
  // The retained previous conversation is hidden, but its nodes are still mounted.
  for (const row of container.querySelectorAll('.chat-message-row.user[data-message-id]')) {
    if (!row.getClientRects().length) continue;
    const id = String(row.dataset.messageId || '');
    if (!id) continue;
    const text = row.querySelector('.chat-bubble-text')?.textContent;
    const files = [...row.querySelectorAll('.chat-message-files .composer-file-name')].map((node) => node.textContent).join(' · ');
    const comments = [...row.querySelectorAll('.haish-sent-annotations .haish-quote-comment')].map((node) => node.textContent);
    const quotes = [...row.querySelectorAll('.haish-sent-annotations .haish-quote-text')].map((node) => (
      [...node.childNodes].filter((child) => !child.classList?.contains('haish-quote-number'))
        .map((child) => child.textContent).join('')
    ));
    // Count attachment slots, not <img>: failed/lost files render a fallback instead.
    const images = [...row.querySelectorAll('.chat-message-images .chat-message-image')].map((node) => {
      const image = node.querySelector('img');
      return { src: image?.getAttribute('src') || image?.currentSrc || '' };
    });
    entries.push({ id, row, ...conversationTurnPreview({ text, comments, quotes, files, images }) });
  }
  return entries;
}

function PreviewThumbnail({ src }) {
  const [failed, setFailed] = React.useState(false);
  return (
    <span className="conversation-map-thumbnail">
      {src && !failed
        ? <img src={src} alt="" width={32} height={32} draggable={false} onError={() => setFailed(true)} />
        : <ImageIcon size={16} strokeWidth={1.5} />}
    </span>
  );
}

// Thin assistant-ui style overview, extended with the approved local lens prototype.
// The lens is transient, not a second scrollbar. No visible instruction/caption.
export function ConversationMap({ scrollRef, entries: sourceEntries = EMPTY_ENTRIES, onNavigate, onReveal }) {
  const [entries, setEntries] = React.useState([]);
  const [activeId, setActiveId] = React.useState('');
  const [visibleIds, setVisibleIds] = React.useState([]);
  const [overflowing, setOverflowing] = React.useState(false);
  const [railHeight, setRailHeight] = React.useState(0);
  const [hoveredId, setHoveredId] = React.useState('');
  const [lens, setLens] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const entriesRef = React.useRef([]);
  const signatureRef = React.useRef('');
  const railRef = React.useRef(null);
  const lensRef = React.useRef(null);
  const tickRefs = React.useRef(new Map());
  const localRefs = React.useRef(new Map());
  const frozenRef = React.useRef(false);
  const wheelTimeRef = React.useRef(0);
  const pressRef = React.useRef(null);
  const hideTimerRef = React.useRef(null);
  const settleRef = React.useRef(0);
  const { refs: previewRefs, floatingStyles, update: updatePreview } = useFloating({
    open: Boolean(hoveredId) && !dragging,
    placement: 'left',
    strategy: 'fixed',
    middleware: [offset(10), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const geometry = conversationMapGeometry(entries.length, railHeight);
  const needsLens = conversationMapNeedsLens(entries.length, railHeight);
  const localLens = needsLens ? lens : null;
  const overview = Array.from({ length: Math.ceil(entries.length / geometry.stride) }, (_, index) => ({
    start: index * geometry.stride,
    end: Math.min(entries.length - 1, (index + 1) * geometry.stride - 1),
  }));
  const start = localLens ? Math.max(0, entries.findIndex((entry) => entry.id === localLens.startId)) : 0;
  const localEntries = localLens ? entries.slice(start, start + localLens.size) : [];

  const cancelHide = React.useCallback(() => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);
  const closePreview = React.useCallback(() => {
    cancelHide();
    frozenRef.current = false;
    setHoveredId('');
    setLens(null);
  }, [cancelHide]);
  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = setTimeout(closePreview, 300);
  };
  const keepPreview = () => {
    cancelHide();
    frozenRef.current = true;
  };
  const cancelJump = React.useCallback(() => {
    cancelAnimationFrame(settleRef.current);
    settleRef.current = 0;
  }, []);

  React.useEffect(() => () => {
    clearTimeout(hideTimerRef.current);
    cancelJump();
  }, [cancelJump]);

  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;
    let frame = 0;
    let viewFrame = 0;
    const refreshView = () => {
      const viewport = container.getBoundingClientRect();
      const turns = entriesRef.current.filter((entry) => entry.row?.isConnected && entry.row.getClientRects().length)
        .map((entry) => ({ id: entry.id, top: entry.row.getBoundingClientRect().top }));
      const atEnd = container.scrollHeight - container.clientHeight - container.scrollTop <= 2;
      const view = conversationTurnView(turns, viewport, atEnd);
      setActiveId((previous) => (previous === view.activeId ? previous : view.activeId));
      setVisibleIds((previous) => (previous.join('|') === view.visibleIds.join('|') ? previous : view.visibleIds));
    };
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setOverflowing(container.scrollHeight > container.clientHeight + 8);
        // Both tracks share the message viewport, with 10px insets at either end.
        setRailHeight(Math.max(0, container.clientHeight - 20));
        const mounted = collectTurnEntries(container);
        const byId = new Map(mounted.map((entry) => [entry.id, entry]));
        const collected = sourceEntries.length ? sourceEntries.map((entry) => ({ ...entry, ...byId.get(entry.id) })) : mounted;
        entriesRef.current = collected;
        const signature = JSON.stringify(collected.map(({ row, ...preview }) => preview));
        if (signature !== signatureRef.current) {
          signatureRef.current = signature;
          setEntries(collected.map(({ row, ...rest }) => rest));
        }
        refreshView();
      });
    };
    const scheduleView = () => {
      cancelAnimationFrame(viewFrame);
      viewFrame = requestAnimationFrame(refreshView);
    };
    const interrupt = () => { cancelJump(); closePreview(); };
    refresh();
    const mutations = new MutationObserver(refresh);
    mutations.observe(container, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'src', 'srcset'] });
    const resize = new ResizeObserver(refresh);
    resize.observe(container);
    container.addEventListener('scroll', scheduleView, { passive: true });
    container.addEventListener('wheel', interrupt, { passive: true });
    container.addEventListener('touchstart', interrupt, { passive: true });
    container.addEventListener('keydown', cancelJump);
    return () => {
      mutations.disconnect();
      resize.disconnect();
      container.removeEventListener('scroll', scheduleView);
      container.removeEventListener('wheel', interrupt);
      container.removeEventListener('touchstart', interrupt);
      container.removeEventListener('keydown', cancelJump);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(viewFrame);
    };
  }, [scrollRef, sourceEntries, cancelJump, closePreview]);

  React.useEffect(() => {
    // A viewport/content size change may cross the density threshold without
    // a window resize. Dismiss the old mode instead of leaving a stale lens.
    closePreview();
  }, [needsLens, closePreview]);

  React.useLayoutEffect(() => {
    // Sparse turns anchor directly to the overview; dense turns use the local row.
    const element = (localLens && localRefs.current.get(hoveredId)) || tickRefs.current.get(hoveredId);
    if (element) previewRefs.setReference(element);
    // The same local button can stay mounted while its fixed lens moves.
    const frame = requestAnimationFrame(updatePreview);
    return () => cancelAnimationFrame(frame);
  }, [hoveredId, localLens, entries, previewRefs, updatePreview]);

  React.useEffect(() => {
    if (!hoveredId) return undefined;
    if (!overflowing || !entries.some((entry) => entry.id === hoveredId)) closePreview();
    const dismissOutside = (event) => {
      if (!event.target.closest?.('.conversation-map, .conversation-map-lens, .conversation-map-card')) closePreview();
    };
    const dismissOnEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      const restoreFocus = document.activeElement?.closest('.conversation-map-lens, .conversation-map-card');
      closePreview();
      if (restoreFocus) {
        frozenRef.current = true;
        tickRefs.current.get(hoveredId)?.focus({ preventScroll: true });
        frozenRef.current = false;
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissOnEscape);
    window.addEventListener('resize', closePreview);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissOnEscape);
      window.removeEventListener('resize', closePreview);
    };
  }, [entries, hoveredId, overflowing, closePreview]);

  React.useEffect(() => {
    const element = lensRef.current;
    if (!element || !localLens) return undefined;
    const browse = (event) => {
      // Native non-passive listener: a trackpad gesture here must not scroll chat.
      event.preventDefault();
      event.stopPropagation();
      keepPreview();
      if (!event.deltaY || performance.now() - wheelTimeRef.current < 65) return;
      wheelTimeRef.current = performance.now();
      // Message replacement can briefly leave the old local window in this commit.
      const size = Math.min(localLens.size, entries.length);
      if (!size) return;
      const nextStart = clamp(start + Math.sign(event.deltaY), 0, entries.length - size);
      const slot = clamp(entries.findIndex((entry) => entry.id === hoveredId) - start, 0, size - 1);
      setLens({ ...localLens, size, startId: entries[nextStart].id });
      setHoveredId(entries[nextStart + slot].id);
    };
    element.addEventListener('wheel', browse, { passive: false });
    return () => element.removeEventListener('wheel', browse);
  });

  const jump = React.useCallback((id) => {
    const container = scrollRef.current;
    if (!container) return;
    onNavigate?.();
    closePreview();
    cancelJump();
    // The full index can point outside the mounted tail. Expand only on navigation.
    onReveal?.(id);
    const started = performance.now();
    let stable = 0;
    let cancelled = false;
    const detach = () => {
      container.removeEventListener('wheel', cancel);
      container.removeEventListener('pointerdown', cancel);
      container.removeEventListener('keydown', cancel);
    };
    const cancel = () => { cancelled = true; detach(); };
    // 用户一接管滚动/键盘，就立刻把落点还给用户，不再和手势抢 scrollTop。
    container.addEventListener('wheel', cancel, { passive: true, once: true });
    container.addEventListener('pointerdown', cancel, { once: true });
    container.addEventListener('keydown', cancel, { once: true });
    const step = () => {
      if (cancelled) return;
      settleRef.current = 0;
      // Window growth can briefly put the reader at its old bottom before layout.
      // Keep follow released until the new target has actually settled.
      onNavigate?.();
      const row = [...container.querySelectorAll('.chat-message-row.user[data-message-id]')]
        .find((node) => node.dataset.messageId === id && node.getClientRects().length);
      if (row) {
        const rect = row.getBoundingClientRect();
        const viewport = container.getBoundingClientRect();
        const desired = container.scrollTop + rect.top - viewport.top - viewport.height / 2 + rect.height / 2;
        const target = clamp(desired, 0, container.scrollHeight - container.clientHeight);
        if (Math.abs(container.scrollTop - target) <= 1) {
          stable += 1;
          if (stable >= 24 && performance.now() - started >= 800) return;
        } else {
          stable = 0;
          container.scrollTo({ top: target, behavior: 'instant' });
        }
      }
      if (performance.now() - started < 3000) settleRef.current = requestAnimationFrame(step);
      else detach();
    };
    step();
  }, [scrollRef, onNavigate, onReveal, closePreview, cancelJump]);

  const openPreview = (id, force = false) => {
    if (pressRef.current?.moved || (frozenRef.current && !force)) return;
    cancelHide();
    const rail = railRef.current;
    const index = entries.findIndex((entry) => entry.id === id);
    if (!rail || index < 0 || (!force && id === hoveredId)) return;
    setHoveredId(id);
    if (!needsLens) {
      setLens(null);
      return;
    }
    const lensWindow = conversationLensWindow(entries.length, index);
    const railBox = rail.getBoundingClientRect();
    const bounds = scrollRef.current.getBoundingClientRect();
    const anchorY = railBox.top + geometry.origin + (index + 0.5) * geometry.step;
    setLens({
      startId: entries[lensWindow.start].id, size: lensWindow.size,
      left: railBox.left - 52,
      top: conversationLensTop(index, lensWindow.start, lensWindow.size, anchorY, bounds),
    });
  };
  const selectLocal = (id) => { keepPreview(); setHoveredId(id); };
  const indexAt = (clientY) => clamp(Math.floor((clientY - railRef.current.getBoundingClientRect().top - geometry.origin) / Math.max(0.01, geometry.step)), 0, entries.length - 1);
  const applyTrackPosition = (clientY) => {
    const rail = railRef.current;
    const container = scrollRef.current;
    if (!rail || !container) return;
    const rect = rail.getBoundingClientRect();
    const ratio = clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    container.scrollTop = ratio * (container.scrollHeight - container.clientHeight);
  };
  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    onNavigate?.();
    cancelJump();
    // Aggregated overview buttons cover a range; the pointer still selects an exact turn.
    pressRef.current = { x: event.clientX, y: event.clientY, moved: false, tickId: entries[indexAt(event.clientY)]?.id };
    try { railRef.current?.setPointerCapture?.(event.pointerId); } catch { /* Synthetic events have no live pointer. */ }
  };
  const handlePointerMove = (event) => {
    const press = pressRef.current;
    if (!press) { openPreview(entries[indexAt(event.clientY)]?.id); return; }
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) {
      press.moved = true;
      setDragging(true);
      closePreview();
    }
    if (press.moved) applyTrackPosition(event.clientY);
  };
  const handlePointerUp = (event) => {
    const press = pressRef.current;
    pressRef.current = null;
    try { railRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* Cancelled or synthetic gesture. */ }
    setDragging(false);
    if (event.type === 'pointerup' && press && !press.moved && press.tickId) jump(press.tickId);
  };
  const handleKeyDown = (event) => {
    if (['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) cancelJump();
    if (event.key === 'Escape') {
      event.preventDefault();
      const returnTo = hoveredId;
      closePreview();
      // Do not reopen on the focus event used only to restore keyboard focus.
      frozenRef.current = true;
      tickRefs.current.get(returnTo)?.focus({ preventScroll: true });
      frozenRef.current = false;
      return;
    }
    if (!entries.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, entries.findIndex((item) => item.id === (hoveredId || activeId)));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
      : clamp(current + (event.key === 'ArrowDown' ? 1 : -1), 0, entries.length - 1);
    const id = entries[next].id;
    if (!localLens || next < start || next >= start + localLens.size) openPreview(id, true);
    else selectLocal(id);
    requestAnimationFrame(() => (localRefs.current.get(id) || tickRefs.current.get(id))?.focus({ preventScroll: true }));
  };

  if (!overflowing || entries.length < 2) return null;
  const visibleSet = new Set(visibleIds);
  const hoveredTick = entries.find((entry) => entry.id === hoveredId);
  return (
    <nav className="conversation-map" data-turn-count={entries.length} aria-label="Conversation turns" onKeyDown={handleKeyDown} onWheel={cancelJump} onMouseLeave={scheduleHide}>
      <div ref={railRef} className={`conversation-map-rail${dragging ? ' is-dragging' : ''}`}
        onMouseEnter={() => { cancelHide(); frozenRef.current = false; }}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        {overview.map((group) => {
          const turns = entries.slice(group.start, group.end + 1);
          const active = turns.find((entry) => entry.id === activeId);
          const tick = active || turns.find((entry) => entry.id === hoveredId) || turns[0];
          return <button key={entries[group.start].id} ref={(node) => {
            for (const entry of turns) {
              if (node) tickRefs.current.set(entry.id, node);
              else tickRefs.current.delete(entry.id);
            }
          }} type="button" data-id={tick.id} data-start-index={group.start} data-end-index={group.end}
            style={{ position: 'absolute', top: geometry.origin + group.start * geometry.step,
              height: (group.end - group.start + 1) * geometry.step, width: '100%' }}
            className={`conversation-map-tick${active ? ' is-active' : ''}${turns.some((entry) => visibleSet.has(entry.id)) ? ' is-visible' : ''}`}
            aria-label={tick.title} aria-current={active ? 'true' : undefined}
            tabIndex={active || (!activeId && group.start === 0) ? 0 : -1}
            onMouseEnter={(event) => openPreview(entries[indexAt(event.clientY)]?.id)} onMouseLeave={scheduleHide}
            onFocus={() => openPreview(tick.id)} onBlur={scheduleHide}
            onClick={(event) => { if (event.detail === 0) jump(tick.id); }} />;
        })}
        {localLens && <span className="conversation-map-range" aria-hidden="true" style={{
          top: geometry.origin + start * geometry.step, height: Math.max(4, localLens.size * geometry.step),
        }} />}
      </div>
      {hoveredTick && !dragging && (
        <FloatingPortal>
          {localLens && <div ref={lensRef} className="conversation-map-lens" role="group" aria-label="Nearby conversation turns"
            style={{ left: localLens.left, top: localLens.top }} onMouseEnter={keepPreview} onMouseLeave={scheduleHide}>
            {localEntries.map((tick) => <button key={tick.id} type="button" data-id={tick.id}
              ref={(node) => {
                if (node) {
                  localRefs.current.set(tick.id, node);
                  if (tick.id === hoveredId) previewRefs.setReference(node);
                } else localRefs.current.delete(tick.id);
              }}
              className={`conversation-map-lens-tick${tick.id === activeId ? ' is-active' : ''}${tick.id === hoveredId ? ' is-hovered' : ''}`}
              aria-label={tick.title} aria-current={tick.id === activeId ? 'true' : undefined} tabIndex={tick.id === hoveredId ? 0 : -1}
              onMouseEnter={() => selectLocal(tick.id)} onFocus={() => selectLocal(tick.id)} onBlur={scheduleHide}
              onClick={() => jump(tick.id)} />)}
          </div>}
          <button ref={previewRefs.setFloating} type="button" className="conversation-map-card"
            style={floatingStyles} data-message-id={hoveredTick.id}
            onMouseEnter={keepPreview} onMouseLeave={scheduleHide} onFocus={keepPreview} onBlur={scheduleHide}
            onClick={() => jump(hoveredTick.id)}>
            {hoveredTick.thumbnails.length > 0 && <span className="conversation-map-thumbnails" aria-hidden="true">
              {hoveredTick.thumbnails.map((src, index) => <PreviewThumbnail key={`${index}:${src}`} src={src} />)}
            </span>}
            <span className="conversation-map-card-text">{hoveredTick.title}</span>
          </button>
        </FloatingPortal>
      )}
    </nav>
  );
}
