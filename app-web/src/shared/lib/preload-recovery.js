// A rebuild replaces the hashed chunks. A window that still holds the old index.html then
// asks the haish:// handler for a file that no longer exists ("Failed to fetch dynamically
// imported module") and used to land straight on the crash screen. Vite emits
// `vite:preloadError` for exactly that case and documents the reload recipe.
//
// The flag survives the reload, so this fires once per renderer session: a chunk that is
// genuinely broken (not just stale) stops looping and surfaces through ErrorBoundary like
// any other crash.
export const CHUNK_RELOAD_FLAG = 'haish.chunk-reload.v1';

export function installPreloadRecovery(target = window) {
  target.addEventListener('vite:preloadError', (event) => {
    try {
      if (target.sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return;
      target.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    } catch {
      // Storage unavailable: reloading unconditionally would loop, so leave the error to
      // ErrorBoundary.
      return;
    }
    event.preventDefault();
    target.location.reload();
  });
}

// Installed at import time: main.jsx imports this module before ./app.jsx, so the listener
// is already in place before React requests the first lazy chunk.
installPreloadRecovery();
