// Keep installation state separate from the user's browser-selection toggle.
export function browserDependencyAction(state) {
  const cli = state?.dependency_status;
  const managed = state?.managed_dependency_status;
  if (state?.initial_import_error) return { label: 'Keep existing logins', action: 'keep_existing_logins', consent: true };
  if (state && !state.initial_import_complete) {
    return { label: cli === 'compatible' && managed === 'compatible' ? 'Set up and enable' : 'Install and enable', action: 'install', consent: true };
  }
  if (state?.error_code === 'managed_browser_check_failed') {
    return { label: 'Check browser', action: 'check', issue: 'Dependency check failed. Try again.' };
  }
  if (['runtime_install_failed', 'managed_browser_install_failed'].includes(state?.error_code)) {
    return { label: 'Retry repair', action: 'repair', consent: true, issue: 'Installation failed.' };
  }
  if ([cli, managed].includes('version_mismatch')) {
    return { label: 'Update dependencies', action: 'repair', consent: true, issue: 'Dependency update required.' };
  }
  if (cli === 'invalid') return { label: 'Repair dependencies', action: 'repair', consent: true, issue: 'Dependencies need reinstalling.' };
  if (cli === 'compatible' && managed === 'unverified') {
    return { label: 'Check browser', action: 'check', issue: 'Verify existing browser dependencies.' };
  }
  if (cli !== 'compatible' || managed !== 'compatible' || state?.error_code === 'managed_browser_missing') {
    return { label: 'Repair dependencies', action: 'repair', consent: true, issue: 'Browser dependencies are missing.' };
  }
  if (!state?.enabled) return { label: 'Enable', action: 'enable' };
  return { label: '', action: null };
}

// Display-only mappings. Unknown runtime states never imply successful setup.
export function browserStatusMeta(state) {
  if (!state) return { label: 'Checking…', tone: 'muted', loading: true };
  if (state.setup_running && state.step === 'check') return { label: 'Checking', tone: 'muted', loading: true };
  if (state.setup_running && state.step === 'repair') return { label: 'Repairing', tone: 'muted', loading: true };
  if (state.paused) return { label: 'Paused', tone: 'muted' };
  if (state.sync_running || state.status === 'syncing') return { label: 'Importing', tone: 'muted', loading: true };
  if (state.setup_running) return { label: state.step === 'waiting_allow' ? 'Waiting for Chrome' : state.step === 'dependencies' ? 'Installing' : 'Setting up', tone: 'muted', loading: true };
  if (state.initial_import_error) return { label: 'Import stopped', tone: 'warning' };
  if (state.error_code === 'managed_browser_check_failed' || (state.dependency_status === 'compatible' && state.managed_dependency_status === 'unverified')) return { label: 'Needs check', tone: 'warning' };
  if (['runtime_install_failed', 'managed_browser_install_failed'].includes(state.error_code)) return { label: 'Repair failed', tone: 'warning' };
  if ([state.dependency_status, state.managed_dependency_status].includes('version_mismatch')) return { label: 'Update required', tone: 'warning' };
  if (state.dependency_status === 'invalid') return { label: 'Needs repair', tone: 'warning' };
  if ([state.dependency_status, state.managed_dependency_status].includes('missing')) return { label: 'Not installed', tone: 'warning' };
  if (state.dependency_status === 'compatible' && state.managed_dependency_status === 'compatible' && !state.initial_import_complete) return { label: 'Not set up', tone: 'muted' };
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
  if (state?.step === 'check') return state.setup_running || !state.error_code ? 'Dependency check' : 'Dependency check failed';
  if (state?.step === 'repair') return state.setup_running || !state.error_code ? 'Dependency repair' : 'Dependency repair failed';
  if (state?.paused) return 'Browser paused';
  if (state?.initial_import_error) return 'Import stopped';
  if (state?.initial_import_complete && !state?.error_code && !state?.setup_running) return 'Browser status';
  if (state?.sync_running || state?.status === 'syncing') return 'Initial import';
  if (state?.status === 'cancelled') return 'Setup cancelled';
  const steps = {
    dependencies: 'Dependencies', bundle: 'Extension download', connect: 'Chrome connection',
    remote_debugging: 'Remote debugging', waiting_allow: 'Chrome authorization',
    extension: 'Extension installation', host: 'Native host', configure: 'Cookie export',
    first_sync: 'Initial import', verify: 'Browser verification', enable: 'Enable browser',
    background_sync: 'Browser connection', manual_sync: 'Initial import',
  };
  const label = steps[state?.step];
  if (state?.setup_running) return label || 'Setting up';
  return label ? `${label} failed` : 'Browser needs attention';
}

export function hasBrowserImportSummary(state) {
  return Boolean(state?.initial_import_complete && !state.initial_import_error
    && !state.setup_running && !state.sync_running && state.status !== 'syncing'
    && state.dependency_status === 'compatible' && state.managed_dependency_status === 'compatible'
    && state.last_sync && !Number.isNaN(new Date(state.last_sync).getTime())
    && Number.isSafeInteger(state.cookie_count) && state.cookie_count >= 0);
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
