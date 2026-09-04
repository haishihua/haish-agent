import React, { useState } from 'react';

import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { RemoteControlDialog } from '../../remote/components/RemoteControlDialog.jsx';
export function TopBar({
  viewMode = 'workflow',
  onToggleViewMode,
  settingsActive = false,
  settingsDisabled = false,
  onToggleSettings,
}) {
  const chatMode = viewMode === 'chat';
  const [remoteControlOpen, setRemoteControlOpen] = useState(false);
  return (
    <>
      <div className="app-topbar">
        <div className="topbar-brand">
          <img className="topbar-logo" src="assets/ui/penguin_logo_user.png" alt="" draggable={false} />
          <div className="topbar-title">Haish Agent</div>
        </div>
        <div className="topbar-actions">
          <PortalTooltip text="Remote Control" position="below">
            <button
              type="button"
              className={`topbar-icon ${remoteControlOpen ? 'active' : ''}`}
              aria-label="Remote Control"
              aria-pressed={remoteControlOpen}
              onClick={() => setRemoteControlOpen(true)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="14" height="11" rx="2" />
                <path d="M8 20h4M10 15v5" />
                <rect x="16" y="9" width="5" height="10" rx="1.4" />
                <path d="M18 16.5h1" />
              </svg>
            </button>
          </PortalTooltip>
          <PortalTooltip text={chatMode ? 'Workflow' : 'Agent'} position="below">
            <button
              type="button"
              className={`topbar-icon topbar-mode-toggle ${chatMode ? 'active' : ''}`}
              aria-label={chatMode ? 'Switch to Workflow' : 'Switch to Agent'}
              aria-pressed={chatMode}
              onClick={onToggleViewMode}
            >
              <span className={`ico ${chatMode ? 'ico-robot' : 'ico-bubble-chat'}`} aria-hidden="true" />
            </button>
          </PortalTooltip>
          <PortalTooltip text={settingsActive ? 'Close settings' : 'Settings'} position="below">
            <button
              type="button"
              className={`topbar-icon ${settingsActive ? 'active' : ''}`}
              aria-label={settingsActive ? 'Close settings' : 'Settings'}
              aria-pressed={settingsActive}
              onClick={onToggleSettings}
              disabled={settingsDisabled}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </PortalTooltip>
        </div>
      </div>
      {remoteControlOpen ? <RemoteControlDialog onClose={() => setRemoteControlOpen(false)} /> : null}
    </>
  );
}
