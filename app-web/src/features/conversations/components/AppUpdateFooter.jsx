import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';

function getDesktopUpdateApi() {
  return typeof window !== 'undefined' ? window.haish : null;
}

function updateMenuLabel(state) {
  if (!state) return 'Check for updates';
  switch (state.status) {
    case 'checking':
      return 'Checking…';
    case 'available':
      return state.availableVersion ? `Update to v${state.availableVersion}` : 'Update available';
    case 'downloading':
      return `Updating… ${Number.isFinite(state.progressPercent) ? Math.floor(state.progressPercent) : 0}%`;
    case 'downloaded':
      return state.availableVersion ? `Installing v${state.availableVersion}…` : 'Installing…';
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
      return state.canInstall
        ? state.message
          ? `${state.message} · click to retry install`
          : 'Install failed · click to retry'
        : state.message || 'Update failed';
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
    case 'downloaded':
      onToast('info', state.availableVersion ? `Installing v${state.availableVersion}…` : 'Installing update…');
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

export function AppUpdateFooter({ onToast }) {
  const [updateState, setUpdateState] = React.useState(null);
  const [updateBusy, setUpdateBusy] = React.useState(false);
  const desktop = getDesktopUpdateApi();

  React.useEffect(() => {
    if (!desktop?.getAppUpdateState) return undefined;
    let cancelled = false;
    desktop
      .getAppUpdateState()
      .then((state) => {
        if (!cancelled) setUpdateState(state);
      })
      .catch(() => undefined);
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
      if (desktop.applyLatestAppUpdate) {
        const next = await desktop.applyLatestAppUpdate();
        setUpdateState(next);
        notifyUpdateState(onToast, next);
        return;
      }
      const status = updateState?.status;
      if (status === 'downloaded' && desktop.installAppUpdate) {
        await desktop.installAppUpdate();
        return;
      }
      if (status === 'available' && desktop.downloadAppUpdate) {
        const downloaded = await desktop.downloadAppUpdate();
        setUpdateState(downloaded);
        notifyUpdateState(onToast, downloaded);
        if (downloaded?.status === 'downloaded' && desktop.installAppUpdate) await desktop.installAppUpdate();
        return;
      }
      if (desktop.checkForAppUpdates) {
        const checked = await desktop.checkForAppUpdates();
        setUpdateState(checked);
        if (checked?.status === 'available' && desktop.downloadAppUpdate) {
          const downloaded = await desktop.downloadAppUpdate();
          setUpdateState(downloaded);
          notifyUpdateState(onToast, downloaded);
          if (downloaded?.status === 'downloaded' && desktop.installAppUpdate) await desktop.installAppUpdate();
          return;
        }
        notifyUpdateState(onToast, checked);
      }
    } catch (error) {
      const next = {
        status: 'error',
        currentVersion: updateState?.currentVersion || '',
        canInstall: false,
        isPackaged: updateState?.isPackaged ?? false,
        message: error?.message || String(error),
      };
      setUpdateState(next);
      notifyUpdateState(onToast, next);
    } finally {
      setUpdateBusy(false);
    }
  };

  const disabled =
    updateBusy ||
    updateState?.status === 'checking' ||
    updateState?.status === 'downloading' ||
    updateState?.status === 'downloaded' ||
    updateState?.status === 'unsupported' ||
    updateState?.status === 'not-available' ||
    !(desktop?.applyLatestAppUpdate || desktop?.checkForAppUpdates);
  const loading =
    updateBusy ||
    updateState?.status === 'checking' ||
    updateState?.status === 'downloading' ||
    updateState?.status === 'downloaded';

  return (
    <div className="app-update-footer">
      <PortalTooltip text={updateTooltipText(updateState)} position="above">
        <div className="app-update-tooltip-target">
          <button
            type="button"
            className={`app-update-button${updateState?.status === 'error' ? ' is-error' : ''}${updateState?.status === 'downloaded' ? ' is-ready' : ''}${updateState?.status === 'unsupported' || updateState?.status === 'not-available' ? ' is-muted' : ''}`}
            disabled={disabled}
            aria-label={updateTooltipText(updateState)}
            onClick={handleUpdateAction}
          >
            <svg
              className={`update-icon${loading ? ' is-loading' : ''}`}
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
            <span>{updateMenuLabel(updateState)}</span>
          </button>
        </div>
      </PortalTooltip>
    </div>
  );
}
