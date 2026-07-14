// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';
import { DEFAULT_REASONING_EFFORT, REASONING_EFFORT_OPTIONS, PROVIDER_MODEL_CATALOG } from './shared-constants.jsx';

export function resolveModelCatalog(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized && PROVIDER_MODEL_CATALOG[normalized]) return PROVIDER_MODEL_CATALOG[normalized];
  return PROVIDER_MODEL_CATALOG.oauth;
}

// Kept in sync with the backend default reasoning effort.

export const APPROVAL_MODE_OPTIONS = [
  { id: 'strict', label: 'Request Approval', icon: 'ask-for-help.png',   desc: 'Ask before every write or network op' },
  { id: 'smart',  label: 'Auto Approve',     icon: 'generative.png',     desc: 'Allow safe ops, ask on risk' },
  { id: 'full',   label: 'Full Access',      icon: 'cyber-security.png', desc: 'Allow everything without prompting' },
];

export function resolveApprovalApiBase() {
  if (typeof window !== 'undefined') {
    const explicit = String(window.AGENT_WORLD_API_BASE || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
  }
  return '';
}

export function ApprovalModePicker({ disabled = false, readOnly = false }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState('smart');
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const rootRef = React.useRef(null);
  const API = resolveApprovalApiBase();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API}/api/approvals/state`, { cache: 'no-store' });
        if (!resp.ok) throw new Error('state fetch failed');
        const data = await resp.json();
        if (!cancelled && data && typeof data.mode === 'string') {
          setMode(data.mode);
        }
      } catch (_) {
        // backend may not be ready; fall back to smart
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function changeMode(next) {
    if (readOnly || disabled || next === mode || busy) { setOpen(false); return; }
    const prev = mode;
    setMode(next);
    setOpen(false);
    setBusy(true);
    try {
      const resp = await fetch(`${API}/api/approvals/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!resp.ok) throw new Error(`set mode failed: ${resp.status}`);
    } catch (err) {
      console.warn('[approval-mode] failed to set mode, reverting', err);
      setMode(prev);
    } finally {
      setBusy(false);
    }
  }

  const current = APPROVAL_MODE_OPTIONS.find((o) => o.id === mode) || APPROVAL_MODE_OPTIONS[1];

  return (
    <div className={`approval-mode-picker ${open ? 'is-open' : ''} ${loaded ? '' : 'is-loading'} ${readOnly ? 'is-readonly' : ''}`} ref={rootRef}>
      <PortalTooltip text={open ? '' : `Approval mode · ${current.label}`} position="above">
        <button
          type="button"
          className="approval-mode-trigger"
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
          aria-disabled={disabled ? 'true' : undefined}
          aria-readonly={readOnly ? 'true' : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Approval mode"
        >
          <span
            className="approval-mode-icon"
            style={{
              WebkitMaskImage: `url("assets/ui/icons/${current.icon}")`,
              maskImage: `url("assets/ui/icons/${current.icon}")`,
            }}
            aria-hidden="true"
          />
          <span className="approval-mode-label">{current.label}</span>
          <span className="approval-mode-caret" aria-hidden="true" />
        </button>
      </PortalTooltip>
      {open ? (
        <div className="approval-mode-menu" role="listbox">
          <div className="approval-mode-header">approval mode</div>
          <div className="approval-mode-list">
            {APPROVAL_MODE_OPTIONS.map((opt) => {
              const active = opt.id === mode;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`approval-mode-option ${active ? 'is-active' : ''} ${readOnly ? 'is-readonly' : ''}`}
                  aria-disabled={readOnly ? 'true' : undefined}
                  onClick={() => changeMode(opt.id)}
                  title={opt.desc}
                >
                  <span
                    className="approval-mode-option-icon"
                    style={{
                      WebkitMaskImage: `url("assets/ui/icons/${opt.icon}")`,
                      maskImage: `url("assets/ui/icons/${opt.icon}")`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="approval-mode-option-text">
                    <span className="approval-mode-option-label">{opt.label}</span>
                    <span className="approval-mode-option-desc">{opt.desc}</span>
                  </span>
                  {active ? (
                    <span className="approval-mode-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                           strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3.2,8.6 6.6,12 13,4.8" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
export function ModelPicker({
  value,
  reasoningEffort,
  options = [],
  reasoningOptions = REASONING_EFFORT_OPTIONS,
  onChange,
  onReasoningChange,
  disabled,
  readOnly = false,
  loading = false,
  providerValue,
  providerOptions = [],
  onProviderChange,
  agentValue,
  agentOptions,
  onAgentChange,
  agentLoading = false,
  agentLocked = false,
  agentLockedReason = '',
}) {
  const [open, setOpen] = React.useState(false);
  const [activeSubmenu, setActiveSubmenu] = React.useState(null);
  const rootRef = React.useRef(null);
  const current = options.find((o) => o.id === value) || options[0];
  const currentProvider = providerOptions.find((o) => o.id === providerValue) || providerOptions[0] || null;
  const currentReasoning = reasoningOptions.find((o) => o.id === reasoningEffort) || reasoningOptions.find((o) => o.id === DEFAULT_REASONING_EFFORT) || reasoningOptions[0];
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : [];
  const currentAgent = resolvedAgentOptions.find((o) => o.id === agentValue)
    || (agentValue ? { id: agentValue, label: agentValue } : null)
    || resolvedAgentOptions[0]
    || null;
  const modelLabel = current ? current.label : (currentProvider ? (loading ? 'loading' : 'unavailable') : 'No model');
  const providerLabel = currentProvider ? currentProvider.label : 'Configure LLM';
  const agentLabel = currentAgent ? currentAgent.label : (agentLoading ? 'loading' : 'Agent');
  const pickerLoading = agentLoading;
  const agentChangeDisabled = disabled || readOnly || pickerLoading || agentLocked;
  const agentLockText = agentLockedReason || 'Cannot change agent for this conversation.';

  React.useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setActiveSubmenu(null);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        setActiveSubmenu(null);
      }
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const triggerButton = (
    <button
      type="button"
      className="model-picker-trigger"
      onClick={() => {
        if (disabled || pickerLoading) return;
        setOpen((o) => {
          if (o) setActiveSubmenu(null);
          return !o;
        });
      }}
      disabled={disabled || pickerLoading}
      aria-disabled={disabled ? 'true' : undefined}
      aria-readonly={readOnly ? 'true' : undefined}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label="Select run configuration"
    >
      <span className="model-picker-value">{agentLabel}</span>
      <span className={pickerLoading ? 'model-picker-loading' : 'model-picker-caret'} aria-hidden="true" />
    </button>
  );

  return (
    <div className={`model-picker run-config-picker ${open ? 'is-open' : ''} ${pickerLoading ? 'is-loading' : ''} ${readOnly ? 'is-readonly' : ''}`} ref={rootRef}>
      {triggerButton}
      {open ? (
        <div className={`model-picker-menu ${activeSubmenu ? 'has-flyout' : ''}`} role="menu">
          {currentAgent ? (
            <div className="model-picker-section">
              <div className="model-picker-list">
                {resolvedAgentOptions.map((opt) => {
                  const active = opt.id === currentAgent?.id;
                  return (
                    <PortalTooltip key={opt.id} text={agentLocked ? agentLockText : ''} position="above">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        aria-disabled={agentChangeDisabled ? 'true' : undefined}
                        className={`model-picker-option ${active ? 'is-active' : ''} ${agentChangeDisabled ? 'is-disabled' : ''}`}
                        onClick={() => {
                          if (agentChangeDisabled) return;
                          onAgentChange?.(opt.id);
                          setOpen(false);
                          setActiveSubmenu(null);
                        }}
                      >
                        <span className="model-picker-option-label">{opt.label || opt.id}</span>
                        {active ? (
                          <span className="model-picker-check" aria-hidden="true">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3.2,8.6 6.6,12 13,4.8" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    </PortalTooltip>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="model-picker-submenu">
            <button
              type="button"
              role="menuitem"
              className={`model-picker-option model-picker-submenu-entry ${activeSubmenu === 'provider' ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveSubmenu('provider')}
              onFocus={() => setActiveSubmenu('provider')}
              onClick={() => setActiveSubmenu((currentOpen) => currentOpen === 'provider' ? null : 'provider')}
              aria-haspopup="listbox"
              aria-expanded={activeSubmenu === 'provider'}
            >
              <span className="model-picker-option-label">{providerLabel}</span>
              <span className="model-picker-subcaret" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="menuitem"
              className={`model-picker-option model-picker-submenu-entry ${activeSubmenu === 'model' ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveSubmenu('model')}
              onFocus={() => setActiveSubmenu('model')}
              onClick={() => setActiveSubmenu((currentOpen) => currentOpen === 'model' ? null : 'model')}
              aria-haspopup="listbox"
              aria-expanded={activeSubmenu === 'model'}
            >
              <span className="model-picker-option-label">{modelLabel}</span>
              <span className="model-picker-subcaret" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="menuitem"
              className={`model-picker-option model-picker-submenu-entry ${activeSubmenu === 'thinking' ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveSubmenu('thinking')}
              onFocus={() => setActiveSubmenu('thinking')}
              onClick={() => setActiveSubmenu((currentOpen) => currentOpen === 'thinking' ? null : 'thinking')}
              aria-haspopup="listbox"
              aria-expanded={activeSubmenu === 'thinking'}
            >
              <span className="model-picker-option-label">{currentReasoning ? currentReasoning.label : ''}</span>
              <span className="model-picker-subcaret" aria-hidden="true" />
            </button>
            {activeSubmenu === 'provider' ? (
              <div className="model-picker-flyout model-picker-flyout-provider" role="listbox" aria-label="provider">
                <div className="model-picker-header">provider</div>
                <div className="model-picker-list">
                  {providerOptions.length === 0 ? (
                    <div className="model-picker-empty">Configure LLM in Settings</div>
                  ) : providerOptions.map((opt) => {
                    const active = opt.id === currentProvider?.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`model-picker-option ${active ? 'is-active' : ''} ${readOnly ? 'is-readonly' : ''}`}
                        aria-disabled={readOnly ? 'true' : undefined}
                        onClick={() => { if (readOnly) return; onProviderChange?.(opt.id); setOpen(false); setActiveSubmenu(null); }}
                      >
                        <span className="model-picker-option-label">{opt.label || opt.id}</span>
                        {active ? (
                          <span className="model-picker-check" aria-hidden="true">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3.2,8.6 6.6,12 13,4.8" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {activeSubmenu === 'model' ? (
              <div className="model-picker-flyout model-picker-flyout-model" role="listbox" aria-label="model">
                <div className="model-picker-header">model</div>
                <div className="model-picker-list">
                  {options.length === 0 ? (
                    <div className="model-picker-empty">No models</div>
                  ) : options.map((opt) => {
                    const active = opt.id === value;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`model-picker-option model-picker-model-option ${active ? 'is-active' : ''} ${readOnly ? 'is-readonly' : ''}`}
                        aria-disabled={readOnly ? 'true' : undefined}
                        onClick={() => { if (readOnly) return; onChange(opt.id); setOpen(false); setActiveSubmenu(null); }}
                      >
                        <span className="model-picker-option-label">{opt.label}</span>
                        {active ? (
                          <span className="model-picker-check" aria-hidden="true">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3.2,8.6 6.6,12 13,4.8" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {activeSubmenu === 'thinking' ? (
              <div className="model-picker-flyout model-picker-flyout-thinking" role="listbox" aria-label="thinking">
                <div className="model-picker-header">thinking</div>
                <div className="model-picker-list">
                  {reasoningOptions.map((opt) => {
                    const active = opt.id === currentReasoning?.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`model-picker-option ${active ? 'is-active' : ''} ${readOnly ? 'is-readonly' : ''}`}
                        aria-disabled={readOnly ? 'true' : undefined}
                        onClick={() => { if (readOnly) return; onReasoningChange?.(opt.id); setOpen(false); setActiveSubmenu(null); }}
                      >
                        <span className="model-picker-option-label">{opt.label}</span>
                        {active ? (
                          <span className="model-picker-check" aria-hidden="true">
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3.2,8.6 6.6,12 13,4.8" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
