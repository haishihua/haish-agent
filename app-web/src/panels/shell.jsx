// @haish-esm
import React from 'react';
import { NAV_ICONS } from './shared-constants.jsx';

export const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agents',    label: 'Agents'    },
  { id: 'tasks',     label: 'Tasks'     },
  { id: 'reports',   label: 'Reports'   },
  { id: 'system',    label: 'System'    },
];
export function BottomNav({ active, onChange }) {
  return (
    <div className="app-bottomnav">
      {NAV_TABS.map(tab => (
        <button key={tab.id} type="button"
                className={`nav-item ${active === tab.id ? 'active' : ''}`}
                onClick={() => onChange(tab.id)}>
          <span className="nav-icon">{NAV_ICONS[tab.id]}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
export function MapViewport({ children, overlay, MAP_W, MAP_H, onViewChange }) {
  const wrapRef = React.useRef(null);
  const [view, setView] = React.useState({ scale: 1, tx: 0, ty: 0, fit: 1 });
  const [dragging, setDragging] = React.useState(false);
  const dragStartRef = React.useRef(null);
  // MAP_ANCHOR: which point on the map (0-1) to pin
  // VIEW_ANCHOR_X: fraction of safeW; VIEW_ANCHOR_Y_PX: fixed px from wrap top
  const HOME_ZOOM_MULTIPLIER = 1.66;
  const MAP_ANCHOR_X = 0.281;
  const MAP_ANCHOR_Y = 0.418;
  const VIEW_ANCHOR_X = 0.098;
  const VIEW_ANCHOR_Y_PX = 212;

  const computeHomeView = React.useCallback(() => {
    const el = wrapRef.current;
    if (!el) return null;
    const vw = el.clientWidth, vh = el.clientHeight;
    if (!vw || !vh) return null;
    const insetX = 20;
    const insetTop = 18;
    const insetBottom = 220;
    const safeW = Math.max(1, vw - insetX * 2);
    const safeH = Math.max(1, vh - insetTop - insetBottom);
    const fitScale = Math.min(safeW / MAP_W, safeH / MAP_H);
    const scale = fitScale * HOME_ZOOM_MULTIPLIER;
    const tx = (insetX + safeW * VIEW_ANCHOR_X) - MAP_ANCHOR_X * MAP_W * scale;
    // VIEW_ANCHOR_Y_PX = (MAP_ANCHOR_Y * MAP_H - NPC_SIZE + NPC_FOOT_OFFSET) * scale + ty
    const ty = VIEW_ANCHOR_Y_PX - (MAP_ANCHOR_Y * MAP_H - 98) * scale;

    return { scale, fit: fitScale, tx, ty };
  }, [HOME_ZOOM_MULTIPLIER, MAP_ANCHOR_X, MAP_ANCHOR_Y, VIEW_ANCHOR_X, VIEW_ANCHOR_Y_PX, MAP_H, MAP_W]);

  const fit = React.useCallback(() => {
    const homeView = computeHomeView();
    if (homeView) setView(homeView);
  }, [computeHomeView]);

  React.useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !onViewChange) return;
    onViewChange({
      ...view,
      viewportWidth: el.clientWidth,
      viewportHeight: el.clientHeight,
    });
  }, [onViewChange, view]);

  function zoomAt(cx, cy, factor) {
    setView(v => {
      const newScale = Math.max(0.3, Math.min(3, v.scale * factor));
      const k = newScale / v.scale;
      return { ...v, scale: newScale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1/1.1);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    try { wrapRef.current.setPointerCapture?.(e.pointerId); } catch (err) {}
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const s = dragStartRef.current;
    setView(v => ({ ...v, tx: s.tx + (e.clientX - s.x), ty: s.ty + (e.clientY - s.y) }));
  }
  function onPointerUp(e) {
    setDragging(false);
    try { wrapRef.current.releasePointerCapture?.(e.pointerId); } catch (err) {}
  }

  const pct = Math.round((view.scale / Math.max(0.0001, view.fit)) * 100);

  return (
    <div className="map-viewport">
      <div className="map-screen-frame">
        <div ref={wrapRef}
             className={`map-stage-wrap ${dragging ? 'dragging' : ''}`}
             onWheel={onWheel}
             onPointerDown={onPointerDown}
             onPointerMove={onPointerMove}
             onPointerUp={onPointerUp}>
          <div className="map-stage"
               style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
            {children}
          </div>
        </div>
      </div>
      <div className="zoom-controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(wrapRef.current.clientWidth/2, wrapRef.current.clientHeight/2, 1.2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(wrapRef.current.clientWidth/2, wrapRef.current.clientHeight/2, 1/1.2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button type="button" aria-label="Fit to view" onClick={fit}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <div className="zoom-readout">{pct}%</div>
      </div>
      {overlay}
    </div>
  );
}
export function TabPlaceholder({ name }) {
  return (
    <div className="tab-placeholder">
      <div className="ph-title">{name.toUpperCase()}</div>
      <div className="ph-sub">Coming soon</div>
    </div>
  );
}

