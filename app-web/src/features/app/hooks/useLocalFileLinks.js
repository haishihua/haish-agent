import React from 'react';
import { setLocalFileRoot } from '../../../shared/lib/local-file-link.js';

// Answers link to the files a task produced. Relative targets resolve against
// the conversation's own cwd (the workspace path), and a failed open is reported
// through the shell's toast instead of failing silently inside the renderer.
export function useLocalFileLinks(workspacePath, showToast) {
  React.useEffect(() => { setLocalFileRoot(workspacePath || ''); }, [workspacePath]);
  const showToastRef = React.useRef(showToast);
  showToastRef.current = showToast;
  React.useEffect(() => {
    const onToast = (event) => {
      const detail = event.detail || {};
      showToastRef.current(detail.kind || 'info', String(detail.message || ''));
    };
    window.addEventListener('haish:toast', onToast);
    return () => window.removeEventListener('haish:toast', onToast);
  }, []);
}
