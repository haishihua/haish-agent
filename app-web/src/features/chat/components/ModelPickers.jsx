import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { DEFAULT_REASONING_EFFORT, REASONING_EFFORT_OPTIONS } from '../model/run-catalog.js';

export const APPROVAL_MODE_OPTIONS = [
  { id: 'strict', label: 'Request Approval', icon: 'ask-for-help.png',   desc: 'Ask before every write or network op' },
  { id: 'smart',  label: 'Auto Approve',     icon: 'generative.png',     desc: 'Allow safe ops, ask on risk' },
  { id: 'full',   label: 'Full Access',      icon: 'cyber-security.png', desc: 'Allow everything without prompting' },
];

export function resolveApprovalApiBase() {
  if (typeof window !== 'undefined') {
    const explicit = String(window.HAISH_API_BASE || '').trim();
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
  const API = React.useMemo(() => resolveApprovalApiBase(), []);

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
  }, [API]);

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
  const alternateModes = APPROVAL_MODE_OPTIONS.filter((option) => option.id !== current.id);
  const approvalHint = (option) => `${option.label}\n${option.desc}`;

  return (
    <div className={`approval-mode-picker ${open ? 'is-open' : ''} ${loaded ? '' : 'is-loading'} ${readOnly ? 'is-readonly' : ''}`} ref={rootRef}>
      <PortalTooltip text={open ? '' : approvalHint(current)} position="above" multiline>
        <button
          type="button"
          className="approval-mode-trigger"
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
          aria-disabled={disabled ? 'true' : undefined}
          aria-readonly={readOnly ? 'true' : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={approvalHint(current)}
        >
          <span
            className="approval-mode-icon"
            style={{
              WebkitMaskImage: `url("assets/ui/icons/${current.icon}")`,
              maskImage: `url("assets/ui/icons/${current.icon}")`,
            }}
            aria-hidden="true"
          />
        </button>
      </PortalTooltip>
      {open ? (
        <div className="approval-mode-menu" role="menu" aria-label="Approval mode">
          {alternateModes.map((opt, index) => (
            <PortalTooltip key={opt.id} text={approvalHint(opt)} position="above" multiline openDelay={180}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked="false"
                  className={`approval-mode-option approval-mode-option-${index + 1} ${readOnly ? 'is-readonly' : ''}`}
                  aria-disabled={readOnly ? 'true' : undefined}
                  aria-label={approvalHint(opt)}
                  onClick={() => changeMode(opt.id)}
                >
                  <span
                    className="approval-mode-option-icon"
                    style={{
                      WebkitMaskImage: `url("assets/ui/icons/${opt.icon}")`,
                      maskImage: `url("assets/ui/icons/${opt.icon}")`,
                    }}
                    aria-hidden="true"
                  />
                </button>
            </PortalTooltip>
          ))}
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
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeSubmenu, setActiveSubmenu] = React.useState(null);
  const rootRef = React.useRef(null);
  const current = options.find((o) => o.id === value) || options[0];
  const currentProvider = providerOptions.find((o) => o.id === providerValue) || providerOptions[0] || null;
  const currentReasoning = reasoningOptions.find((o) => o.id === reasoningEffort) || reasoningOptions.find((o) => o.id === DEFAULT_REASONING_EFFORT) || reasoningOptions[0];
  const currentReasoningIndex = Math.max(0, reasoningOptions.findIndex((o) => o.id === currentReasoning?.id));
  const reasoningRatio = currentReasoningIndex / Math.max(1, reasoningOptions.length - 1);
  const reasoningProgressOffset = 12 - (24 * reasoningRatio);
  const reasoningProgress = `calc(${reasoningRatio * 100}% ${reasoningProgressOffset < 0 ? '-' : '+'} ${Math.abs(reasoningProgressOffset)}px)`;
  const gaugeRotation = `${currentReasoningIndex * 80 - 165}deg`;
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : [];
  const currentAgent = resolvedAgentOptions.find((o) => o.id === agentValue)
    || (agentValue ? { id: agentValue, label: agentValue } : null)
    || resolvedAgentOptions[0]
    || null;
  const modelLabel = current ? current.label : (currentProvider ? (loading ? 'loading' : 'unavailable') : 'No model');
  const providerLabel = currentProvider ? currentProvider.label : 'Configure LLM';
  const agentLabel = currentAgent ? currentAgent.label : 'Agent';
  const pickerLoading = agentLoading;
  const agentChangeDisabled = disabled || readOnly || pickerLoading || agentLocked;
  const agentLockText = agentLockedReason || 'Cannot change agent for this conversation.';

  React.useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setMenuOpen(false);
        setActiveSubmenu(null);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        setMenuOpen(false);
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
          setMenuOpen(false);
          setActiveSubmenu(null);
          return !o;
        });
      }}
      disabled={disabled || pickerLoading}
      aria-disabled={disabled ? 'true' : undefined}
      aria-readonly={readOnly ? 'true' : undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Run configuration, thinking ${currentReasoning?.label || 'unknown'}`}
    >
      {pickerLoading ? <span className="model-picker-loading" aria-hidden="true" /> : (
        <svg className="model-picker-gauge" style={{ '--gauge-rotation': gaugeRotation }} viewBox="0 0 24 24" aria-hidden="true">
          <path className="model-picker-gauge-arc" d="M3.34 19a10 10 0 1 1 17.32 0" />
          <g className="model-picker-gauge-needle">
            <path className="model-picker-gauge-pointer" d="M10.9 13.4 12.6 15.1 18.65 7.35Z" />
            <circle cx="12" cy="14" r="1.8" />
          </g>
        </svg>
      )}
    </button>
  );

  return (
    <div className={`model-picker run-config-picker ${open ? 'is-open' : ''} ${pickerLoading ? 'is-loading' : ''} ${readOnly ? 'is-readonly' : ''}`} ref={rootRef}>
      <PortalTooltip text={open ? '' : `Thinking · ${currentReasoning?.label || 'unknown'}`} position="above">
        {triggerButton}
      </PortalTooltip>
      {open && !menuOpen ? (
        <div className={`model-picker-quick thinking-${currentReasoning?.id || 'unknown'}`} role="dialog" aria-label="Thinking level">
          <button
            type="button"
            className="model-picker-quick-summary"
            onClick={() => { setMenuOpen(true); setActiveSubmenu(null); }}
            aria-label="Open agent and model settings"
          >
            <span>{modelLabel}</span>
            <strong>{currentReasoning?.label || 'Thinking'}</strong>
            <span className="model-picker-subcaret" aria-hidden="true" />
          </button>
          <div className={`model-picker-reasoning thinking-${currentReasoning?.id || 'unknown'}`} style={{ '--reasoning-progress': reasoningProgress }}>
            <input
              type="range"
              min="0"
              max={Math.max(0, reasoningOptions.length - 1)}
              step="1"
              value={currentReasoningIndex}
              disabled={disabled || readOnly}
              aria-label="Thinking level"
              aria-valuetext={currentReasoning?.label || 'Thinking'}
              onChange={(event) => onReasoningChange?.(reasoningOptions[Number(event.target.value)]?.id)}
            />
            <span className="model-picker-reasoning-marks" aria-hidden="true">
              {reasoningOptions.map((option, index) => <i className={index === currentReasoningIndex ? 'is-active' : ''} key={option.id} />)}
            </span>
          </div>
        </div>
      ) : null}
      {open && menuOpen ? (
        <div className={`model-picker-menu ${activeSubmenu ? 'has-flyout' : ''}`} role="menu">
          <div className="model-picker-submenu">
            {currentAgent ? (
              <button
                type="button"
                role="menuitem"
                className={`model-picker-option model-picker-submenu-entry ${activeSubmenu === 'agent' ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveSubmenu('agent')}
                onFocus={() => setActiveSubmenu('agent')}
                onClick={() => setActiveSubmenu((currentOpen) => currentOpen === 'agent' ? null : 'agent')}
                aria-haspopup="listbox"
                aria-expanded={activeSubmenu === 'agent'}
              >
                <span className="model-picker-option-label">{agentLabel}</span>
                <span className="model-picker-subcaret" aria-hidden="true" />
              </button>
            ) : null}
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
            {activeSubmenu === 'agent' ? (
              <div className="model-picker-flyout model-picker-flyout-agent" role="listbox" aria-label="agent">
                <div className="model-picker-header">agent</div>
                <div className="model-picker-list">
                  {resolvedAgentOptions.map((opt) => {
                    const active = opt.id === currentAgent?.id;
                    return (
                      <PortalTooltip key={opt.id} text={agentLocked ? agentLockText : ''} position="above">
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
