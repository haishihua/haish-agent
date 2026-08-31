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
import serpapiLogo from '../../../../assets/ui/icons/serpapi.svg';
import neo4jLogo from '../../../../assets/ui/icons/neo4j.svg';
import qdrantLogo from '../../../../assets/ui/icons/qdrant.svg';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { agentIconNameForItem } from '../../agents/model/agent-settings.js';

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
        <AppIcon name="box" size={22} className="settings-provider-glyph" />
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


export function AgentListIcon({ item }) {
  const iconName = agentIconNameForItem(item);
  if (iconName === 'box' && item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <AppIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  return (
    <span className={`settings-provider-icon${iconName === 'box' ? ' settings-provider-icon-custom' : ''}`} aria-hidden="true">
      <AppIcon name={iconName} size={22} className="settings-provider-glyph" />
    </span>
  );
}

export function WorkflowListIcon({ item }) {
  if (item?.custom) {
    return (
      <span className="settings-provider-icon settings-provider-icon-custom" aria-hidden="true">
        <AppIcon name="box" size={22} className="settings-provider-glyph" />
      </span>
    );
  }
  const iconName = 'git-branch';
  return (
    <span className="settings-provider-icon" aria-hidden="true">
      <AppIcon name={iconName} size={22} className="settings-provider-glyph" />
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
      <AppIcon name="lock" size={15} className="settings-secret-key-icon" />
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
      <AppIcon name={icon} size={iconSize} />
    </button>
  );
  return <PortalTooltip text={label} position="above">{button}</PortalTooltip>;
}

// 下拉菜单永远向下展开（方向保持一致）；但触发控件靠近表单底部时可用空间不足，
// 菜单会超出裁剪容器（表单滚动区）被底缘裁掉。这里把菜单最大高度压缩到触发
// 控件下方的剩余空间内（不足部分菜单内部滚动），保证列表完整可见且方向统一。
function useMenuMaxHeight(rootRef, open, itemsCount) {
  const [menuMaxHeight, setMenuMaxHeight] = useState(260);

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const trigger = root.querySelector('.model-picker-trigger')
      || root.querySelector('input, button')
      || root;
    if (!trigger || typeof window === 'undefined') return undefined;

    const findClipContainer = () => {
      let node = trigger.parentElement;
      while (node) {
        const style = window.getComputedStyle(node);
        if (style.overflowY !== 'visible' || style.overflowX !== 'visible') return node;
        node = node.parentElement;
      }
      return document.documentElement;
    };

    const compute = () => {
      const clipEl = findClipContainer();
      const clipRect = clipEl.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      // 触发控件下方到容器底缘的可用空间（减去 6px 间距 + 2px 边框余量）。
      const spaceBelow = Math.max(0, clipRect.bottom - triggerRect.bottom - 8);
      // 菜单理想高度按实际选项数量估算（上限 260px）。
      const count = Math.max(1, Number(itemsCount) || 1);
      const ideal = Math.min(260, 46 + count * 36);
      // 始终向下展开；放不下就压缩高度，菜单内部滚动。
      setMenuMaxHeight(Math.max(72, Math.min(ideal, spaceBelow)));
    };

    compute();
    window.addEventListener('resize', compute);
    const clipEl = findClipContainer();
    clipEl.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      clipEl.removeEventListener('scroll', compute, true);
    };
  }, [open, itemsCount, rootRef]);

  return menuMaxHeight;
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
  const menuMaxHeight = useMenuMaxHeight(rootRef, open, items.length);

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
        <div className="model-picker-menu" role="listbox" style={{ maxHeight: `${menuMaxHeight}px` }}>
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
  const menuMaxHeight = useMenuMaxHeight(rootRef, open, items.length);

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
        <div className="model-picker-menu" role="listbox" style={{ maxHeight: `${menuMaxHeight}px` }}>
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
