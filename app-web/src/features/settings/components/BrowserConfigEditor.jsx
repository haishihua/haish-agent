import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { AnimateDialog } from '../../../shared/ui/AnimateDialog.jsx';
import { ArrowRight, Check, ChevronRight, PanelsTopLeft, Info, LoaderCircle, Monitor, Power, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
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
  const [confirmReplace, setConfirmReplace] = useState(false);
  const replaceTriggerRef = useRef(null);
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
      // Replacement is confirmed in the UI right before dispatch, so it carries its own confirmation.
      const confirmed = name === 'replace_logins' || (needsConsent && consent);
      const response = await apiFetch(`${API_BASE}/api/settings/tools/browser`, {
        method: 'POST', body: JSON.stringify({ action: name, confirmed, allow_replace: needsConsent && replace }),
      });
      if (!response.ok) throw new Error(await parseResponseMessage(response, 'Browser configuration failed.'));
      setState(await response.json());
      setConsent(false); setReplace(false); setConfirmReplace(false);
      if (name === 'keep_existing_logins') onToast('success', 'Existing logins kept. Import will not resume.');
      if (name === 'replace_logins') onToast('success', 'Login replacement requested. Keep Haish open and refresh open pages after it finishes.');
      if (name === 'disable') onToast('success', 'Disabled. Future browser calls use your original Chrome connection.');
    } catch (failure) {
      setConfirmReplace(false);
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
  const canReplace = Boolean(state?.replace_available) && !running;
  const runtimeIssue = state ? dependency.issue || '' : '';
  // A pending confirmation never outlives the state that offered it.
  useEffect(() => { if (!canReplace) setConfirmReplace(false); }, [canReplace]);
  const blocked = busy || Boolean(error);
  const primaryDisabled = blocked || (dependency.consent && (!consent || (!state?.initial_import_error && mismatch && !replace)));
  return <div className="settings-content-modern browser-settings">
    <div className="settings-page-heading"><h1>Browser</h1></div>
    <section className="browser-settings-surface" aria-labelledby="browser-sync-title">
      <Item className="browser-feature-heading">
        <ItemMedia variant="icon"><PanelsTopLeft size={18} /></ItemMedia>
        <ItemContent><ItemTitle><h2 id="browser-sync-title">Haish Browser</h2></ItemTitle><ItemDescription>Import once, replace manually, or sign in here.</ItemDescription></ItemContent>
        <Badge variant="secondary" className={`browser-status ${status.tone}`} role="status">{status.loading ? <LoaderCircle size={12} className="settings-spin" aria-hidden="true" /> : status.tone === 'success' ? <Check size={12} aria-hidden="true" /> : status.tone === 'warning' ? <Info size={12} aria-hidden="true" /> : null}<span className="browser-status-label">{status.label}</span></Badge>
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
          <FieldContent><FieldLabel htmlFor="browser-sync-consent">{state.initial_import_error ? 'Keep existing logins' : state.initial_import_complete ? 'Allow dependency repair' : 'Allow setup & initial import'}</FieldLabel><FieldDescription id="browser-sync-consent-description">{state.initial_import_error ? 'Skip remaining import. Sign in manually in Haish Browser.' : state.initial_import_complete ? 'Install or update required tools. Logins and browser selection stay unchanged.' : 'Install browser-use and Playwright as needed. Stable Chrome must already be installed. Import logins once.'}</FieldDescription></FieldContent>
        </Field>
        {mismatch && !state.initial_import_error && <Field orientation="horizontal" className="browser-consent browser-replace-consent" data-disabled={blocked}>
          <Checkbox id="browser-runtime-replace" checked={replace} onCheckedChange={value => setReplace(value === true)} disabled={blocked} aria-describedby="browser-runtime-replace-description" />
          <FieldContent><FieldLabel htmlFor="browser-runtime-replace">Replace incompatible Browser Runtime</FieldLabel><FieldDescription id="browser-runtime-replace-description">Install browser-use {state.required_version}. Other tools may share this CLI.</FieldDescription></FieldContent>
        </Field>}
      </div>}
      <div className="browser-settings-actions">
        <span className="browser-action-hint"><ShieldCheck size={14} />{running ? (syncing ? (state?.sync_mode === 'replace' ? 'Replacing logins' : 'Importing logins once') : maintenance ? 'Logins and browser selection stay unchanged' : state?.step === 'waiting_allow' ? 'Click Allow in Chrome' : 'Keep Haish open during setup') : state?.enabled ? 'Account sessions stay on this device' : state?.initial_import_complete ? 'Saved logins stay in Haish Browser' : 'macOS only'}</span>
        <div className={`browser-action-buttons${state?.enabled && !running && !showConsent ? ' browser-maintenance-actions' : ''}`}>
          {running ? <Button variant="outline" size="sm" disabled={busy} onClick={() => action('cancel')}>{pendingAction === 'cancel' ? 'Cancelling…' : maintenance ? 'Cancel' : syncing ? (state?.sync_mode === 'replace' ? 'Cancel replacement' : 'Cancel import') : 'Cancel setup'}</Button> : <>
            {state?.enabled && <PortalTooltip text="Use original Chrome connection for new calls" position="above" multiline>
              <Button variant="outline" size="sm" disabled={blocked} onClick={() => action('disable')}><Power size={14} />{pendingAction === 'disable' ? 'Disabling…' : 'Disable'}</Button>
            </PortalTooltip>}
            {canReplace && <PortalTooltip text="Asks for confirmation, then copies personal Chrome Cookies over Haish Browser" position="above" multiline>
              <Button variant="outline" size="sm" disabled={blocked} onClick={() => setConfirmReplace(true)}><RefreshCw size={14} />Replace logins</Button>
            </PortalTooltip>}
            {state && dependency.action && dependency.action !== 'check' && <Button size="sm" disabled={primaryDisabled} onClick={() => action(dependency.action)}>{busy && <LoaderCircle size={14} className="settings-spin" />}{busy ? 'Starting…' : dependency.label}</Button>}
            {!state && <Button size="sm" disabled>Checking…</Button>}
          </>}
        </div>
      </div>
    </section>
    {error && <ErrorState variant="inline" detail={error} />}
    <AnimateDialog open={Boolean(confirmReplace && canReplace)} danger title="Replace Haish Browser logins"
      description="Copy the current personal Chrome Cookies over the Haish Browser profile. Existing Haish logins and open pages may be lost; refresh pages afterwards."
      onClose={() => setConfirmReplace(false)}
      onOpenAutoFocus={() => { replaceTriggerRef.current = document.activeElement; }}
      onCloseAutoFocus={event => { event.preventDefault(); if (replaceTriggerRef.current?.isConnected) replaceTriggerRef.current.focus(); }}>
      <div className="haish-dialog-actions">
        <button type="button" onClick={() => setConfirmReplace(false)}>Cancel</button>
        <button type="button" className="primary" onClick={() => { setConfirmReplace(false); action('replace_logins'); }}>Replace logins</button>
      </div>
    </AnimateDialog>
    <Collapsible className="browser-settings-details">
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm"><Info size={14} />Details<ChevronRight size={14} className="browser-details-chevron" /></Button></CollapsibleTrigger>
      <CollapsibleContent><div className="browser-details-content">
        {state && <div><h3>Dependencies</h3><p>browser-use {state.required_version}{state.managed_browser_version ? ` · Playwright ${state.managed_browser_version} · Google Chrome` : ''}. Tools are installed during setup; stable Chrome is required separately.</p><p>Check verifies tools without installing, opening a browser or changing logins.</p><Button variant="outline" size="sm" disabled={blocked || running || !state} onClick={() => action('check')}><Wrench size={14} />{pendingAction === 'check' || (running && state.step === 'check') ? 'Checking…' : 'Check browser'}</Button></div>}
        {hasBrowserImportSummary(state) && <dl className="browser-runtime-summary">
          <div><dt>{state?.last_operation?.mode === 'replace' ? 'Last replacement' : 'Initial import'}</dt><dd>{formatBrowserSyncTime(state?.last_operation?.at || state?.last_sync)}</dd></div>
          <div><dt>Copied Cookies</dt><dd>{formatBrowserCookieCount(state)}</dd></div>
        </dl>}
        <div><h3>Permissions</h3><p>Grant macOS permissions when prompted; click Allow yourself in Chrome. Haish won’t restart personal Chrome.</p></div>
        <div><h3>Import scope</h3><p>Initial import copies Cookies only, not local storage or IndexedDB. A manual replacement clears Haish Browser Cookies and copies the current personal Chrome Cookies; local storage, IndexedDB, Cache Storage and device-bound tokens are not replaced. Logins saved directly in Haish Browser stay in its profile until a replacement clears them; some sites may still need login.</p></div>
        <div><h3>Login maintenance</h3><p>No automatic sync after import. Replace logins asks for a second confirmation, then copies personal Chrome again; it keeps Haish Browser open and does not restart Chrome. Refresh open pages afterward. Sign in or out directly in Haish Browser. Disable before manual use; already dispatched operations may still finish. Disabling does not change Chrome’s startup attributes; some sites may still reject sign-in.</p></div>
        <div><h3>Browser access</h3><p>Disabled by default. Enabled: a separate, visible browser with a persistent profile. Opens on a browser call or first setup, stays open between tasks, and closes with Haish. Manual exit waits for the next call to reopen. No fallback to personal Chrome. Disabled: new calls use your original Chrome connection, not Haish Browser. This does not disable the browser tool or close the window; saved logins remain.</p></div>
      </div></CollapsibleContent>
    </Collapsible>
  </div>;
}
