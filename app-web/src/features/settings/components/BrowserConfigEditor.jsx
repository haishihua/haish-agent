import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { ArrowRight, Check, ChevronRight, PanelsTopLeft, Info, LoaderCircle, Monitor, Power, Pause, Play, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '../../../shared/ui/settings-elements/ui/button.tsx';
import { Badge } from '../../../shared/ui/settings-elements/ui/badge.tsx';
import { Checkbox } from '../../../shared/ui/settings-elements/ui/checkbox.tsx';
import { Field, FieldContent, FieldLabel, FieldDescription } from '../../../shared/ui/settings-elements/ui/field.tsx';
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../../../shared/ui/settings-elements/ui/item.tsx';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../../shared/ui/settings-elements/ui/collapsible.tsx';
import { browserDependencyAction, browserStatusMeta, browserSetupHeading, hasBrowserImportSummary, formatBrowserSyncTime, formatBrowserCookieCount } from '../model/browser-settings.js';

// Server owns installation and routing. Merely opening this pane is read-only.
export function BrowserConfigEditor({ onToast }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [replace, setReplace] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await apiFetch(`${API_BASE}/api/settings/tools/browser`, { signal: controller.signal });
        if (!response.ok) throw new Error(await parseResponseMessage(response, response.status === 404 ? 'This runtime does not support Browser settings yet. Your existing browser path is unchanged.' : 'Could not read Browser settings.'));
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
      const needsConsent = ['install', 'repair', 'keep_existing_logins'].includes(name);
      const response = await apiFetch(`${API_BASE}/api/settings/tools/browser`, {
        method: 'POST', body: JSON.stringify({ action: name, confirmed: needsConsent && consent, allow_replace: needsConsent && replace }),
      });
      if (!response.ok) throw new Error(await parseResponseMessage(response, 'Browser configuration failed.'));
      setState(await response.json());
      setConsent(false); setReplace(false);
      if (name === 'keep_existing_logins') onToast('success', 'Existing logins kept. Import will not resume.');
      if (name === 'disable') onToast('success', 'Disabled. Future browser calls use your original Chrome connection.');
    } catch (failure) {
      onToast('error', failure.message || 'Browser configuration failed.');
    } finally { setBusy(false); setPendingAction(''); }
  };
  const mismatch = ['version_mismatch', 'invalid'].includes(state?.dependency_status);
  const syncing = state?.sync_running || state?.status === 'syncing';
  const running = state?.setup_running || syncing;
  const maintenance = ['check', 'repair'].includes(state?.step);
  const status = browserStatusMeta(state);
  const dependency = browserDependencyAction(state);
  const showConsent = state && !running && dependency.consent;
  const runtimeIssue = state ? dependency.issue || '' : '';
  const blocked = busy || Boolean(error);
  const primaryDisabled = blocked || (dependency.consent && (!consent || (!state?.initial_import_error && mismatch && !replace)))
    || (!state?.initial_import_complete && !state?.initial_import_error && state?.paused);
  return <div className="settings-content-modern browser-settings">
    <div className="settings-page-heading"><h1>Browser</h1></div>
    <section className="browser-settings-surface" aria-labelledby="browser-sync-title">
      <Item className="browser-feature-heading">
        <ItemMedia variant="icon"><PanelsTopLeft size={18} /></ItemMedia>
        <ItemContent><ItemTitle><h2 id="browser-sync-title">Haish Browser</h2></ItemTitle><ItemDescription>Import logins once. Maintain them here afterward.</ItemDescription></ItemContent>
        <Badge variant="secondary" className={`browser-status ${status.tone}`} role="status">{status.loading ? <LoaderCircle size={12} className="settings-spin" aria-hidden="true" /> : status.tone === 'success' ? <Check size={12} aria-hidden="true" /> : state?.paused ? <Pause size={12} aria-hidden="true" /> : status.tone === 'warning' ? <Info size={12} aria-hidden="true" /> : null}<span className="browser-status-label">{status.label}</span></Badge>
      </Item>
      <div className="browser-feature-body">
        <div className="browser-connection" aria-label="One-time local login import">
          <span><Monitor size={16} /><strong>Personal Chrome</strong></span><ArrowRight size={16} aria-hidden="true" /><span><PanelsTopLeft size={16} /><strong>Haish browser</strong><Badge variant="outline">Local only</Badge></span>
        </div>
        {runtimeIssue && !running && !state.message && <p className="browser-runtime-issue" role="status"><Info size={14} />{runtimeIssue}{dependency.action === 'check' ? ' Use Check browser in Details.' : ''}</p>}
      </div>
      {(running || state?.message) && <div className={`browser-setup-status ${running || !state?.error_code ? '' : 'needs-attention'}`} role="status">{running ? <LoaderCircle size={16} className="settings-spin" /> : <Info size={16} />}<div><strong>{browserSetupHeading(state)}</strong><p>{state.message || 'Preparing dependencies and browser configuration…'}</p></div></div>}
      {showConsent && <div className="browser-setup-fields">
        <Field orientation="horizontal" className="browser-consent" data-disabled={blocked}>
          <Checkbox id="browser-sync-consent" checked={consent} onCheckedChange={value => setConsent(value === true)} disabled={blocked} aria-describedby="browser-sync-consent-description" />
          <FieldContent><FieldLabel htmlFor="browser-sync-consent">{state.initial_import_error ? 'Keep existing logins' : state.initial_import_complete ? 'Allow dependency repair' : 'Allow setup & initial import'}</FieldLabel><FieldDescription id="browser-sync-consent-description">{state.initial_import_error ? 'Skip remaining import. Sign in manually in Haish Browser.' : state.initial_import_complete ? 'Install or update required tools. Logins and browser selection stay unchanged.' : 'Install browser-use, Playwright and Chromium as needed. Import logins once.'}</FieldDescription></FieldContent>
        </Field>
        {mismatch && !state.initial_import_error && <Field orientation="horizontal" className="browser-consent browser-replace-consent" data-disabled={blocked}>
          <Checkbox id="browser-runtime-replace" checked={replace} onCheckedChange={value => setReplace(value === true)} disabled={blocked} aria-describedby="browser-runtime-replace-description" />
          <FieldContent><FieldLabel htmlFor="browser-runtime-replace">Replace incompatible Browser Runtime</FieldLabel><FieldDescription id="browser-runtime-replace-description">Install browser-use {state.required_version}. Other tools may share this CLI.</FieldDescription></FieldContent>
        </Field>}
      </div>}
      <div className="browser-settings-actions">
        <span className="browser-action-hint"><ShieldCheck size={14} />{running ? (syncing ? 'Importing logins once' : maintenance ? 'Logins and browser selection stay unchanged' : state?.step === 'waiting_allow' ? 'Click Allow in Chrome' : 'Keep Haish open during setup') : state?.enabled ? 'Account sessions stay on this device' : state?.initial_import_complete ? 'Saved logins stay in Haish Browser' : 'macOS only'}</span>
        <div className={`browser-action-buttons${state?.enabled && !running && !showConsent ? ' browser-maintenance-actions' : ''}`}>
          {running ? <Button variant="outline" size="sm" disabled={busy} onClick={() => action('cancel')}>{pendingAction === 'cancel' ? 'Cancelling…' : maintenance ? 'Cancel' : syncing ? 'Cancel import' : 'Cancel setup'}</Button> : <>
            {state && (state.enabled || state.paused) && <PortalTooltip text={state.paused ? 'Resume automation' : 'Pause automation'} position="above" multiline>
              <Button variant="outline" size="sm" disabled={blocked} onClick={() => action(state.paused ? 'resume' : 'pause')}>{state.paused ? <Play size={14} /> : <Pause size={14} />}{state.paused ? 'Resume' : 'Pause'}</Button>
            </PortalTooltip>}
            {state?.enabled && <PortalTooltip text="Use personal Chrome" position="above" multiline>
              <Button variant="outline" size="sm" disabled={blocked} onClick={() => action('disable')}><Power size={14} />{pendingAction === 'disable' ? 'Disabling…' : 'Disable'}</Button>
            </PortalTooltip>}
            {state && dependency.action && dependency.action !== 'check' && <Button size="sm" disabled={primaryDisabled} onClick={() => action(dependency.action)}>{busy && <LoaderCircle size={14} className="settings-spin" />}{busy ? 'Starting…' : dependency.label}</Button>}
            {!state && <Button size="sm" disabled>Checking…</Button>}
          </>}
        </div>
      </div>
    </section>
    {error && <ErrorState variant="inline" detail={error} />}
    <Collapsible className="browser-settings-details">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm"><Info size={14} />Details<ChevronRight size={14} className="browser-details-chevron" /></Button></CollapsibleTrigger>
      <CollapsibleContent><div className="browser-details-content">
        {state && <div><h3>Dependencies</h3><p>browser-use {state.required_version}{state.managed_browser_version ? ` · Playwright ${state.managed_browser_version} · Chromium` : ''}. Installed together during setup.</p><p>Check verifies tools without installing, opening a browser or changing logins.</p><Button variant="outline" size="sm" disabled={blocked || running || !state} onClick={() => action('check')}><Wrench size={14} />{pendingAction === 'check' || (running && state.step === 'check') ? 'Checking…' : 'Check browser'}</Button></div>}
        {hasBrowserImportSummary(state) && <dl className="browser-runtime-summary">
          <div><dt>Initial import</dt><dd>{formatBrowserSyncTime(state?.last_sync)}</dd></div>
          <div><dt>Copied Cookies</dt><dd>{formatBrowserCookieCount(state)}</dd></div>
        </dl>}
        <div><h3>Permissions</h3><p>Grant macOS permissions when prompted; click Allow yourself in Chrome. Haish won’t restart personal Chrome.</p></div>
        <div><h3>Scope</h3><p>Cookies only. No local storage or IndexedDB; some sites may still need login.</p></div>
        <div><h3>Login maintenance</h3><p>No further sync after import. Sign in or out directly in Haish Browser. Pause before manual use; already issued operations may still finish.</p></div>
        <div><h3>Browser access</h3><p>Disabled by default. Enabled: a separate, visible browser with a persistent profile. Opens on a browser call or first setup, stays open between tasks, and closes with Haish. Manual exit waits for the next call to reopen. No fallback to personal Chrome. Disabled: your original connection; saved logins remain.</p></div>
      </div></CollapsibleContent>
    </Collapsible>
  </div>;
}
