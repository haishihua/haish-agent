import React from 'react';
import { setLocalFileRoot } from '../../../shared/lib/local-file-link.js';
import { onToast } from '../../../shared/lib/toast.js';

// Answers link to the files a task produced. Relative targets resolve against
// the conversation's own cwd (the workspace path), and a failed open is reported
// through the shell's toast instead of failing silently inside the renderer.
export function useLocalFileLinks(workspacePath, showToast) {
  // 渲染期同步写入，而不是 effect：Markdown 的链接解析要读这个根，effect 要等提交后
  // 才跑，首帧渲染时根还是空的——相对路径会先被当成普通文本，第二帧才变成链接。
  // 写入是幂等的（同一个字符串），严格模式重渲染无副作用。
  setLocalFileRoot(workspacePath || '');
  const showToastRef = React.useRef(showToast);
  showToastRef.current = showToast;
  React.useEffect(() => onToast((detail) => {
    showToastRef.current(detail.kind || 'info', String(detail.message || ''));
  }), []);
}
