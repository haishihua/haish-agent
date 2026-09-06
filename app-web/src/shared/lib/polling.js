// A completed request schedules the next poll; slow requests cannot overlap.
export function startPolling(refresh, { interval = 3000, hiddenInterval = 30000, immediate = true } = {}) {
  let stopped = false;
  let pending = false;
  let timer;
  let failures = 0;
  let focused = document.hasFocus?.() ?? true;
  const delay = () => Math.min(60000, Math.max(
    document.hidden || !focused ? hiddenInterval : interval,
    interval * (2 ** failures),
  ));
  const run = async () => {
    if (stopped || pending) return;
    clearTimeout(timer);
    pending = true;
    try {
      await refresh();
      failures = 0;
    } catch {
      failures = Math.min(failures + 1, 5);
    } finally {
      pending = false;
      if (!stopped) timer = setTimeout(run, delay());
    }
  };
  const resume = () => {
    focused = document.hasFocus?.() ?? true;
    if (!document.hidden) void run();
  };
  const blur = () => {
    focused = false;
    if (!pending) {
      clearTimeout(timer);
      timer = setTimeout(run, delay());
    }
  };
  window.addEventListener('focus', resume);
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', resume);
  if (immediate) void run();
  else timer = setTimeout(run, delay());
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener('focus', resume);
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', resume);
  };
}
