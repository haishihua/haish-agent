import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { ArrowRight, Check, ChevronRight, PanelsTopLeft, Info, LoaderCircle, Monitor, Power, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Badge } from '../../../shared/ui/settings-elements/ui/badge.tsx';
import { Checkbox } from '../../../shared/ui/settings-elements/ui/checkbox.tsx';
import { Field, FieldContent, FieldLabel, FieldDescription } from '../../../shared/ui/settings-elements/ui/field.tsx';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../../shared/ui/settings-elements/ui/collapsible.tsx';
import { browserStatusMeta, browserSetupHeading, formatBrowserSyncTime, formatBrowserCookieCount } from '../model/browser-settings.js';

// Server owns installation and routing. Merely opening this pane is read-only.
export function BrowserConfigEditor({ onToast }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [replace, setReplace] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await apiFetch(`${API_BASE}/api/settings/tools/browser`, { signal: controller.signal });
        if (!response.ok) throw new Error(await parseResponseMessage(response, response.status === 404 ? 'This runtime does not support Browser login sync yet. Your existing browser path is unchanged.' : 'Could not read Browser settings.'));
        const next = await response.json();
        if (!stopped) { setState(next); setError(''); }
      } catch (failure) {
        if (!stopped) setError(failure.message || 'Could not read Browser settings.');
      } finally {
        if (!stopped) timer = setTimeout(refresh, 2000);
      }
    };
    refresh();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, []);
  const action = async (name) => {
    setBusy(true); setPendingAction(name);
    try {
      const response = await apiFetch(`${API_BASE}/api/settings/tools/browser`, {
        method: 'POST', body: JSON.stringify({ action: name, confirmed: consent, allow_replace: replace }),
      });
      if (!response.ok) throw new Error(await parseResponseMessage(response, 'Browser configuration failed.'));
      setState(await response.json());
      if (['install', 'repair'].includes(name)) { setConsent(false); setReplace(false); setRepairOpen(false); }
      if (name === 'sync') onToast('success', 'Sync requested. The extension may take about a minute to pick it up.');
      if (name === 'disable') onToast('success', 'Disabled. Future browser calls use your original Chrome connection.');
    } catch (failure) {
      onToast('error', failure.message || 'Browser configuration failed.');
    } finally { setBusy(false); setPendingAction(''); }
  };
  const mismatch = ['version_mismatch', 'invalid'].includes(state?.dependency_status);
  const running = state?.setup_running;
  const status = browserStatusMeta(state);
  const showSetup = state && !running && (!state.enabled || repairOpen);
  const runtimeIssue = state && state.dependency_status !== 'compatible'
    ? (mismatch ? 'Browser Runtime update required.' : state.dependency_status === 'missing' ? 'Browser Runtime is not installed.' : 'Browser Runtime needs setup.')
    : '';
  return <div className="settings-content-modern browser-settings">
    <div className="settings-page-heading"><h1>Browser</h1></div>
    <section className="browser-settings-surface" aria-labelledby="browser-sync-title">
      <Item className="browser-feature-heading">
        <ItemMedia variant="icon"><PanelsTopLeft size={18} /></ItemMedia>
        <ItemContent><ItemTitle><h2 id="browser-sync-title">Agent Cookie Sync</h2></ItemTitle><ItemDescription>Sync Chrome logins locally.</ItemDescription></ItemContent>
        <Badge variant="secondary" className={`browser-status ${status.tone}`} role="status">{status.loading && <LoaderCircle size={12} className="settings-spin" />}{status.tone === 'success' && <Check size={12} />}{status.label}</Badge>
      </Item>
      <div className="browser-feature-body">
        <div className="browser-connection" aria-label="One-way local Cookie sync">
          <span><Monitor size={16} /><strong>Personal Chrome</strong></span><ArrowRight size={16} aria-hidden="true" /><span><PanelsTopLeft size={16} /><strong>Haish browser</strong><Badge variant="outline">Local only</Badge></span>
        </div>
        <dl className="browser-runtime-summary">
          <div><dt>Last sync</dt><dd>{formatBrowserSyncTime(state?.last_sync)}</dd></div>
          <div><dt>Copied Cookies</dt><dd>{formatBrowserCookieCount(state)}</dd></div>
        </dl>
        {runtimeIssue && !running && !state.message && <p className="browser-runtime-issue" role="status"><Info size={14} />{runtimeIssue}</p>}
      </div>
      {(running || state?.message) && <div className={`browser-setup-status ${running ? '' : 'needs-attention'}`} role="status">{running ? <LoaderCircle size={16} className="settings-spin" /> : <Info size={16} />}<div><strong>{browserSetupHeading(state)}</strong><p>{state.message || 'Preparing dependencies and browser configuration…'}</p></div></div>}
      {showSetup && <div className="browser-setup-fields">
        <Field orientation="horizontal" className="browser-consent" data-disabled={busy}>
          <Checkbox id="browser-sync-consent" checked={consent} onCheckedChange={value => setConsent(value === true)} disabled={busy} aria-describedby="browser-sync-consent-description" />
          <FieldContent><FieldLabel htmlFor="browser-sync-consent">Allow setup & login sync</FieldLabel><FieldDescription id="browser-sync-consent-description">Install required tools and copy all Chrome Cookies to Haish’s local browser.</FieldDescription></FieldContent>
        </Field>
        {mismatch && <Field orientation="horizontal" className="browser-consent browser-replace-consent" data-disabled={busy}>
          <Checkbox id="browser-runtime-replace" checked={replace} onCheckedChange={value => setReplace(value === true)} disabled={busy} aria-describedby="browser-runtime-replace-description" />
          <FieldContent><FieldLabel htmlFor="browser-runtime-replace">Replace incompatible Browser Runtime</FieldLabel><FieldDescription id="browser-runtime-replace-description">Install version {state.required_version}. This shared runtime may also be used by other local tools.</FieldDescription></FieldContent>
        </Field>}
      </div>}
      <div className="browser-settings-actions">
        <span className="browser-action-hint"><ShieldCheck size={14} />{running ? 'Chrome Allow requires your confirmation' : state?.enabled ? 'Account sessions stay on this device' : 'macOS only'}</span>
        <div className={`browser-action-buttons${state?.enabled && !running && !showSetup ? ' browser-maintenance-actions' : ''}`}>
          {running ? <Button variant="outline" size="sm" disabled={busy} onClick={() => action('cancel')}>{pendingAction === 'cancel' ? 'Cancelling…' : 'Cancel setup'}</Button> : showSetup ? <>
            {state.enabled && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setRepairOpen(false); setConsent(false); setReplace(false); }}>Cancel</Button>}
            <Button size="sm" disabled={busy || !state || !consent || (mismatch && !replace)} onClick={() => action(state.enabled ? 'repair' : 'install')}>{busy && <LoaderCircle size={14} className="settings-spin" />}{busy ? 'Starting…' : state.enabled ? 'Repair and verify' : 'Install and enable'}</Button>
          </> : state?.enabled ? <>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { setRepairOpen(true); setConsent(false); setReplace(false); }}><Wrench size={14} />Repair</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => action('disable')}><Power size={14} />{pendingAction === 'disable' ? 'Disabling…' : 'Disable'}</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => action('sync')}><RefreshCw size={14} className={pendingAction === 'sync' ? 'settings-spin' : ''} />{pendingAction === 'sync' ? 'Requesting…' : 'Request sync'}</Button>
          </> : <Button size="sm" disabled>Install and enable</Button>}
        </div>
      </div>
    </section>
    {error && <ErrorState variant="inline" detail={error} />}
    <Collapsible className="browser-settings-details">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm"><Info size={14} />Details<ChevronRight size={14} className="browser-details-chevron" /></Button></CollapsibleTrigger>
      <CollapsibleContent><div className="browser-details-content">
        <div><h3>Permissions</h3><p>Grant macOS permissions when prompted; click Allow yourself in Chrome. Haish won’t restart personal Chrome.</p></div>
        <div><h3>Scope</h3><p>All Cookies, including Google, Meta and X. No local storage or IndexedDB; some sites may still need login.</p></div>
        <div><h3>Background sync</h3><p>Updates and deletions sync in the background. Changes may take a few minutes.</p></div>
        <div><h3>Browser access</h3><p>Disabled by default. Haish’s browser starts on the first browser tool call. A dash means sync statistics are not available in this app session, not that copied sessions were erased. When enabled, failures do not silently switch to personal Chrome or replay actions. Disabling restores the original connection; it does not uninstall the extension or erase copied sessions.</p></div>
        {state && <div><h3>Runtime version</h3><p>Required {state.required_version}{state.installed_version ? ` · Installed ${state.installed_version}` : ''}</p></div>}
      </div></CollapsibleContent>
    </Collapsible>
  </div>;
}
