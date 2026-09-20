import React from 'react';
import { autoUpdate, flip, FloatingFocusManager, FloatingPortal, inline, offset, shift, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import { QuoteBlock, SelectionToolbar } from '../../../shared/ui/agent-elements/Quote.jsx';
import { annotationError, annotationRange, annotationRectFitsRow, annotationText, captureAnnotationSelection, findAnnotationRange } from '../model/message-annotations.js';
import { scrollToConversationMatch } from '../model/conversation-search.js';
import './message-annotations.css';

/** Selection is snapshotted before focus moves into the comment editor. */
export const MessageAnnotations = React.forwardRef(function MessageAnnotations({ listRef, items, drafts, onSave, onSaved, onError }, ref) {
  const [selection, setSelection] = React.useState(null);
  const [editor, setEditor] = React.useState(null);
  const [comment, setComment] = React.useState('');
  const [markers, setMarkers] = React.useState([]);
  const inputRef = React.useRef(null);
  const close = React.useCallback(() => { setEditor(null); setSelection(null); }, []);
  const { refs, floatingStyles, context } = useFloating({
    open: Boolean(selection || editor), onOpenChange: (open) => { if (!open) close(); },
    placement: 'top', middleware: [inline(), offset(8), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context, { escapeKey: false });
  const { getFloatingProps } = useInteractions([dismiss]);
  const anchorTo = React.useCallback((range) => {
    refs.setPositionReference({
      getBoundingClientRect: () => range.getBoundingClientRect(),
      getClientRects: () => range.getClientRects(),
      contextElement: range.startContainer.parentElement,
    });
  }, [refs]);
  const edit = React.useCallback((item) => {
    const range = findAnnotationRange(listRef.current, item);
    if (range) { scrollToConversationMatch(listRef.current, range); anchorTo(range); }
    else refs.setPositionReference(document.activeElement);
    setSelection(null);
    setEditor(item);
    setComment(item.comment);
  }, [anchorTo, listRef, refs]);
  const jump = React.useCallback((item) => {
    const range = findAnnotationRange(listRef.current, item);
    if (!range) { onError('The quoted text could not be located in this conversation.'); return; }
    onError('');
    scrollToConversationMatch(listRef.current, range);
    if (globalThis.CSS?.highlights && globalThis.Highlight) CSS.highlights.set('annotation-focus', new Highlight(range));
  }, [listRef, onError]);
  React.useImperativeHandle(ref, () => ({ edit, jump }), [edit, jump]);

  React.useEffect(() => {
    if (editor) return undefined;
    const capture = (event) => {
      if (event.type === 'keyup' && !event.shiftKey) return;
      // Toolbar clicks and focus moves must not replace the saved quote.
      if (refs.floating.current?.contains(event.target)) return;
      const captured = captureAnnotationSelection(listRef.current);
      setSelection(captured);
      if (captured) anchorTo(captured.range);
    };
    document.addEventListener('mouseup', capture);
    document.addEventListener('keyup', capture);
    return () => { document.removeEventListener('mouseup', capture); document.removeEventListener('keyup', capture); };
  }, [editor, listRef, refs, anchorTo]);
  React.useEffect(() => {
    if (!selection && !editor) return undefined;
    const escape = (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); event.stopImmediatePropagation(); close();
    };
    // Do not let dismissing a comment trigger the chat's global Stop shortcut.
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [selection, editor, close]);

  React.useEffect(() => {
    const container = listRef.current;
    if (!container || !items.length) {
      setMarkers((previous) => previous.length ? [] : previous);
      return undefined;
    }
    let frame = null;
    const sources = new Map();
    for (const entry of items) {
      const id = entry.item.source_message_id;
      if (!sources.has(id)) sources.set(id, { source: null, items: [], located: [], dirty: true });
      sources.get(id).items.push(entry);
    }
    const bindSource = (node) => {
      const group = sources.get(node.dataset.annotationSource);
      if (group && group.source !== node) {
        group.source = node;
        group.dirty = true;
      }
    };
    container.querySelectorAll('[data-annotation-source]').forEach(bindSource);
    const refresh = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        let rangesChanged = false;
        for (const group of sources.values()) {
          if (!group.dirty) continue;
          const text = group.source && annotationText(group.source);
          group.located = text ? group.items.map((entry) => ({ ...entry, range: annotationRange(text, entry.item) })).filter((entry) => entry.range) : [];
          group.dirty = false;
          rangesChanged = true;
        }
        const located = [...sources.values()].flatMap((group) => group.located);
        if (rangesChanged && globalThis.CSS?.highlights && globalThis.Highlight) CSS.highlights.set('message-annotations', new Highlight(...located.map((entry) => entry.range)));
        const viewport = container.getBoundingClientRect();
        const next = [];
        const occupied = [];
        for (const { item, index, key, range } of located) {
          const rect = [...range.getClientRects()].at(-1);
          if (!rect || rect.bottom < viewport.top + 20 || rect.top > viewport.bottom - 20) continue;
          // A row skipped by content-visibility keeps its placeholder box while the
          // text inside it still answers with coordinates from an unpainted layout —
          // drawing those lands the marker on an unrelated message. Keep the rect
          // only when it sits inside the row that owns the quote.
          const node = range.startContainer;
          const rowRect = (node.nodeType === 1 ? node : node.parentElement)?.closest('.chat-message-row')?.getBoundingClientRect();
          if (!annotationRectFitsRow(rect, rowRect)) continue;
          let top = rect.top - 12;
          // Marker is position:fixed; keep its viewport coordinates tied to the
          // current range rect after every scroll/layout refresh.
          let left = Math.min(rect.right + 2, viewport.right - 24);
          while (occupied.some((pos) => Math.abs(pos.top - top) < 20 && Math.abs(pos.left - left) < 20)) {
            top -= 20;
          }
          occupied.push({ top, left });
          next.push({ item, index, key, top, left });
        }
        setMarkers((previous) => previous.length === next.length && next.every((marker, index) => {
          const before = previous[index];
          return marker.key === before.key && marker.item === before.item && marker.index === before.index
            && marker.top === before.top && marker.left === before.left;
        }) ? previous : next);
      });
    };
    const observer = new MutationObserver((records) => {
      let layoutChanged = false;
      for (const record of records) {
        for (const group of sources.values()) {
          const source = group.source;
          if (!source) continue;
          // A source can disappear during Markdown replacement, history paging
          // or a conversation switch. Never keep a detached/stale Range alive.
          if (!container.contains(source) || !sources.has(source.dataset.annotationSource)
            || sources.get(source.dataset.annotationSource) !== group) {
            group.source = null;
            group.dirty = true;
            layoutChanged = true;
            continue;
          }
          if (source.contains(record.target)) group.dirty = true;
          // Output *after* an old quote cannot move it, unless scrolling occurs
          // (handled separately). Changes before/inside it can affect layout.
          if (source.contains(record.target) || record.target.contains(source)
            || (source.compareDocumentPosition(record.target) & Node.DOCUMENT_POSITION_PRECEDING)) layoutChanged = true;
        }
        for (const node of record.type === 'attributes' ? [record.target] : record.addedNodes || []) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches('[data-annotation-source]')) bindSource(node);
          node.querySelectorAll('[data-annotation-source]').forEach(bindSource);
        }
      }
      if (layoutChanged || [...sources.values()].some((group) => group.dirty)) refresh();
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-annotation-source'] });
    const resize = new ResizeObserver(refresh);
    resize.observe(container);
    // Layout can move when Markdown images or fonts finish loading.
    container.addEventListener('load', refresh, true);
    // Rows skipped by content-visibility only report real coordinates once the
    // browser renders them again; that flip fires a dedicated, non-bubbling event
    // (captured here), so re-measure right after it.
    container.addEventListener('contentvisibilityautostatechange', refresh, true);
    document.fonts?.addEventListener('loadingdone', refresh);
    window.addEventListener('scroll', refresh, true);
    window.visualViewport?.addEventListener('scroll', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    window.addEventListener('resize', refresh);
    refresh();
    return () => {
      observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame);
      container.removeEventListener('load', refresh, true);
      container.removeEventListener('contentvisibilityautostatechange', refresh, true);
      document.fonts?.removeEventListener('loadingdone', refresh);
      window.removeEventListener('scroll', refresh, true);
      window.visualViewport?.removeEventListener('scroll', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      window.removeEventListener('resize', refresh);
      globalThis.CSS?.highlights?.delete('message-annotations');
      globalThis.CSS?.highlights?.delete('annotation-focus');
    };
  }, [items, listRef]);

  const begin = () => {
    const item = selection?.annotation;
    if (!item) return;
    const error = annotationError([...drafts, item]);
    if (error) { onError(error); close(); return; }
    onError(''); setEditor(item); setComment('');
  };
  const save = () => {
    const item = { ...editor, comment: comment.trim() };
    // 保存成功后通知调用方（聊天里要把光标交回输入框），否则用户还得手动点一下输入框。
    if (onSave(item) !== false) { window.getSelection()?.removeAllRanges(); close(); onSaved?.(); }
  };
  return <FloatingPortal>
    {markers.map(({ item, index, key, top, left }) => <button key={key} type="button" className="haish-annotation-marker"
      style={{ top, left }} title={item.comment || item.text} aria-label={`Comment ${index}: ${item.comment || item.text}`}
      onClick={() => drafts.some((draft) => draft.id === item.id) ? edit(item) : jump(item)}>{index}</button>)}
    {(selection || editor) && <FloatingFocusManager context={context} modal={false} disabled={!editor} initialFocus={inputRef} returnFocus>
      <div ref={refs.setFloating} style={floatingStyles} className="haish-annotation-floating" {...getFloatingProps()}
        role={editor ? 'dialog' : undefined} aria-label={editor ? 'Comment on selected text' : undefined}>
        {editor ? <div className="haish-annotation-editor">
          <QuoteBlock item={{ ...editor, comment: '' }} preview />
          <textarea ref={inputRef} value={comment} maxLength={2000} rows={2} placeholder="Add an optional comment…" aria-label="Optional comment"
            onChange={(event) => setComment(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              // Enter commits the comment like the primary button; Shift+Enter
              // keeps the default newline so the box still takes multi-line text.
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save(); }
            }} />
          <div className="haish-annotation-editor-actions">
            <button type="button" onClick={close}>Cancel</button>
            <button type="button" onClick={save}>{drafts.some((item) => item.id === editor.id) ? 'Save comment' : 'Add to chat'}</button>
          </div>
        </div> : <SelectionToolbar onComment={begin} />}
      </div>
    </FloatingFocusManager>}
  </FloatingPortal>;
});
