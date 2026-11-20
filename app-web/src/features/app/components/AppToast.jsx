import { REDUCED_MOTION_QUERY } from '../../../shared/lib/reduced-motion.js';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animateToastParticles } from './toast-particles.js';
import { X } from 'lucide-react';
import './dissolve-toast.css';

const EXIT_MS = 1150;

/** Actual card-content tiles gather and dissolve; the original owns semantics. */
export function AppToast({ kind = 'info', message, title, description, id, leaving = false, onDismiss }) {
  const card = useRef(null);
  useLayoutEffect(() => card.current ? animateToastParticles(card.current, leaving) : undefined, [leaving, kind, message, title, description]);
  if (!message && !title) return null;
  const text = String(title || message);
  const [heading, ...details] = text.split('\n');
  const subtitle = description || details.join('\n') || (title ? message : '');
  const tone = ['success', 'error', 'warn', 'info'].includes(kind) ? kind : 'info';
  return (
    <div ref={card} data-toast-id={id} className={`app-toast app-toast-${tone}${leaving ? ' is-leaving' : ''}`}>
      <span className="app-toast-icon" aria-hidden="true" />
      <span className="app-toast-message" role="status" aria-live="polite" aria-atomic="true"><span className="app-toast-title">{heading}</span>{subtitle ? <span className="app-toast-description">{subtitle}</span> : null}</span>
      <button type="button" className="app-toast-close" aria-label="Dismiss notification" onClick={onDismiss} disabled={leaving}><X size={14} /></button>
    </div>
  );
}

/** Keep removed cards mounted briefly so timeout and overflow can dissolve. */
export function AppToastStack({ toasts = [], onDismiss }) {
  const stack = useRef(null);
  const positions = useRef(new Map());
  useLayoutEffect(() => {
    const next = new Map();
    for (const element of stack.current?.children || []) {
      const id = element.dataset.toastId;
      const y = element.offsetTop;
      const before = positions.current.get(id);
      next.set(id, y);
      if (before !== undefined && before !== y && !window.matchMedia(REDUCED_MOTION_QUERY).matches) {
        element.getAnimations().forEach(animation => animation.cancel());
        element.animate([{ transform: `translateY(${before - y}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,0,0,1)' });
      }
    }
    positions.current = next;
  });
  const [retained, setRetained] = useState([]);
  const previous = useRef([]);
  const timers = useRef(new Map());
  const current = Array.isArray(toasts) ? toasts.filter(toast => (toast?.message || toast?.title)) : [];
  const signature = current.map(toast => toast.id).join('\u0000');
  useEffect(() => {
    const live = new Set(current.map(toast => toast.id));
    for (const toast of previous.current) {
      if (live.has(toast.id) || timers.current.has(toast.id)) continue;
      setRetained(items => [...items.filter(item => item.id !== toast.id), toast].slice(-3));
      timers.current.set(toast.id, setTimeout(() => {
        timers.current.delete(toast.id);
        setRetained(items => items.filter(item => item.id !== toast.id));
      }, EXIT_MS));
    }
    previous.current = current;
  // Content updates refresh the card snapshot without restarting the exit clock.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => {
    const pending = timers.current;
    return () => { for (const timer of pending.values()) clearTimeout(timer); pending.clear(); };
  }, []);
  const exiting = [...new Map([...retained, ...previous.current].filter(toast => !current.some(item => item.id === toast.id)).map(toast => [toast.id, toast])).values()].slice(-3);
  if (!current.length && !exiting.length) return null;
  return <div ref={stack} className="app-toast-stack">
    {[...exiting, ...current].map(toast => <AppToast key={toast.id} {...toast} leaving={exiting.some(item => item.id === toast.id)} onDismiss={() => onDismiss?.(toast.id)} />)}
  </div>;
}
