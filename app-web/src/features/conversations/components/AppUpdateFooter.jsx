import React from 'react';
import { CircleFadingArrowUp, LoaderCircle } from 'lucide-react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { JobProgress } from '../../../shared/ui/agent-elements/JobProgress.jsx';
import { updateJobProgress } from '../model/update-progress.js';

// 装好之后不用点：启动后自己安静地对一次版本，推迟 1.5 秒，别跟启动请求挤在一起。
// 这次检查只喂下面那行弱提示（不弹 toast）；真有新版本才长出「Update」入口。
const AUTO_CHECK_DELAY_MS = 1500;

function getDesktopUpdateApi() {
  return typeof window !== 'undefined' ? window.haish : null;
}

function currentVersionLabel(state) {
  const version = String(state?.currentVersion || '').trim();
  return version ? `v${version}` : '';
}

// 「update 入口」：只有真能装的时候才长成按钮——有新版本，或者装失败但包还在本机（重试安装）。
// 其余状态都不是按钮，是一行安静的提示。
function updateEntryLabel(state) {
  if (state?.status === 'available') {
    return state.availableVersion ? `Update to v${state.availableVersion}` : 'Update available';
  }
  if (state?.status === 'error' && state.canInstall) return 'Retry install';
  return '';
}

// 「弱提示」：一行字说清「现在是什么版本、对没对过版本」——装了没装、是不是最新都在这里看。
function updateHintText(state, canCheck) {
  const current = currentVersionLabel(state);
  const withCurrent = (text) => (current ? `${current} · ${text}` : text);
  if (!state) return canCheck ? withCurrent('Check for updates') : 'Updates unavailable';
  switch (state.status) {
    case 'idle':
      return withCurrent('Check for updates');
    case 'checking':
      return withCurrent('Checking…');
    case 'not-available':
      return withCurrent('Up to date');
    case 'unsupported':
      return withCurrent('Dev build');
    case 'error':
      return withCurrent(state.message || 'Update failed');
    default:
      return canCheck ? withCurrent('Check for updates') : (current || 'Updates unavailable');
  }
}

function updateTooltipText(state, canCheck) {
  if (!state) return canCheck ? 'Check for updates' : 'Updates are only available in installed builds';
  switch (state.status) {
    case 'idle':
      return 'Check for updates';
    case 'checking':
      return 'Checking for updates';
    case 'not-available':
      return state.currentVersion ? `You're on v${state.currentVersion} · click to check again` : "You're up to date";
    case 'available':
      return state.availableVersion
        ? `Download and install v${state.availableVersion}`
        : 'Download and install the update';
    case 'downloading':
      return 'Downloading update';
    case 'unsupported':
      return 'Updates are only available in installed builds';
    case 'error':
      if (!state.message) return 'Update failed · click to try again';
      return state.canInstall ? `${state.message} · click to retry install` : `${state.message} · click to try again`;
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
      onToast('info', 'Updates are only available in installed builds');
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
  const canCheck = Boolean(desktop?.applyLatestAppUpdate || desktop?.checkForAppUpdates);

  React.useEffect(() => {
    if (!desktop?.getAppUpdateState) return undefined;
    let cancelled = false;
    let autoCheckTimer = null;
    desktop
      .getAppUpdateState()
      .then((state) => {
        if (cancelled) return;
        setUpdateState(state);
        // 只有真正的安装版才会走到 idle：启动后静默对一次版本，用户不点也能看到是几版、要不要更新。
        if (state?.status === 'idle' && desktop.checkForAppUpdates) {
          autoCheckTimer = setTimeout(() => {
            if (cancelled) return;
            desktop
              .checkForAppUpdates()
              .then((next) => {
                if (!cancelled) setUpdateState(next);
              })
              .catch(() => undefined);
          }, AUTO_CHECK_DELAY_MS);
        }
      })
      .catch(() => undefined);
    const unsubscribe = desktop.onAppUpdateStateChange
      ? desktop.onAppUpdateStateChange((state) => {
          if (!cancelled) setUpdateState(state);
        })
      : null;
    return () => {
      cancelled = true;
      if (autoCheckTimer) clearTimeout(autoCheckTimer);
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

  const entryLabel = updateEntryLabel(updateState);
  // 一行安静的字也能点：没查过、已是最新、上次检查失败——点一下就是对一次版本
  // （真查到新版本会接着下载安装）。开发版 / 浏览器里没有更新通道，就纯当提示看。
  const quietActionable = canCheck && (
    !updateState
    || updateState.status === 'idle'
    || updateState.status === 'not-available'
    || (updateState.status === 'error' && !updateState.canInstall)
  );
  const actionable = Boolean(entryLabel) || quietActionable;
  const loading = updateBusy || updateState?.status === 'checking';

  // 用户点出来的这次更新本来就是一条流程：Check → Download → Install，卡片第一阶段就是 Check。
  // 所以点了之后（updateBusy）后台一广播 checking 就切出灰卡；没点过的启动静默对版本仍然只动那行字。
  const jobProgress = updateJobProgress(updateState, { userInitiated: updateBusy });
  if (jobProgress) {
    return <div className="app-update-footer"><JobProgress {...jobProgress} /></div>;
  }

  const quiet = !entryLabel;
  const label = entryLabel || updateHintText(updateState, canCheck);
  const tooltipText = updateTooltipText(updateState, canCheck);
  const UpdateIcon = loading ? LoaderCircle : CircleFadingArrowUp;

  return (
    <div className="app-update-footer">
      <PortalTooltip text={tooltipText} position="above">
        <div className="app-update-tooltip-target">
          <button
            type="button"
            className={`app-update-button${quiet ? ' is-quiet' : ''}${updateState?.status === 'error' && entryLabel ? ' is-error' : ''}`}
            aria-label={tooltipText}
            aria-disabled={actionable ? undefined : 'true'}
            data-actionable={actionable ? 'true' : undefined}
            onClick={actionable ? handleUpdateAction : undefined}
          >
            {!quiet || loading ? (
              <UpdateIcon
                className={`update-icon${loading ? ' is-loading' : ''}`}
                size={quiet ? 14 : 20}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            ) : null}
            <span>{label}</span>
          </button>
        </div>
      </PortalTooltip>
    </div>
  );
}
