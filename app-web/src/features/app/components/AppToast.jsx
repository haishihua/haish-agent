import React from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

/** lucide glyph per toast kind, drawn as a bare 14px stroke like every other
 *  status icon in the shell (ErrorState, sidebar lamps). `warn` sits between
 *  success and info: an action that was blocked or a precondition that still
 *  needs a decision, not a failure. */
const TOAST_GLYPHS = {
  success: Check,
  error: X,
  warn: AlertTriangle,
  info: Info,
};

export function AppToast({ kind = 'info', message }) {
  if (!message) return null;
  const Glyph = TOAST_GLYPHS[kind] || TOAST_GLYPHS.info;
  return (
    <div className={`app-toast app-toast-${kind}`} role="status" aria-live="polite">
      <span className="app-toast-icon" aria-hidden="true">
        <Glyph size={15} strokeWidth={2} />
      </span>
      <span className="app-toast-message">{message}</span>
    </div>
  );
}

/**
 * 堆叠容器：固定定位（顶部居中 22px）挂在容器上，气泡本体只做普通块。
 * 这样 N 条提示依次向上排开、互不覆盖，也不会每条都自己 translateX(-50%)。
 * 容器本身不挂 role / aria-live：每条 AppToast 已经是 polite 状态区，
 * 再包一层只会让读屏重复播报。
 */
export function AppToastStack({ toasts = [] }) {
  const visible = Array.isArray(toasts) ? toasts.filter((toast) => toast?.message) : [];
  if (visible.length === 0) return null;
  return (
    <div className="app-toast-stack">
      {visible.map((toast) => (
        <AppToast key={toast.id} kind={toast.kind} message={toast.message} />
      ))}
    </div>
  );
}
