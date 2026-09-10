import React from 'react';
import { autoUpdate, flip, FloatingFocusManager, FloatingPortal, inline, offset, shift, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import { QuoteBlock, SelectionToolbar } from '../../../shared/ui/agent-elements/Quote.jsx';
import { annotationError, captureAnnotationSelection, findAnnotationRange } from '../model/message-annotations.js';
import { scrollToConversationMatch } from '../model/conversation-search.js';
import './message-annotations.css';

/** Selection is snapshotted before focus moves into the comment editor. */
export const MessageAnnotations = React.forwardRef(function MessageAnnotations({ listRef, items, drafts, onSave, onError }, ref) {
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
    if (!container) return undefined;
    let frame;
    let dirty = true;
    let located = [];
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (dirty) {
          located = items.map((item) => ({ ...item, range: findAnnotationRange(container, item.item) })).filter((item) => item.range);
          if (globalThis.CSS?.highlights && globalThis.Highlight) CSS.highlights.set('message-annotations', new Highlight(...located.map((item) => item.range)));
          dirty = false;
        }
        const viewport = container.getBoundingClientRect();
        const next = [];
        const occupied = [];
        for (const { item, index, key, range } of located) {
          const rect = [...range.getClientRects()].at(-1);
          if (!rect || rect.bottom < viewport.top + 20 || rect.top > viewport.bottom - 20) continue;
          let top = rect.top - 12;
          let left = Math.min(rect.right + 2, viewport.right - 24);
          while (occupied.some((pos) => Math.abs(pos.top - top) < 20 && Math.abs(pos.left - left) < 20)) {
            top -= 20;
          }
          occupied.push({ top, left });
          next.push({ item, index, key, top, left });
        }
        setMarkers(next);
      });
    };
    const observer = new MutationObserver(() => { dirty = true; refresh(); });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(refresh);
    resize.observe(container);
    // Layout can move when Markdown images or fonts finish loading.
    container.addEventListener('load', refresh, true);
    document.fonts?.addEventListener('loadingdone', refresh);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    refresh();
    return () => {
      observer.disconnect(); resize.disconnect(); cancelAnimationFrame(frame);
      container.removeEventListener('load', refresh, true);
      document.fonts?.removeEventListener('loadingdone', refresh);
      window.removeEventListener('scroll', refresh, true);
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
    if (onSave(item) !== false) { window.getSelection()?.removeAllRanges(); close(); }
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
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
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
