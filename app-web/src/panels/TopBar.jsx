// @haish-esm
import React from 'react';

import {
  PortalTooltip,
} from './PortalTooltip.jsx';
export function TopBar({ now, viewMode = 'world', onToggleViewMode, calibrationActive = false, calibrationDisabled = false, onToggleCalibration }) {
  const chatMode = viewMode === 'chat';
  return (
    <div className="app-topbar">
      <div className="topbar-brand">
        <img className="topbar-logo" src="assets/ui/penguin_logo_user.png" alt="" draggable={false} />
        <div className="topbar-title">Haish Agent</div>
      </div>
      <div className="topbar-actions">
        <PortalTooltip text="Documents" position="below">
          <button type="button" className="topbar-icon" aria-label="Documents">
            <span className="ico ico-preview" aria-hidden="true" />
          </button>
        </PortalTooltip>
        <PortalTooltip text={chatMode ? 'Bot Mode' : 'Chat Mode'} position="below">
          <button
            type="button"
            className={`topbar-icon topbar-mode-toggle ${chatMode ? 'active' : ''}`}
            aria-label={chatMode ? 'Switch to Bot Mode' : 'Switch to Chat Mode'}
            aria-pressed={chatMode}
            onClick={onToggleViewMode}
          >
            <span className={`ico ${chatMode ? 'ico-robot' : 'ico-bubble-chat'}`} aria-hidden="true" />
          </button>
        </PortalTooltip>
        <PortalTooltip text={calibrationActive ? 'Exit calibration' : 'Settings'} position="below">
          <button
            type="button"
            className={`topbar-icon ${calibrationActive ? 'active' : ''}`}
            aria-label={calibrationActive ? 'Exit calibration' : 'Settings'}
            aria-pressed={calibrationActive}
            onClick={onToggleCalibration}
            disabled={calibrationDisabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </PortalTooltip>
      </div>
    </div>
  );
}
