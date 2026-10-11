import React from 'react';

export const CONFIG_SAVE_STATUS_DELAY_MS = 700;

// Background persistence is not a content-loading boundary. Only slow saves get
// a quiet, out-of-flow label next to the configuration control.
export function ConfigSaveStatus({ pending }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!pending) { setVisible(false); return undefined; }
    const timer = window.setTimeout(() => setVisible(true), CONFIG_SAVE_STATUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!pending || !visible) return null;
  return <span className="chat-config-save-status" role="status" aria-label="Saving configuration">Saving…</span>;
}
