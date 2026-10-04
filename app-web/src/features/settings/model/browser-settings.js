// Display-only mappings. Unknown runtime states never imply successful setup.
export function browserStatusMeta(state) {
  if (!state) return { label: 'Checking…', tone: 'muted', loading: true };
  if (state.setup_running) return { label: state.step === 'waiting_allow' ? 'Waiting for Chrome' : 'Setting up', tone: 'muted', loading: true };
  const statuses = {
    disabled: { label: 'Disabled', tone: 'muted' },
    standby: { label: 'Enabled', tone: 'success' },
    starting: { label: 'Starting', tone: 'muted', loading: true },
    ready: { label: 'Enabled', tone: 'success' },
    configuring: { label: 'Setting up', tone: 'muted', loading: true },
    needs_repair: { label: 'Needs attention', tone: 'warning' },
    cancelled: { label: 'Setup cancelled', tone: 'muted' },
  };
  return statuses[state.status] || { label: 'Unavailable', tone: 'warning' };
}

export function browserSetupHeading(state) {
  if (state?.status === 'cancelled') return 'Setup cancelled';
  const steps = {
    dependencies: 'Dependencies', bundle: 'Extension download', connect: 'Chrome connection',
    remote_debugging: 'Remote debugging', waiting_allow: 'Chrome authorization',
    extension: 'Extension installation', host: 'Native host', configure: 'Cookie export',
    first_sync: 'First Cookie sync', verify: 'Browser verification', enable: 'Enable browser',
    background_sync: 'Background sync',
  };
  const label = steps[state?.step];
  if (state?.setup_running) return label || 'Setting up';
  return label ? `${label} failed` : 'Browser needs attention';
}

export function formatBrowserSyncTime(value) {
  // Missing runtime statistics do not mean the persisted profile was cleared.
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export function formatBrowserCookieCount(state) {
  // A new app process starts at zero before its first successful sync. Only
  // show a count when the timestamp confirms an observed sync, including zero.
  if (!state?.last_sync || Number.isNaN(new Date(state.last_sync).getTime())) return '—';
  const count = state.cookie_count;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? count.toLocaleString() : '—';
}
