import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import path from 'node:path';
import type { AppUpdateState, AppUpdateStatus } from '../shared/haish-api.js';

const { autoUpdater } = electronUpdater;

let currentState: AppUpdateState = createIdleState();
let initialized = false;

/**
 * Electron reports `app.isPackaged === true` when the runtime binary is renamed
 * (e.g. Electron.app → Haish.app for a custom dock icon). That still lives under
 * `node_modules/electron/dist` and is not a real release install.
 */
function isRealPackagedBuild(): boolean {
  if (!app.isPackaged) return false;
  if (process.env.HAISH_DEV_MODE === '1') return false;

  // Renaming Electron.app → Haish.app for a custom dock icon still leaves the
  // binary under node_modules/electron/dist. That is not a release install.
  const execPath = app.getPath('exe');
  const normalized = execPath.split(path.sep).join('/');
  if (normalized.includes('/node_modules/electron/')) {
    return false;
  }

  return true;
}

function createIdleState(partial: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    status: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: undefined,
    progressPercent: undefined,
    message: undefined,
    canInstall: false,
    isPackaged: isRealPackagedBuild(),
    ...partial,
  };
}

function setState(partial: Partial<AppUpdateState> & { status?: AppUpdateStatus }): AppUpdateState {
  currentState = {
    ...currentState,
    currentVersion: app.getVersion(),
    isPackaged: isRealPackagedBuild(),
    ...partial,
  };
  broadcastState();
  return currentState;
}

function broadcastState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app-update:state', currentState);
  }
}

function describeError(error: unknown): string {
  const raw = error instanceof Error && error.message
    ? error.message
    : String(error || 'Unknown update error');

  if (/app-update\.yml/i.test(raw) || /ENOENT/i.test(raw)) {
    return 'Only in installed builds';
  }
  if (/401|403|Bad credentials|Not Found/i.test(raw)) {
    return 'Update feed unavailable';
  }
  if (/net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(raw)) {
    return 'Network error';
  }
  // Keep short; long absolute paths belong in logs, not the UI.
  return raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
}

function unsupportedState(): AppUpdateState {
  return setState({
    status: 'unsupported',
    message: 'Only in installed builds',
    canInstall: false,
  });
}

export function getAppUpdateState(): AppUpdateState {
  return currentState;
}

export function setupAppUpdater(): void {
  if (initialized) return;
  initialized = true;

  currentState = createIdleState();

  if (!isRealPackagedBuild()) {
    unsupportedState();
    return;
  }

  // Manual control from the user menu: check → download → install.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  // Private GitHub Releases need a token on the client if the repo is private.
  // Prefer env injection for internal builds; do not hardcode secrets.
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    autoUpdater.requestHeaders = {
      ...(autoUpdater.requestHeaders || {}),
      Authorization: `token ${token}`,
    };
  }

  autoUpdater.on('checking-for-update', () => {
    setState({
      status: 'checking',
      message: 'Checking…',
      progressPercent: undefined,
      canInstall: false,
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({
      status: 'available',
      availableVersion: info.version,
      message: `Update v${info.version} available`,
      progressPercent: undefined,
      canInstall: false,
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setState({
      status: 'not-available',
      availableVersion: info.version,
      message: `Up to date · v${app.getVersion()}`,
      progressPercent: undefined,
      canInstall: false,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      status: 'downloading',
      progressPercent: Math.max(0, Math.min(100, progress.percent || 0)),
      message: `Downloading… ${Math.floor(progress.percent || 0)}%`,
      canInstall: false,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({
      status: 'downloaded',
      availableVersion: info.version,
      progressPercent: 100,
      message: `v${info.version} ready · restart to install`,
      canInstall: true,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    setState({
      status: 'error',
      message: describeError(error),
      progressPercent: undefined,
      canInstall: false,
    });
  });
}

export async function checkForAppUpdates(): Promise<AppUpdateState> {
  if (!isRealPackagedBuild()) {
    return unsupportedState();
  }

  try {
    setState({
      status: 'checking',
      message: 'Checking…',
      progressPercent: undefined,
      canInstall: false,
    });
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return setState({
        status: 'error',
        message: 'No update result',
        canInstall: false,
      });
    }
    // Event handlers already updated state; return latest snapshot.
    return currentState;
  } catch (error) {
    return setState({
      status: 'error',
      message: describeError(error),
      canInstall: false,
    });
  }
}

export async function downloadAppUpdate(): Promise<AppUpdateState> {
  if (!isRealPackagedBuild()) {
    return unsupportedState();
  }

  if (currentState.status === 'downloading' || currentState.status === 'downloaded') {
    return currentState;
  }

  if (currentState.status !== 'available' && currentState.status !== 'error') {
    return setState({
      status: 'error',
      message: 'Check for updates first',
      canInstall: false,
    });
  }

  try {
    setState({
      status: 'downloading',
      progressPercent: 0,
      message: 'Downloading… 0%',
      canInstall: false,
    });
    await autoUpdater.downloadUpdate();
    return currentState;
  } catch (error) {
    return setState({
      status: 'error',
      message: describeError(error),
      canInstall: false,
    });
  }
}

export function installAppUpdate(): AppUpdateState {
  if (!currentState.canInstall) {
    return currentState;
  }
  // quitAndInstall will terminate the process; return state for IPC completeness.
  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });
  return currentState;
}
