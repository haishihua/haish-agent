import { REDUCED_MOTION_QUERY } from '../../../shared/lib/reduced-motion.js';
import React from 'react';
import './history-load-indicator.css';

// Adapted from rs-4/dissolve web/cp/pull.js (MIT).
// Original ring geometry, seeded scatter, gathering and ballistic dust equations.
const TAU = Math.PI * 2;
const clamp = (v) => Math.max(0, Math.min(1, v));
const hash = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const seeds = Array.from({ length: 52 }, (_, i) => [
  i / 52 * TAU, 13 + (hash(i, 1) - 0.5) * 3.2,
  (hash(i, 2) < 0.5 ? -1 : 1) * (24 + hash(i, 3) * 120),
  (hash(i, 4) - 0.5) * 70, 0.72 * i / 52 + 0.28 * hash(i, 5), hash(i, 6),
]);

export function HistoryLoadIndicator({ scrollRef, enabled, resetKey, onRefresh }) {
  const canvasRef = React.useRef(null);
  const latest = React.useRef({ onRefresh });
  latest.current = { onRefresh };
  React.useEffect(() => {
    const list = scrollRef.current;
    const canvas = canvasRef.current;
    if (!list || !canvas || !enabled) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const reduced = window.matchMedia(REDUCED_MOTION_QUERY);
    const originalTranslate = list.style.translate;
    const points = new Float32Array(52 * 4);
    let alive = true, raf = 0, releaseTimer = 0, refreshFrame = 0, refreshTimer = 0;
    let wheelArmedAt = null;
    let raw = 0, pull = 0, target = 0, phase = 'idle', phaseAt = 0;
    let rotation = -Math.PI / 2, last = performance.now(), touchY = null;
    let pointerY = null, pointerId = null, closeAt = -1e9, armed = false;
    let dustY = 0, requesting = false;
    const band = (d) => d < 80 ? d : 80 + (d - 80) * 0.5;
    const kick = () => { if (!raf && alive) raf = requestAnimationFrame(paint); };
    const finish = () => {
      if (!alive) return;
      phase = 'dust'; phaseAt = performance.now(); dustY = Math.max(0, pull - 40);
      target = 0; raw = 0; requesting = false; kick();
    };
    function paint(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      pull += (target - pull) * (reduced.matches ? 1 : Math.min(1, dt * 18));
      if (Math.abs(pull - target) < 0.05) pull = target;
      list.style.translate = pull ? `0 ${pull}px` : originalTranslate;
      const width = canvas.clientWidth, height = canvas.clientHeight;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(canvas).color;
      const since = now - phaseAt, g = Math.min(1, pull / 80);
      const cy = pull < 80 ? pull / 2 : pull - 40, cx = width / 2;
      if (phase === 'idle') rotation = -Math.PI / 2 + pull / 80 * 0.9;
      if (phase === 'spin' && !reduced.matches) rotation += TAU * dt;
      const pulseTime = now - closeAt;
      const pulse = !reduced.matches && pulseTime < 300 ? 1 + 0.16 * Math.sin(Math.PI * pulseTime / 300) : 1;
      for (let i = 0; i < 52; i++) {
        const s = seeds[i], k = i * 4;
        let x, y, alpha, size = 2.7;
        if (phase === 'dust') {
          const t = Math.max(0, since - s[5] * 110) / 1000;
          const dx = points[k] - cx, dy = points[k + 1] - dustY;
          const length = Math.hypot(dx, dy) || 1, push = 30 + s[5] * 90;
          x = points[k] + (dx / length * push + (hash(i, 7) - 0.5) * 40) * t;
          y = points[k + 1] + (dy / length * push - 50 - hash(i, 8) * 60) * t + 490 * t * t;
          const q = clamp((since - s[5] * 110) / 710);
          alpha = points[k + 2] * (1 - q) ** 2;
          size = points[k + 3] * (1 - 0.45 * q);
          if (reduced.matches) alpha = points[k + 2] * (1 - clamp(since / 220));
        } else {
          const angle = s[0] + rotation;
          const radius = s[1] * pulse + (phase === 'spin' && !reduced.matches ? Math.sin(now / 1000 * 3.1 + i * 1.7) * 0.7 : 0);
          const rx = cx + Math.cos(angle) * radius, ry = cy + Math.sin(angle) * radius;
          const gi = clamp((g - s[4] * 0.55) / 0.45), e = 1 - (1 - gi) ** 3;
          const wob = (1 - e) * 3;
          const fx = cx + s[2] + Math.sin(now / 1000 * 1.3 + i) * wob;
          const fy = cy + s[3] + Math.cos(now / 1000 * 1.1 + i * 0.7) * wob;
          x = reduced.matches ? rx : fx + (rx - fx) * e;
          y = reduced.matches ? ry : fy + (ry - fy) * e;
          alpha = (0.12 + 0.83 * e) * Math.min(1, pull / 14);
          size *= 0.55 + 0.45 * e;
          if (phase === 'spin') alpha = 0.22 + 0.78 * (s[0] / TAU) ** 1.6;
          points[k] = x; points[k + 1] = y; points[k + 2] = alpha; points[k + 3] = size;
        }
        if (alpha < 0.003) continue;
        ctx.globalAlpha = clamp(alpha); ctx.beginPath(); ctx.arc(x, y, size / 2, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (phase === 'dust' && since >= 820) { phase = 'idle'; armed = false; }
      if (pull > 0 || target > 0 || phase !== 'idle') kick();
    }
    const advance = (delta) => {
      if (requesting || phase === 'spin' || delta === 0) return;
      if (phase === 'dust') { phase = 'idle'; armed = false; }
      raw = Math.max(0, Math.min(240, raw + delta)); target = band(raw);
      if (!armed && raw >= 80) { armed = true; closeAt = performance.now(); }
      kick();
    };
    const release = async (cancelled = false) => {
      clearTimeout(releaseTimer);
      if (phase === 'spin' || requesting) return;
      if (cancelled || raw < 80) { raw = 0; target = 0; armed = false; kick(); return; }
      phase = 'spin'; phaseAt = performance.now(); target = 80; requesting = true; kick();
      // Let the already scheduled canvas frame paint before React expands history.
      refreshFrame = requestAnimationFrame(() => {
        refreshTimer = setTimeout(async () => {
          if (!alive) return;
          try { await latest.current.onRefresh?.(); } catch { /* ChatPanel owns retry feedback. */ }
          finally { if (alive) releaseTimer = setTimeout(finish, reduced.matches ? 0 : Math.max(0, 700 - (performance.now() - phaseAt))); }
        }, 0);
      });
    };
    const wheel = (event) => {
      if (phase === 'spin' || requesting) return;
      if (list.scrollTop > 1 || (event.deltaY >= 0 && raw === 0)) return;
      if (event.target.closest('pre, textarea, input, [contenteditable="true"]')) return;
      event.preventDefault();
      const delta = -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1);
      advance(delta);
      // Wheel has no release event. Bound the armed wait so momentum cannot
      // postpone loading forever; reversing below threshold still cancels it.
      const now = performance.now();
      if (raw >= 80) wheelArmedAt ??= now;
      else wheelArmedAt = null;
      clearTimeout(releaseTimer);
      const wait = wheelArmedAt === null ? 90 : Math.max(0, Math.min(90, 120 - (now - wheelArmedAt)));
      releaseTimer = setTimeout(() => { wheelArmedAt = null; release(); }, wait);
    };
    const touchStart = (event) => { touchY = event.touches.length === 1 ? event.touches[0].clientY : null; };
    const touchMove = (event) => {
      if (touchY === null || event.touches.length !== 1) return;
      const y = event.touches[0].clientY, delta = y - touchY; touchY = y;
      if (list.scrollTop > 1 || (delta <= 0 && raw === 0)) return;
      if (event.target.closest('pre, textarea, input, [contenteditable="true"]')) return;
      event.preventDefault(); advance(delta);
    };
    const touchEnd = () => { touchY = null; release(); };
    const touchCancel = () => { touchY = null; release(true); };
    const down = (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || list.scrollTop > 1) return;
      if (event.target.closest('button, a, input, textarea, pre, [contenteditable="true"]')) return;
      // Preserve normal text selection; mouse dragging starts only on list whitespace.
      if (event.target !== list && !event.target.classList.contains('chat-row-group')) return;
      pointerY = event.clientY; pointerId = event.pointerId; list.setPointerCapture(pointerId);
    };
    const move = (event) => {
      if (pointerY === null || event.pointerId !== pointerId) return;
      const delta = event.clientY - pointerY; pointerY = event.clientY;
      advance(delta);
    };
    const up = (event) => {
      if (event.pointerId !== pointerId) return;
      pointerY = null; pointerId = null;
      if (list.hasPointerCapture(event.pointerId)) list.releasePointerCapture(event.pointerId);
      release(event.type === 'pointercancel');
    };
    const listeners = [['wheel', wheel, { passive: false }], ['touchstart', touchStart, { passive: true }],
      ['touchmove', touchMove, { passive: false }], ['touchend', touchEnd], ['touchcancel', touchCancel],
      ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]];
    listeners.forEach(([name, fn, options]) => list.addEventListener(name, fn, options));
    return () => {
      alive = false; cancelAnimationFrame(raf); clearTimeout(releaseTimer);
      cancelAnimationFrame(refreshFrame); clearTimeout(refreshTimer);
      listeners.forEach(([name, fn, options]) => list.removeEventListener(name, fn, options));
      list.style.translate = originalTranslate;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [scrollRef, enabled, resetKey]);
  return <canvas ref={canvasRef} className="chat-history-grains" aria-hidden="true" />;
}
