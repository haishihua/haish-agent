import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserConfigEditor } from '../../src/features/settings/components/BrowserConfigEditor.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';
import '../../src/features/settings/settings.css';

const installed = { enabled: true, status: 'ready', dependency_status: 'compatible', managed_dependency_status: 'compatible', initial_import_complete: true, required_version: '0.13.11', managed_browser_version: '1.63.0' };
const cases = {
  first: { ...installed, enabled: false, status: 'disabled', initial_import_complete: false, dependency_status: 'missing', managed_dependency_status: 'missing' },
  prepared: { ...installed, enabled: false, status: 'disabled', initial_import_complete: false },
  unverified: { ...installed, managed_dependency_status: 'unverified' },
  checking: { ...installed, setup_running: true, status: 'checking', step: 'check', message: 'Checking browser dependencies…' },
  repairing: { ...installed, setup_running: true, status: 'repairing', step: 'repair', message: 'Repairing browser dependencies…' },
  stopped: { ...installed, initial_import_complete: false, initial_import_error: true },
  mismatch: { ...installed, dependency_status: 'version_mismatch' },
  checkFailed: { ...installed, error_code: 'managed_browser_check_failed', step: 'check', message: 'Browser dependency check failed. No tools were installed.' },
  setup: { ...installed, setup_running: true, step: 'verify', message: 'Verifying browser connection…' },
  install: { ...installed, setup_running: true, step: 'dependencies', message: 'Installing browser dependencies…' },
  ready: installed,
  imported: { ...installed, last_sync: '2026-10-09T08:00:00Z', cookie_count: 752 },
  empty: { ...installed, last_sync: '2026-10-09T08:00:00Z', cookie_count: 0 },
  importing: { ...installed, initial_import_complete: false, sync_running: true, status: 'syncing' },
  paused: { ...installed, paused: true },
  missing: { ...installed, managed_dependency_status: 'missing' },
  update: { ...installed, managed_dependency_status: 'version_mismatch' },
  retry: { ...installed, error_code: 'managed_browser_install_failed' },
  disabled: { ...installed, enabled: false, status: 'disabled' },
};
const key = new URLSearchParams(location.search).get('state') || 'setup';
let current = { ...cases[key] };
window.__browserFixture = { writes: [] };
window.fetch = async (url, init = {}) => {
  if (!String(url).endsWith('/api/settings/tools/browser')) throw new Error('Unexpected request');
  if (init.method === 'POST') {
    const request = JSON.parse(init.body);
    window.__browserFixture.writes.push(request);
    const action = request.action;
    if (action === 'check') current = { ...current, managed_dependency_status: 'compatible', error_code: null, step: '', message: 'Browser dependencies verified.' };
    if (action === 'enable' || action === 'disable') current = { ...current, enabled: action === 'enable', status: action === 'enable' ? 'standby' : 'disabled' };
    if (action === 'pause' || action === 'resume') current = { ...current, paused: action === 'pause' };
    if (action === 'repair') current = { ...current, setup_running: true, step: 'repair', message: 'Repairing browser dependencies…' };
    if (action === 'install') current = { ...current, setup_running: true, step: 'dependencies', message: 'Preparing browser setup…' };
    if (action === 'keep_existing_logins') current = { ...current, initial_import_complete: true, initial_import_error: false };
  }
  return new Response(JSON.stringify(current), { headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<AppTooltipProvider><div className="settings-theme dark" style={{ padding: 24 }}><BrowserConfigEditor onToast={() => {}} /></div></AppTooltipProvider>);
