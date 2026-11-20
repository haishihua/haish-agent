import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';

const REVEAL = 104;
const OPEN_EVENT = 'haish:settings-swipe-open';

// A swipe reveals an action; it never commits a destructive operation.
export function SettingsSwipeRow({ children, onDelete, label, busy }) {
  const reducedMotion = useReducedMotion();
  const root = useRef(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const close = () => { setOffset(0); setDragging(false); gesture.current = null; };
  useEffect(() => {
    const outside = event => { if (!root.current?.contains(event.target)) close(); };
    const another = event => { if (event.detail !== root.current) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener(OPEN_EVENT, another);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener(OPEN_EVENT, another);
    };
  }, []);
  useEffect(() => { if (busy) close(); }, [busy]);
  const announce = () => document.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: root.current }));
  const remove = () => { close(); onDelete(); };
  const finish = event => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.active) {
      setOffset(event.type !== 'pointercancel' && current.offset <= -36 ? -REVEAL : 0);
      suppressClick.current = true;
    }
    gesture.current = null;
    setDragging(false);
  };
  return <motion.div layout initial={false} exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, scale: 0.98 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} ref={root} className={`settings-swipe-row ${offset < 0 ? 'is-revealed' : ''}`} onKeyDown={event => {
    if (event.key === 'Escape') { close(); event.stopPropagation(); }
    else if (!busy && event.key === 'ArrowLeft' && event.target.closest('.settings-row-main')) {
      event.preventDefault(); announce(); setOffset(-REVEAL);
    }
  }}>
    <Button className="settings-swipe-action" variant="destructive" tabIndex={offset < 0 ? 0 : -1} aria-hidden={offset === 0} style={{ visibility: offset < 0 ? 'visible' : 'hidden' }} aria-label={label} disabled={busy} onClick={remove}><Trash2 size={18} /><span>{label.startsWith('Uninstall') ? 'Uninstall' : 'Delete'}</span></Button>
    <div className={`settings-swipe-content ${dragging ? 'is-dragging' : ''}`} style={{ transform: `translateX(${offset}px)` }}
      onPointerDown={event => {
        suppressClick.current = false;
        if (busy || event.button !== 0 || event.target.closest('[data-slot="item-actions"]')) return;
        announce();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: offset, offset, active: false };
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (!current.active) {
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { gesture.current = null; return; }
          if (Math.abs(dx) < 8) return;
          current.active = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        current.offset = Math.max(-REVEAL, Math.min(0, current.start + dx));
        setOffset(current.offset);
      }} onPointerUp={finish} onPointerCancel={finish}
      onClickCapture={event => {
        if (suppressClick.current || offset < 0) {
          event.preventDefault(); event.stopPropagation();
          if (!suppressClick.current && !gesture.current) close();
          suppressClick.current = false;
        }
      }}>
      {children}
    </div>
  </motion.div>;
}
