// @haish-esm
import React from 'react';
import anthropicLogo from '@lobehub/icons-static-svg/icons/anthropic.svg';
import deepseekLogo from '@lobehub/icons-static-svg/icons/deepseek.svg';
import geminiLogo from '@lobehub/icons-static-svg/icons/gemini.svg';
import minimaxLogo from '@lobehub/icons-static-svg/icons/minimax.svg';
import moonshotLogo from '@lobehub/icons-static-svg/icons/moonshot.svg';
import ollamaLogo from '@lobehub/icons-static-svg/icons/ollama.svg';
import openaiLogo from '@lobehub/icons-static-svg/icons/openai.svg';
import qwenLogo from '@lobehub/icons-static-svg/icons/qwen.svg';
import xaiLogo from '@lobehub/icons-static-svg/icons/xai.svg';
import zhipuLogo from '@lobehub/icons-static-svg/icons/zhipu.svg';
import tavilyLogo from '@lobehub/icons-static-svg/icons/tavily.svg';
import serpapiLogo from '../../../assets/ui/icons/serpapi.svg';
import neo4jLogo from '../../../assets/ui/icons/neo4j.svg';
import qdrantLogo from '../../../assets/ui/icons/qdrant.svg';
import { PortalTooltip } from '../../panels/PortalTooltip.jsx';
import { SOFTWARE_DEVELOPMENT_WORKFLOW_ID } from '../../lib/agent-catalog.js';

const { useState, useEffect, useRef } = React;

export const SETTINGS_SUBTAB_ICONS = {
  chat: 'message',
  vision: 'eye',
  embedding: 'layers',
  'tools-mcp': 'nodes',
  'tools-skills': 'wrench',
  'tools-web': 'globe',
};
const PROVIDER_LOGOS = {
  openai: openaiLogo,
  xai: xaiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  deepseek: deepseekLogo,
  dashscope: qwenLogo,
  moonshot: moonshotLogo,
  minimax: minimaxLogo,
  zhipu: zhipuLogo,
  ollama: ollamaLogo,
};

const CONNECTION_BRAND_LOGOS = {
  'memory-neo4j': neo4jLogo,
  'knowledge-qdrant': qdrantLogo,
  neo4j: neo4jLogo,
  qdrant: qdrantLogo,
};

export const WEB_SEARCH_BRAND_LOGOS = {
  tavily: tavilyLogo,
  serpapi: serpapiLogo,
};

export function BrandLogoIcon({ logo }) {
  if (!logo) return null;
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <span className="settings-provider-logo" style={{ '--settings-provider-logo': `url(${logo})` }} />
    </span>
  );
}

export function ProviderIcon({ provider }) {
  if (provider === 'custom') {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <SettingsLucideIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  return <BrandLogoIcon logo={PROVIDER_LOGOS[provider]} />;
}

export function ConnectionBrandIcon({ itemId, title }) {
  const logo = CONNECTION_BRAND_LOGOS[itemId]
    || CONNECTION_BRAND_LOGOS[String(title || '').trim().toLowerCase()];
  return <BrandLogoIcon logo={logo} />;
}

const PRESET_AGENT_ICON_NAMES = {
  'preset.general': 'sparkles',
  'preset.product': 'clipboard-list',
  'preset.development': 'code-2',
  'preset.qa': 'flask-conical',
  'preset.document-qa': 'book-open',
};

const PRESET_WORKFLOW_ICON_NAMES = {
  [SOFTWARE_DEVELOPMENT_WORKFLOW_ID]: 'git-branch',
};

export function agentIconNameForItem(item) {
  if (item?.custom) return 'box';
  return PRESET_AGENT_ICON_NAMES[item?.id] || 'sparkles';
}

export function agentIconNameForAgentId(agentId, agentOptions = []) {
  const id = String(agentId || '').trim();
  if (!id) return 'sparkles';
  const match = (Array.isArray(agentOptions) ? agentOptions : []).find((item) => item.id === id);
  if (match) return agentIconNameForItem(match);
  if (PRESET_AGENT_ICON_NAMES[id]) return PRESET_AGENT_ICON_NAMES[id];
  if (id.startsWith('custom.')) return 'box';
  return 'sparkles';
}

export function AgentListIcon({ item }) {
  const iconName = agentIconNameForItem(item);
  if (iconName === 'box' && item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <SettingsLucideIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  return (
    <span className={`settings-provider-icon${iconName === 'box' ? ' settings-provider-icon-custom' : ''}`} aria-hidden="true">
      <SettingsLucideIcon name={iconName} size={22} className="settings-provider-glyph" />
    </span>
  );
}

export function WorkflowListIcon({ item }) {
  if (item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <SettingsLucideIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  const iconName = PRESET_WORKFLOW_ICON_NAMES[item?.id] || 'git-branch';
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <SettingsLucideIcon name={iconName} size={22} className="settings-provider-glyph" />
    </span>
  );
}

export function FieldRow({ label, hint, children }) {
  const tip = String(hint || '').trim();
  const labelNode = tip ? (
    <PortalTooltip text={tip} position="above" multiline>
      <span className="settings-field-label has-hint" tabIndex={0}>{label}</span>
    </PortalTooltip>
  ) : (
    <span>{label}</span>
  );
  return (
    <div className="settings-field">
      {labelNode}
      {children}
    </div>
  );
}

const SECRET_KEY_SAVED_PLACEHOLDER = 'Saved · enter a new key to replace';

export function SecretKeyField({
  value = '',
  onChange,
  onBlur,
  onKeyDown,
  placeholder = 'API key',
  configured = false,
  disabled = false,
  className = '',
  autoComplete = 'off',
}) {
  const keyValue = String(value || '');
  const keySaved = Boolean(configured) && !keyValue.trim();
  return (
    <label className={`settings-secret-key-field${keySaved ? ' is-saved' : ''}${className ? ` ${className}` : ''}`}>
      <SettingsLucideIcon name="lock" size={15} className="settings-secret-key-icon" />
      <input
        type="password"
        value={keyValue}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={keySaved ? SECRET_KEY_SAVED_PLACEHOLDER : placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
      />
    </label>
  );
}

const SETTINGS_LUCIDE_ICONS = {
  message: [
    ['path', { d: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z' }],
    ['path', { d: 'M8 9h8' }],
    ['path', { d: 'M8 13h5' }],
  ],
  eye: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' }],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
  layers: [
    ['path', { d: 'm12 2 10 5-10 5L2 7Z' }],
    ['path', { d: 'm2 17 10 5 10-5' }],
    ['path', { d: 'm2 12 10 5 10-5' }],
  ],
  nodes: [
    ['circle', { cx: '5', cy: '12', r: '3' }],
    ['circle', { cx: '19', cy: '5', r: '3' }],
    ['circle', { cx: '19', cy: '19', r: '3' }],
    ['path', { d: 'M8 11 16.5 6.5' }],
    ['path', { d: 'M8 13 16.5 17.5' }],
  ],
  wrench: [
    ['path', { d: 'M14.7 6.3a4 4 0 0 0-5 5L3 18v3h3l6.7-6.7a4 4 0 0 0 5-5l-2.9 2.9-2.1-2.1Z' }],
  ],
  globe: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M2 12h20' }],
    ['path', { d: 'M12 2a15.3 15.3 0 0 1 0 20' }],
    ['path', { d: 'M12 2a15.3 15.3 0 0 0 0 20' }],
  ],
  plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  search: [
    ['path', { d: 'm21 21-4.34-4.34' }],
    ['circle', { cx: '11', cy: '11', r: '8' }],
  ],
  configure: [
    ['path', { d: 'M13 21h8' }],
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
  ],
  close: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  test: [
    ['path', { d: 'M21 7 6.82 21.18a2.83 2.83 0 0 1-3.99-.01a2.83 2.83 0 0 1 0-4L17 3' }],
    ['path', { d: 'm16 2 6 6' }],
    ['path', { d: 'M12 16H4' }],
  ],
  template: [
    ['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }],
    ['path', { d: 'M4 16V6a2 2 0 0 1 2-2h10' }],
  ],
  format: [
    ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v3' }],
    ['path', { d: 'M16 3h3a2 2 0 0 1 2 2v3' }],
    ['path', { d: 'M8 21H5a2 2 0 0 1-2-2v-3' }],
    ['path', { d: 'M16 21h3a2 2 0 0 0 2-2v-3' }],
    ['path', { d: 'M9 8h6' }],
    ['path', { d: 'M9 12h6' }],
    ['path', { d: 'M9 16h4' }],
  ],
  validate: [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.86a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  save: [
    ['path', { d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
    ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
    ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }],
  ],
  active: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  lock: [
    ['rect', { x: '4', y: '10', width: '16', height: '10', rx: '2' }],
    ['path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' }],
  ],
  delete: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }],
    ['path', { d: 'M10 11v6' }],
    ['path', { d: 'M14 11v6' }],
  ],
  'folder-plus': [
    ['path', { d: 'M12 10v6' }],
    ['path', { d: 'M9 13h6' }],
    ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
  ],
  'toggle-left': [
    ['circle', { cx: '9', cy: '12', r: '3' }],
    ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '7' }],
  ],
  'toggle-right': [
    ['circle', { cx: '15', cy: '12', r: '3' }],
    ['rect', { width: '20', height: '14', x: '2', y: '5', rx: '7' }],
  ],
  sparkles: [
    ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
    ['path', { d: 'M20 2v4' }],
    ['path', { d: 'M22 4h-4' }],
    ['circle', { cx: '4', cy: '20', r: '2' }],
  ],
  'clipboard-list': [
    ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M12 11h4' }],
    ['path', { d: 'M12 16h4' }],
    ['path', { d: 'M8 11h.01' }],
    ['path', { d: 'M8 16h.01' }],
  ],
  'code-2': [
    ['path', { d: 'm18 16 4-4-4-4' }],
    ['path', { d: 'm6 8-4 4 4 4' }],
  ],
  'flask-conical': [
    ['path', { d: 'M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2' }],
    ['path', { d: 'M6.453 15h11.094' }],
    ['path', { d: 'M8.5 2h7' }],
  ],
  'book-open': [
    ['path', { d: 'M12 7v14' }],
    ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
  ],
  box: [
    ['path', { d: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' }],
    ['path', { d: 'm3.3 7 8.7 5 8.7-5' }],
    ['path', { d: 'M12 22V12' }],
  ],
  'git-branch': [
    ['path', { d: 'M15 6a9 9 0 0 0-9 9V3' }],
    ['circle', { cx: '18', cy: '6', r: '3' }],
    ['circle', { cx: '6', cy: '18', r: '3' }],
  ],
  play: [
    ['path', { d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }],
  ],
  'circle-check': [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
};

export function SettingsLucideIcon({ name, size = 14, className = '' }) {
  const nodes = SETTINGS_LUCIDE_ICONS[name] || [];
  return (
    <svg
      className={`settings-lucide ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {nodes.map(([tag, attrs], index) => React.createElement(tag, { key: index, ...attrs }))}
    </svg>
  );
}

export function SettingsTooltipIconButton({
  label,
  icon,
  onClick,
  onMouseDown,
  disabled = false,
  danger = false,
  type = 'button',
  className = '',
  iconSize = 15,
}) {
  const button = (
    <button
      type={type}
      className={`settings-tooltip-icon-button${danger ? ' danger' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
    >
      <SettingsLucideIcon name={icon} size={iconSize} />
    </button>
  );
  return <PortalTooltip text={label} position="above">{button}</PortalTooltip>;
}

export function SettingsMenuSelect({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = 'Select',
  header = '',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  const items = Array.isArray(options) ? options : [];
  const current = items.find((item) => item.id === value);
  const label = current?.label || value || placeholder;

  const cancelClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    if (!open) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 220);
  };

  useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
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

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      className={`model-picker settings-menu-select ${className} ${open ? 'is-open' : ''}`.trim()}
      ref={rootRef}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="model-picker-trigger"
        onClick={() => { if (!disabled) setOpen((shown) => !shown); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="model-picker-value">{label}</span>
        <span className="model-picker-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="model-picker-menu" role="listbox">
          {header ? <div className="model-picker-header">{header}</div> : null}
          <div className="model-picker-list">
            {items.map((item) => {
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`model-picker-option ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    onChange?.(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="model-picker-option-label">{item.label || item.id}</span>
                  {active ? (
                    <span className="model-picker-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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

export function SettingsComboInput({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = '',
  header = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  const items = Array.isArray(options) ? options : [];

  const cancelClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    if (!open) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 220);
  };

  useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
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

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      className={`model-picker settings-combo-select ${open ? 'is-open' : ''}`}
      ref={rootRef}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <input
        value={value || ''}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={() => { if (!disabled && items.length) setOpen(true); }}
        disabled={disabled}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="settings-combo-caret"
        onClick={() => { if (!disabled && items.length) setOpen((shown) => !shown); }}
        disabled={disabled || !items.length}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="model-picker-caret" aria-hidden="true" />
      </button>
      {open ? (
        <div className="model-picker-menu" role="listbox">
          {header ? <div className="model-picker-header">{header}</div> : null}
          <div className="model-picker-list">
            {items.map((item) => {
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`model-picker-option ${active ? 'is-active' : ''}`}
                  onClick={() => {
                    onChange?.(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="model-picker-option-label">{item.label || item.id}</span>
                  {active ? (
                    <span className="model-picker-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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


