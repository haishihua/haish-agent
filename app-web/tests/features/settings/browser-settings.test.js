import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SETTINGS_SUBTABS } from '../../../src/features/settings/model/settings-navigation.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { browserStatusMeta, browserSetupHeading, formatBrowserSyncTime, formatBrowserCookieCount } from '../../../src/features/settings/model/browser-settings.js';

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
  assert.match(editor, /confirmed: consent, allow_replace: replace/);
  assert.match(editor, /!consent \|\| \(mismatch && !replace\)/);
  assert.match(editor, /response.status === 404/);
  assert.match(editor, /controller.abort\(\)/);
});

test('Settings explains compatibility and no destructive cleanup semantics', () => {
  assert.match(editor, /Disabled by default/);
  assert.match(editor, /click Allow yourself/);
  assert.match(editor, /do not silently switch to personal Chrome/);
  assert.match(editor, /does not uninstall the extension or erase copied sessions/);
});

test('Browser uses shared Settings controls and contextual setup, not raw form controls or MCP action sizing', () => {
  for (const control of ['Button', 'Badge', 'Checkbox', 'Field', 'Item', 'Collapsible']) assert.match(editor, new RegExp(`<${control}\\b`));
  assert.ok(!editor.includes('<input'));
  assert.ok(!editor.includes('mcp-editor-actions'));
  assert.match(editor, /!state.enabled \|\| repairOpen/);
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
  assert.match(primary, /copy all Chrome Cookies to Haish’s local browser/);
});

test('setup headings identify the actual stage instead of blaming Chrome authorization', () => {
  assert.equal(browserSetupHeading({ step: 'first_sync', status: 'needs_repair' }), 'First Cookie sync failed');
  assert.equal(browserSetupHeading({ step: 'verify', status: 'needs_repair' }), 'Browser verification failed');
  assert.equal(browserSetupHeading({ step: 'first_sync', setup_running: true }), 'First Cookie sync');
  assert.equal(browserSetupHeading({ status: 'cancelled' }), 'Setup cancelled');
  assert.equal(browserSetupHeading({ step: 'unknown' }), 'Browser needs attention');
  assert.match(editor, /browserSetupHeading\(state\)/);
});

test('maintenance actions share outlined buttons, icons and equal-size layout', () => {
  const maintenance = editor.slice(editor.indexOf('</> : state?.enabled ? <>'), editor.indexOf('</> : <Button size="sm" disabled>'));
  assert.equal((maintenance.match(/variant="outline" size="sm"/g) || []).length, 3);
  for (const icon of ['Wrench', 'Power', 'RefreshCw']) assert.ok(maintenance.includes(`<${icon} size={14}`));
  assert.ok(!maintenance.includes('variant="ghost"'));
  const css = fs.readFileSync(new URL('../../../src/features/settings/settings.css', import.meta.url), 'utf8');
  assert.match(css, /\.browser-maintenance-actions \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.browser-maintenance-actions \[data-slot="button"\] \{[^}]*height: 32px;[^}]*border: 1px solid/);
});

test('healthy runtime does not repeat the Enabled badge with another Ready status', () => {
  const summary = editor.slice(editor.indexOf('<dl className="browser-runtime-summary">'), editor.indexOf('</dl>'));
  assert.ok(!summary.includes('Browser Runtime'));
  assert.ok(!summary.includes('Ready'));
  assert.equal((summary.match(/<dt>/g) || []).length, 2);
  assert.match(editor, /state.dependency_status !== 'compatible'/);
  assert.match(editor, /runtimeIssue && !running && !state.message/);
  assert.match(editor, /<h3>Runtime version<\/h3>/);
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

test('sync/disable successes and action failures use toast and release busy state', async () => {
  const actionBody = editor.slice(editor.indexOf('const action = async (name) => {') + 'const action = async (name) => {'.length, editor.indexOf('\n  const mismatch'));
  const makeAction = new Function('apiFetch', 'API_BASE', 'parseResponseMessage', 'consent', 'replace', 'setBusy', 'setPendingAction', 'setState', 'setConsent', 'setReplace', 'setRepairOpen', 'onToast', `return async (name) => {${actionBody}`);
  for (const [name, ok] of [['sync', true], ['disable', true], ['repair', false]]) {
    const events = [];
    const next = { enabled: name !== 'disable' };
    const action = makeAction(async () => ({ ok, json: async () => next }), '', async () => 'Browser configuration failed.', false, false,
      value => events.push(['busy', value]), value => events.push(['pending', value]), value => events.push(['state', value]),
      () => {}, () => {}, () => {}, (kind, message) => events.push(['toast', kind, message]));
    await action(name);
    const toast = events.find(event => event[0] === 'toast');
    assert.equal(toast[1], ok ? 'success' : 'error');
    assert.match(toast[2], name === 'sync' ? /Sync requested/ : name === 'disable' ? /Disabled/ : /configuration failed/);
    assert.equal(events.some(event => event[0] === 'state'), ok);
    assert.deepEqual(events.slice(-2), [['busy', false], ['pending', '']]);
  }
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
  assert.match(editor, /starts on the first browser tool call/);
});
