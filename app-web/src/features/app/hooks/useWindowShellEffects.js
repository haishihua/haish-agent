import { useEffect, useState } from 'react';

/**
 * 把窗口状态映射到 body 上的 `window-chrome-free` 标记。
 * 只有真正的 fullScreen 会隐藏 macOS 红黄绿按钮；maximize (zoom) 不会，
 * 所以 maximize 时仍要保留 topbar 左侧让位空间，否则 logo 被按钮压住。
 */
export function useWindowChromeState() {
  useEffect(() => {
    let cleanup = null;
    let cancelled = false;
    const applyWindowState = (state) => {
      const chromeFree = Boolean(state?.fullScreen);
      document.body.classList.toggle('window-chrome-free', chromeFree);
    };
    window.haish?.getWindowState?.()
      .then((state) => {
        if (!cancelled) applyWindowState(state);
      })
      .catch(() => undefined);
    cleanup = window.haish?.onWindowStateChange?.(applyWindowState) || null;
    return () => {
      cancelled = true;
      cleanup?.();
      document.body.classList.remove('window-chrome-free');
    };
  }, []);
}

/**
 * 窗口 focused 状态：任务完成通知只在窗口聚焦且会话可见时才算「已读」，
 * 所以它是通知判据里的一份独立输入。
 */
export function useWindowFocus() {
  const [windowFocused, setWindowFocused] = useState(() => (
    typeof document === 'undefined' ? true : document.hasFocus()
  ));

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return [windowFocused, setWindowFocused];
}
