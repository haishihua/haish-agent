import React from 'react';
import { Check, Info, X } from 'lucide-react';

/** lucide glyph per toast kind. Vector glyphs replace the former raster PNG
 *  badges so the 20px badge stays sharp next to every other status icon. */
const TOAST_GLYPHS = {
  success: Check,
  error: X,
  info: Info,
};

export function AppToast({ kind = 'info', message }) {
  if (!message) return null;
  const Glyph = TOAST_GLYPHS[kind] || TOAST_GLYPHS.info;
  return (
    <div className={`app-toast app-toast-${kind}`} role="status" aria-live="polite">
      <span className="app-toast-icon" aria-hidden="true">
        <Glyph size={12} strokeWidth={3} />
      </span>
      <span className="app-toast-message">{message}</span>
    </div>
  );
}
