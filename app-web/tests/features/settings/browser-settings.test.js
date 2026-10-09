import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SETTINGS_SUBTABS } from '../../../src/features/settings/model/settings-navigation.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { browserDependencyAction, browserStatusMeta, browserSetupHeading, hasBrowserImportSummary, formatBrowserSyncTime, formatBrowserCookieCount } from '../../../src/features/settings/model/browser-settings.js';

const editor = fs.readFileSync(new URL('../../../src/features/settings/components/BrowserConfigEditor.jsx', import.meta.url), 'utf8');
const tools = fs.readFileSync(new URL('../../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url), 'utf8');

test('Browser pane is independent of old Tools drafts and save payloads', () => {
  assert.ok(SETTINGS_SUBTABS.tools.some(item => item.id === 'tools-browser'));
  assert.match(tools, /selectedId === 'tools-browser'.*BrowserConfigEditor/);
  assert.deepEqual(Object.keys(buildToolsSettingsPayload(createDefaultSettingsRecords())).sort(), ['mcp', 'skills', 'web_search']);
});

test('opening Browser settings only reads state; consent and version replacement gate installation', () => {
  const effect = editor.slice(editor.indexOf('useEffect(() =>'), editor.indexOf('const action ='));
  assert.ok(effect.includes('/api/settings/tools/browser'));
  assert.ok(!effect.includes("method: 'POST'"));
  assert.match(editor, /confirmed: needsConsent && consent, allow_replace: needsConsent && replace/);
  assert.match(editor, /dependency.consent && \(!consent \|\| \(!state\?\.initial_import_error && mismatch && !replace\)\)/);
  assert.match(editor, /response.status === 404/);
  assert.match(editor, /controller.abort\(\)/);
});

test('Settings explains compatibility and no destructive cleanup semantics', () => {
  assert.match(editor, /Disabled by default/);
  assert.match(editor, /click Allow yourself/);
  assert.match(editor, /No fallback to personal Chrome/);
  assert.match(editor, /saved logins remain/);
});

test('Browser uses shared Settings controls and contextual setup, not raw form controls or MCP action sizing', () => {
  for (const control of ['Button', 'Badge', 'Checkbox', 'Field', 'Item', 'Collapsible']) assert.match(editor, new RegExp(`<${control}\\b`));
  assert.ok(!editor.includes('<input'));
  assert.ok(!editor.includes('mcp-editor-actions'));
  assert.match(editor, /const showConsent = state && !running && dependency.consent/);
  assert.ok(!editor.includes('setupOpen'));
  assert.match(editor, /aria-describedby="browser-sync-consent-description"/);
  assert.match(editor, /setConsent\(false\)/);
});

test('Browser has a window icon distinct from Web Search and concise primary copy', () => {
  const icons = fs.readFileSync(new URL('../../../src/features/settings/components/settings-ui.jsx', import.meta.url), 'utf8');
  const appIcons = fs.readFileSync(new URL('../../../src/shared/ui/AppIcon.jsx', import.meta.url), 'utf8');
  assert.match(icons, /'tools-browser': 'browser'/);
  assert.match(icons, /'tools-web': 'globe'/);
  assert.match(appIcons, /browser: PanelsTopLeft/);
  assert.match(editor, /<PanelsTopLeft size=/);
  const primary = editor.slice(editor.indexOf('return <div'), editor.indexOf('<Collapsible className="browser-settings-details"'));
  assert.ok(!primary.includes('browser-page-description'));
  assert.ok(!primary.includes('Latest applied export'));
  assert.ok(!primary.includes('Setup prepares missing dependencies'));
  assert.match(primary, /Install browser-use, Playwright and Chromium/);
  assert.match(primary, /Import logins once/);
});

test('setup headings identify the actual stage instead of blaming Chrome authorization', () => {
  assert.equal(browserSetupHeading({ step: 'first_sync', status: 'needs_repair' }), 'Initial import failed');
  assert.equal(browserSetupHeading({ step: 'verify', status: 'needs_repair' }), 'Browser verification failed');
  assert.equal(browserSetupHeading({ step: 'first_sync', setup_running: true }), 'Initial import');
  assert.equal(browserSetupHeading({ status: 'cancelled' }), 'Setup cancelled');
  assert.equal(browserSetupHeading({ step: 'unknown' }), 'Browser needs attention');
  assert.match(editor, /browserSetupHeading\(state\)/);
});

test('maintenance actions share outlined buttons, icons and equal-size layout', () => {
  const maintenance = editor.slice(editor.indexOf('<div className={`browser-action-buttons'), editor.indexOf('</section>'));
  assert.equal((maintenance.match(/variant="outline" size="sm"/g) || []).length, 3); // cancel, pause/resume, disable
  for (const icon of ['Power', 'Pause', 'Play']) assert.ok(maintenance.includes(`<${icon} size={14}`));
  assert.ok(!maintenance.includes('Wrench'));
  assert.ok(!maintenance.includes('variant="ghost"'));
  const css = fs.readFileSync(new URL('../../../src/features/settings/settings.css', import.meta.url), 'utf8');
  assert.match(css, /\.browser-maintenance-actions \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.browser-maintenance-actions \[data-slot="button"\] \{[^}]*height: 32px;[^}]*border: 1px solid/);
});

test('Pause, Resume and Disable explain their distinct effects through shared tooltips without renaming buttons', () => {
  assert.match(editor, /import \{ PortalTooltip \} from/);
  assert.match(editor, /<PortalTooltip text=\{state.paused \? 'Resume automation' : 'Pause automation'\} position="above" multiline>/);
  assert.match(editor, /<PortalTooltip text="Use personal Chrome" position="above" multiline>/);
  assert.match(editor, /\{state.paused \? 'Resume' : 'Pause'\}/);
  assert.match(editor, /\{pendingAction === 'disable' \? 'Disabling…' : 'Disable'\}/);
  assert.ok(!editor.includes('Already issued operations may still finish.'));
  const fixture = fs.readFileSync(new URL('../../fixtures/browser-settings.jsx', import.meta.url), 'utf8');
  assert.match(fixture, /<AppTooltipProvider>/);
});

test('healthy runtime does not repeat the Enabled badge with another Ready status', () => {
  const summary = editor.slice(editor.indexOf('<dl className="browser-runtime-summary">'), editor.indexOf('</dl>'));
  assert.ok(!summary.includes('Browser Runtime'));
  assert.ok(!summary.includes('Ready'));
  assert.equal((summary.match(/<dt>/g) || []).length, 2);
  assert.match(editor, /const dependency = browserDependencyAction\(state\)/);
  assert.match(editor, /runtimeIssue && !running && !state.message/);
  assert.match(editor, /<h3>Dependencies<\/h3>/);
  assert.match(editor, /Installed together during setup/);
});

test('Browser action feedback is wired to the existing app toast, not panel notices', () => {
  const shell = fs.readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../../../src/features/settings/components/SettingsPage.jsx', import.meta.url), 'utf8');
  assert.match(shell.slice(shell.indexOf('<SettingsPage'), shell.indexOf('</React.Suspense>', shell.indexOf('<SettingsPage'))), /onToast=\{showToast\}/);
  assert.match(settings.slice(settings.indexOf('<ToolsConfigEditor'), settings.indexOf("if (section === 'agent')", settings.indexOf('<ToolsConfigEditor'))), /onToast=\{onToast\}/);
  assert.match(tools, /<BrowserConfigEditor onToast=\{onToast\}/);
  assert.ok(!editor.includes('setNotice'));
  assert.ok(!editor.includes('browser-action-notice'));
  // Persistent status/read failures remain visible without polling toasts.
  const effect = editor.slice(editor.indexOf('useEffect(() =>'), editor.indexOf('const action ='));
  assert.ok(!effect.includes('onToast('));
  assert.ok(effect.includes('setError('));
});

test('keep-logins/disable feedback and action failures release busy state', async () => {
  const actionBody = editor.slice(editor.indexOf('const action = async (name) => {') + 'const action = async (name) => {'.length, editor.indexOf('\n  const mismatch'));
  const makeAction = new Function('apiFetch', 'API_BASE', 'parseResponseMessage', 'consent', 'replace', 'setBusy', 'setPendingAction', 'setState', 'setConsent', 'setReplace', 'onToast', `return async (name) => {${actionBody}`);
  for (const [name, ok] of [['keep_existing_logins', true], ['disable', true], ['repair', false]]) {
    const events = [];
    const next = { enabled: name !== 'disable' };
    const action = makeAction(async () => ({ ok, json: async () => next }), '', async () => 'Browser configuration failed.', false, false,
      value => events.push(['busy', value]), value => events.push(['pending', value]), value => events.push(['state', value]),
      () => {}, () => {}, (kind, message) => events.push(['toast', kind, message]));
    await action(name);
    const toast = events.find(event => event[0] === 'toast');
    assert.equal(toast[1], ok ? 'success' : 'error');
    assert.match(toast[2], name === 'keep_existing_logins' ? /Existing logins kept/ : name === 'disable' ? /Disabled/ : /configuration failed/);
    assert.equal(events.some(event => event[0] === 'state'), ok);
    assert.deepEqual(events.slice(-2), [['busy', false], ['pending', '']]);
  }
});

test('initial import shows progress without repeat sync and supports pause', () => {
  assert.deepEqual(browserStatusMeta({ status: 'syncing', sync_running: true }), { label: 'Importing', tone: 'muted', loading: true });
  assert.equal(browserSetupHeading({ step: 'manual_sync', status: 'syncing', sync_running: true }), 'Initial import');
  assert.equal(browserSetupHeading({ step: 'manual_sync', status: 'needs_repair' }), 'Initial import failed');
  assert.match(editor, /const running = state\?\.setup_running \|\| syncing/);
  assert.match(editor, /Cancel import/);
  assert.ok(!editor.includes("action('sync')"));
  assert.match(editor, /No further sync after import/);
  assert.match(editor, /action\(state.paused \? 'resume' : 'pause'\)/);
  assert.equal(browserStatusMeta({ paused: true }).label, 'Paused');
  assert.equal(browserSetupHeading({ initial_import_error: true }), 'Import stopped');
});

test('runtime states have readable labels without treating unknown or failed setup as ready', () => {
  assert.equal(browserStatusMeta(null).loading, true);
  assert.equal(browserStatusMeta({ status: 'ready' }).label, 'Enabled');
  assert.equal(browserStatusMeta({ status: 'standby' }).label, 'Enabled');
  assert.ok(!browserStatusMeta({ status: 'standby' }).loading);
  assert.equal(browserStatusMeta({ status: 'needs_repair' }).tone, 'warning');
  assert.equal(browserStatusMeta({ setup_running: true, step: 'waiting_allow' }).label, 'Waiting for Chrome');
  assert.equal(browserStatusMeta({ status: 'new_unknown_state' }).label, 'Unavailable');
  assert.equal(formatBrowserSyncTime(null), '—');
  assert.equal(formatBrowserSyncTime('not-a-date'), 'Unavailable');
  assert.ok(!formatBrowserSyncTime('2026-10-04T10:00:00Z').includes('T10:00:00Z'));
});

test('dependency actions reflect installation, not the browser toggle', () => {
  const installed = { dependency_status: 'compatible', managed_dependency_status: 'compatible', initial_import_complete: true };
  for (const enabled of [true, false]) {
    for (const patch of [{ managed_dependency_status: 'missing' }, { dependency_status: 'missing' }]) {
      assert.equal(browserDependencyAction({ ...installed, enabled, ...patch }).label, 'Repair dependencies');
      assert.equal(browserDependencyAction({ ...installed, enabled, ...patch }).action, 'repair');
    }
    assert.equal(browserDependencyAction({ ...installed, enabled, managed_dependency_status: 'version_mismatch' }).label, 'Update dependencies');
    assert.equal(browserDependencyAction({ ...installed, enabled, dependency_status: 'version_mismatch' }).label, 'Update dependencies');
    assert.equal(browserDependencyAction({ ...installed, enabled, error_code: 'managed_browser_install_failed' }).label, 'Retry repair');
  }
  assert.deepEqual(browserDependencyAction({ ...installed, enabled: false }), { label: 'Enable', action: 'enable' });
  assert.equal(browserDependencyAction({ ...installed, initial_import_complete: false }).label, 'Set up and enable');
  assert.equal(browserDependencyAction({ ...installed, initial_import_error: true }).action, 'keep_existing_logins');
  assert.equal(browserStatusMeta({ ...installed, status: 'ready', enabled: true, managed_dependency_status: 'missing' }).label, 'Not installed');
  assert.equal(browserStatusMeta({ ...installed, setup_running: true, step: 'dependencies' }).label, 'Installing');
  assert.match(editor, /action\(dependency.action\)/);
  assert.ok(!editor.includes('Repair and verify'));
});

test('existing runtime without a completion record uses Check browser, not a missing-install claim', () => {
  const state = { dependency_status: 'compatible', managed_dependency_status: 'unverified', initial_import_complete: true, status: 'standby', enabled: true };
  assert.deepEqual(browserDependencyAction(state), {
    label: 'Check browser', action: 'check', issue: 'Verify existing browser dependencies.',
  });
  assert.deepEqual(browserStatusMeta(state), { label: 'Needs check', tone: 'warning' });
  assert.equal(browserDependencyAction({ ...state, enabled: false }).action, 'check');
  assert.equal(browserDependencyAction({ ...state, initial_import_complete: false }).action, 'install');
  assert.equal(browserDependencyAction({ ...state, managed_dependency_status: 'missing' }).label, 'Repair dependencies');
  assert.equal(browserDependencyAction({ ...state, dependency_status: 'missing' }).label, 'Repair dependencies');
  assert.match(editor, /Check verifies tools without installing/);
});

test('status icons and labels have explicit centered geometry scoped to Browser', () => {
  const css = fs.readFileSync(new URL('../../../src/features/settings/settings.css', import.meta.url), 'utf8');
  assert.match(editor, /<span className="browser-status-label">\{status.label\}<\/span>/);
  assert.match(css, /\.browser-status \{[^}]*align-items: center;[^}]*line-height: 16px/);
  assert.match(css, /\.browser-status > svg \{[^}]*width: 12px; height: 12px;[^}]*margin: 0/);
  assert.match(css, /\.browser-setup-status strong \{[^}]*display: block;[^}]*line-height: 20px/);
});

test('import summary is hidden until dependencies and successful import statistics are available', () => {
  const complete = { initial_import_complete: true, dependency_status: 'compatible', managed_dependency_status: 'compatible', last_sync: '2026-10-04T10:00:00Z', cookie_count: 752 };
  assert.equal(hasBrowserImportSummary(complete), true);
  assert.equal(hasBrowserImportSummary({ ...complete, cookie_count: 0 }), true);
  for (const status of ['disabled', 'standby']) assert.equal(hasBrowserImportSummary({ ...complete, status }), true);
  assert.equal(hasBrowserImportSummary(null), false);
  for (const patch of [
    { initial_import_complete: false }, { initial_import_error: true },
    { setup_running: true }, { sync_running: true }, { status: 'syncing' },
    { dependency_status: 'missing' }, { managed_dependency_status: 'version_mismatch' },
    { last_sync: null }, { last_sync: 'invalid' }, { cookie_count: undefined },
    { cookie_count: -1 }, { cookie_count: '752' }, { cookie_count: 1.5 },
  ]) assert.equal(hasBrowserImportSummary({ ...complete, ...patch }), false, JSON.stringify(patch));
  assert.match(editor, /hasBrowserImportSummary\(state\) && <dl className="browser-runtime-summary">/);
});

test('Check lives only in Details; selection never re-enters setup consent', () => {
  const detailsStart = editor.indexOf('<Collapsible className="browser-settings-details"');
  const primary = editor.slice(editor.indexOf('return <div'), detailsStart);
  const details = editor.slice(detailsStart);
  assert.ok(!primary.includes("action('check')"));
  assert.equal((details.match(/action\('check'\)/g) || []).length, 1);
  assert.ok(!primary.includes('browser-runtime-summary'));
  assert.ok(details.includes('browser-runtime-summary'));
  assert.ok(!editor.includes('Verify and enable'));
  assert.deepEqual(browserDependencyAction({ enabled: true, initial_import_complete: true, dependency_status: 'compatible', managed_dependency_status: 'compatible' }), { label: '', action: null });
});

test('first setup labels and maintenance status do not conflate installation, selection and checking', () => {
  const first = { enabled: false, initial_import_complete: false, dependency_status: 'missing', managed_dependency_status: 'missing' };
  assert.deepEqual(browserDependencyAction(first), { label: 'Install and enable', action: 'install', consent: true });
  assert.equal(browserStatusMeta(first).label, 'Not installed');
  assert.equal(browserStatusMeta({ ...first, managed_dependency_status: 'unverified', dependency_status: 'compatible' }).label, 'Needs check');
  assert.equal(browserStatusMeta({ ...first, dependency_status: 'compatible', managed_dependency_status: 'compatible' }).label, 'Not set up');
  for (const [step, label, heading] of [['check', 'Checking', 'Dependency check'], ['repair', 'Repairing', 'Dependency repair']]) {
    assert.equal(browserStatusMeta({ paused: true, setup_running: true, step }).label, label);
    assert.equal(browserSetupHeading({ setup_running: true, step }), heading);
    assert.equal(browserSetupHeading({ step }), heading);
    assert.equal(browserSetupHeading({ step, error_code: 'setup_failed' }), `${heading} failed`);
  }
});

test('Check and Enable do not inherit checked installation consent in their request', async () => {
  const actionBody = editor.slice(editor.indexOf('const action = async (name) => {') + 'const action = async (name) => {'.length, editor.indexOf('\n  const mismatch'));
  const makeAction = new Function('apiFetch', 'API_BASE', 'parseResponseMessage', 'consent', 'replace', 'setBusy', 'setPendingAction', 'setState', 'setConsent', 'setReplace', 'onToast', `return async (name) => {${actionBody}`);
  for (const name of ['check', 'enable', 'disable', 'pause', 'repair', 'install']) {
    let payload;
    const action = makeAction(async (url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; }, '', () => {}, true, true, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
    await action(name);
    const needsConsent = ['install', 'repair'].includes(name);
    assert.deepEqual(payload, { action: name, confirmed: needsConsent, allow_replace: needsConsent });
  }
});

test('unknown sync statistics are not displayed as an empty persisted browser', () => {
  assert.equal(formatBrowserCookieCount(null), '—');
  for (const status of ['standby', 'starting', 'needs_repair', 'disabled']) {
    assert.equal(formatBrowserCookieCount({ enabled: true, status, last_sync: null, cookie_count: 0 }), '—');
  }
  const synced = { last_sync: '2026-10-04T10:00:00Z', cookie_count: 752 };
  assert.equal(formatBrowserCookieCount(synced), (752).toLocaleString());
  assert.equal(formatBrowserCookieCount({ ...synced, cookie_count: 0 }), '0');
  // An observed last sync remains visible after a browser exits or is disabled.
  assert.equal(formatBrowserCookieCount({ ...synced, status: 'standby' }), (752).toLocaleString());
  for (const cookie_count of [undefined, null, -1, NaN, Infinity, '752', 1.5]) {
    assert.equal(formatBrowserCookieCount({ ...synced, cookie_count }), '—');
  }
  assert.equal(formatBrowserCookieCount({ ...synced, last_sync: 'bad-date' }), '—');
  assert.match(editor, /formatBrowserCookieCount\(state\)/);
  assert.ok(!editor.includes('Number(state.cookie_count || 0)'));
  assert.match(editor, /Opens on a browser call or first setup/);
});
