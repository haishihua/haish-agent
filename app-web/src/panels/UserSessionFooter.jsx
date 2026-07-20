// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';

function getDesktopUpdateApi() {
  return typeof window !== 'undefined' ? window.haish : null;
}

function updateMenuLabel(state) {
  if (!state) return 'Check for updates';
  switch (state.status) {
    case 'checking':
      return 'Checking…';
    case 'available':
      return state.availableVersion
        ? `Update to v${state.availableVersion}`
        : 'Update available';
    case 'downloading': {
      const pct = Number.isFinite(state.progressPercent)
        ? Math.floor(state.progressPercent)
        : 0;
      return `Updating… ${pct}%`;
    }
    case 'downloaded':
      return state.availableVersion
        ? `Installing v${state.availableVersion}…`
        : 'Installing…';
    case 'not-available':
      return state.currentVersion ? `Up to date · v${state.currentVersion}` : 'Up to date';
    case 'unsupported':
      return 'Updates unavailable';
    case 'error':
      return state.canInstall ? 'Retry install' : 'Update failed';
    default:
      return 'Check for updates';
  }
}

function updateTooltipText(state) {
  if (!state) return 'Check for updates';
  switch (state.status) {
    case 'unsupported':
      return 'Only in installed builds';
    case 'not-available':
      return state.currentVersion ? `You're on v${state.currentVersion}` : "You're up to date";
    case 'available':
      return state.availableVersion
        ? `Click to download and install v${state.availableVersion}`
        : 'Click to download and install update';
    case 'downloaded':
      return state.availableVersion
        ? `Installing v${state.availableVersion} and restarting…`
        : 'Installing update and restarting…';
    case 'error':
      if (state.canInstall) {
        return state.message
          ? `${state.message} · click to retry install`
          : 'Install failed · click to retry';
      }
      return state.message || 'Update failed';
    case 'checking':
      return 'Checking for updates';
    case 'downloading':
      return 'Downloading and installing update';
    default:
      return state.message || 'Check for updates';
  }
}

function notifyUpdateState(onToast, state) {
  if (!onToast || !state) return;
  switch (state.status) {
    case 'not-available':
      onToast('success', state.currentVersion ? `Up to date · v${state.currentVersion}` : 'Up to date');
      break;
    case 'available':
      // One-shot apply path continues into download; avoid noisy intermediate toasts.
      break;
    case 'downloaded':
      onToast(
        'info',
        state.availableVersion
          ? `Installing v${state.availableVersion}…`
          : 'Installing update…',
      );
      break;
    case 'unsupported':
      onToast('info', 'Only in installed builds');
      break;
    case 'error':
      onToast('error', state.message || 'Update failed');
      break;
    default:
      break;
  }
}

export function UserSessionFooter({ authUser, onLogout, onToast }) {
  const [open, setOpen] = React.useState(false);
  const [updateState, setUpdateState] = React.useState(null);
  const [updateBusy, setUpdateBusy] = React.useState(false);
  const wrapRef = React.useRef(null);
  const displayName = authUser?.display_name || authUser?.username || 'User';
  const email = authUser?.email || '';
  const desktop = getDesktopUpdateApi();

  React.useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  React.useEffect(() => {
    if (!desktop?.getAppUpdateState) return undefined;
    let cancelled = false;
    desktop.getAppUpdateState().then((state) => {
      if (!cancelled) setUpdateState(state);
    }).catch(() => undefined);
    const unsubscribe = desktop.onAppUpdateStateChange
      ? desktop.onAppUpdateStateChange((state) => {
        if (!cancelled) setUpdateState(state);
      })
      : null;
    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [desktop]);

  const handleUpdateAction = async () => {
    if (!desktop || updateBusy) return;
    setUpdateBusy(true);
    try {
      // Preferred path: one click checks, downloads, and restarts into the new build.
      if (desktop.applyLatestAppUpdate) {
        const next = await desktop.applyLatestAppUpdate();
        setUpdateState(next);
        notifyUpdateState(onToast, next);
        return;
      }

      // Fallback for older preload bridges that only expose stepwise APIs.
      const status = updateState?.status;
      if (status === 'downloaded' && desktop.installAppUpdate) {
        await desktop.installAppUpdate();
        return;
      }
      if (status === 'available' && desktop.downloadAppUpdate) {
        const downloaded = await desktop.downloadAppUpdate();
        setUpdateState(downloaded);
        if (downloaded?.status === 'downloaded' && desktop.installAppUpdate) {
          notifyUpdateState(onToast, downloaded);
          await desktop.installAppUpdate();
          return;
        }
        notifyUpdateState(onToast, downloaded);
        return;
      }
      if (desktop.checkForAppUpdates) {
        const checked = await desktop.checkForAppUpdates();
        setUpdateState(checked);
        if (checked?.status === 'available' && desktop.downloadAppUpdate) {
          const downloaded = await desktop.downloadAppUpdate();
          setUpdateState(downloaded);
          if (downloaded?.status === 'downloaded' && desktop.installAppUpdate) {
            notifyUpdateState(onToast, downloaded);
            await desktop.installAppUpdate();
            return;
          }
          notifyUpdateState(onToast, downloaded);
          return;
        }
        notifyUpdateState(onToast, checked);
      }
    } catch (error) {
      const message = error?.message || String(error);
      const next = {
        status: 'error',
        currentVersion: updateState?.currentVersion || '',
        canInstall: false,
        isPackaged: updateState?.isPackaged ?? false,
        message,
      };
      setUpdateState(next);
      notifyUpdateState(onToast, next);
    } finally {
      setUpdateBusy(false);
    }
  };

  const updateDisabled = updateBusy
    || updateState?.status === 'checking'
    || updateState?.status === 'downloading'
    || updateState?.status === 'downloaded'
    || updateState?.status === 'unsupported'
    || updateState?.status === 'not-available'
    || !(desktop?.applyLatestAppUpdate || desktop?.checkForAppUpdates);
  const updateIconLoading = updateBusy
    || updateState?.status === 'checking'
    || updateState?.status === 'downloading'
    || updateState?.status === 'downloaded';

  return (
    <div className={`user-session-footer${open ? ' open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="user-session-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="user-avatar" aria-hidden="true">
          <img src="assets/ui/avatar_default.png" alt="" draggable={false} />
        </span>
        <span className="user-meta">
          <span className="user-name">{displayName}</span>
          {email ? <span className="user-email">{email}</span> : null}
        </span>
        <svg className={`user-chevron${open ? ' rot' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="user-session-menu" role="menu">
          {/*
            Wrap the button so hover still works when it is disabled.
            Disabled buttons do not receive pointer events, so PortalTooltip
            must attach to a non-disabled wrapper.
          */}
          <PortalTooltip text={updateTooltipText(updateState)} position="above">
            <div className="user-session-menu-tooltip-target">
              <button
                type="button"
                className={`user-session-menu-item${updateState?.status === 'error' ? ' is-error' : ''}${updateState?.status === 'downloaded' ? ' is-ready' : ''}${updateState?.status === 'unsupported' || updateState?.status === 'not-available' ? ' is-muted' : ''}${updateIconLoading ? ' is-loading' : ''}`}
                role="menuitem"
                disabled={updateDisabled}
                aria-label={updateTooltipText(updateState)}
                onClick={() => { handleUpdateAction(); }}
              >
                <svg
                  className={`update-icon${updateIconLoading ? ' is-loading' : ''}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M8 16H3v5" />
                </svg>
                <span className="user-session-menu-label">
                  <span>{updateMenuLabel(updateState)}</span>
                </span>
              </button>
            </div>
          </PortalTooltip>
          <button
            type="button"
            className="user-session-signout"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout && onLogout(); }}
          >
            <span className="logout-icon" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
