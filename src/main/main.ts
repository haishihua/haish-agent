import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DirectoryPickResult, FileEntry, LocalProject, ReadFileResult, SkillDirectoryPickResult } from '../shared/haish-api.js';
import {
  checkForAppUpdates,
  downloadAppUpdate,
  getAppUpdateState,
  installAppUpdate,
  setupAppUpdater,
} from './app-updater.js';
import { ensureLocalRuntime, getLocalRuntimeState, startLocalRuntime, stopLocalRuntime } from './local-runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = () => path.resolve(__dirname, '../..');

const projectsFile = () => path.join(app.getPath('userData'), 'projects.json');
// Vite builds the product UI into app-web/dist. Prefer dist so the renderer always
// loads the production bundle (no Babel-in-browser, production React).
const webRoot = () => {
  const distCandidates = [
    path.join(projectRoot(), 'app-web', 'dist'),
    path.join(app.getAppPath(), 'app-web', 'dist'),
  ];
  for (const distRoot of distCandidates) {
    if (existsSync(path.join(distRoot, 'index.html'))) {
      return distRoot;
    }
  }
  // Legacy fallback for older checkouts that still ship unbundled app-web sources.
  return path.join(projectRoot(), 'app-web');
};
const appIconPngPath = () => path.join(app.getAppPath(), 'build', 'icon.png');
const devMode = process.env.HAISH_DEV_MODE === '1' || !app.isPackaged;
const runtimePaths = () => ({
  userDataPath: app.getPath('userData'),
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged && !devMode,
});

// Electron 默认会调 macOS Keychain 给 SafeStorage 派密钥，启动时会弹"允许访问钥匙串"
// 的系统对话框。我们没有用 safeStorage 存任何敏感数据，所以把 password-store 切到
// basic（明文文件）并启用 mock-keychain 来绕过这个弹窗。必须在 app.whenReady 之前调用。
app.commandLine.appendSwitch('password-store', 'basic');
app.commandLine.appendSwitch('use-mock-keychain');

// dev (`npm run dev`) 与已安装的 `/Applications/Haish.app` 都用 productName "Haish"，
// 默认共享同一个 ~/Library/Application Support/Haish 目录，导致 projects.json、
// runtime workdir 互相串数据。在未打包时把 userData 隔离到独立目录。
if (devMode) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Haish (Dev)'));
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'haish',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

async function proxyApiRequest(request: Request, url: URL): Promise<Response> {
  let runtime;
  try {
    runtime = await ensureLocalRuntime(runtimePaths());
  } catch (error) {
    return Response.json(
      {
        detail: `Local runtime is unavailable: ${String((error as Error)?.message || error)}`,
      },
      { status: 503 },
    );
  }
  const targetUrl = `${runtime.baseUrl}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : Buffer.from(await request.arrayBuffer());
  return net.fetch(targetUrl, {
    method: request.method,
    headers,
    body
  });
}

function registerWebProtocol(): void {
  protocol.handle('haish', async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return proxyApiRequest(request, url);
    }
    const normalizedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const relativePath = normalizedPath.replace(/^\/+/, '');
    const filePath = path.join(webRoot(), relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function getWindowVisualState(window: BrowserWindow) {
  return {
    fullScreen: window.isFullScreen(),
    maximized: window.isMaximized(),
  };
}

function publishWindowVisualState(window: BrowserWindow): void {
  window.webContents.send('window:state', getWindowVisualState(window));
}

function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  app.dock.setIcon(appIconPngPath());
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 760,
    title: 'Haish',
    // 透明窗口 + NSVisualEffectView vibrancy：macOS 用原生材质画窗口边缘与圆角，
    // 去掉 framed 窗口自带的顶部 1px 亮边。html/body 已用不透明 #05060b 覆盖，
    // 内部内容不会被 vibrancy 染色，只有 OS 圆角裁掉的边缘才用到系统材质。
    backgroundColor: '#00000000',
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 22, y: 22 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  window.on('enter-full-screen', () => publishWindowVisualState(window));
  window.on('leave-full-screen', () => publishWindowVisualState(window));
  window.on('maximize', () => publishWindowVisualState(window));
  window.on('unmaximize', () => publishWindowVisualState(window));
  window.on('restore', () => publishWindowVisualState(window));
  window.webContents.once('did-finish-load', () => publishWindowVisualState(window));

  window.loadURL('haish://app/index.html').catch((error) => console.error('Failed to load Haish UI:', error));
}

async function readProjects(): Promise<LocalProject[]> {
  try {
    const raw = await fs.readFile(projectsFile(), 'utf8');
    const parsed = JSON.parse(raw) as LocalProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeProjects(projects: LocalProject[]): Promise<void> {
  await fs.mkdir(path.dirname(projectsFile()), { recursive: true });
  await fs.writeFile(projectsFile(), JSON.stringify(projects, null, 2), 'utf8');
}

function projectNameFromPath(rootPath: string): string {
  return path.basename(rootPath.replace(/\/+$/, '')) || rootPath;
}

async function resolveProjectRoot(projectId: string): Promise<string> {
  const project = (await readProjects()).find((item) => item.id === projectId);
  if (!project) {
    throw new Error('Project is not authorized.');
  }
  return project.rootPath;
}

async function resolveInsideProject(projectId: string, relativePath = ''): Promise<string> {
  const root = await resolveProjectRoot(projectId);
  const candidate = path.resolve(root, relativePath || '.');
  const resolvedRoot = path.resolve(root);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Path escapes the authorized project directory.');
  }
  return candidate;
}

ipcMain.handle('project:pick-directory', async (): Promise<DirectoryPickResult> => {
  const result = await dialog.showOpenDialog({
    title: 'Add Project to Haish',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const rootPath = result.filePaths[0];
  const projects = await readProjects();
  const existing = projects.find((item) => item.rootPath === rootPath);
  if (existing) {
    return { canceled: false, project: existing };
  }

  const project: LocalProject = {
    id: crypto.randomUUID(),
    name: projectNameFromPath(rootPath),
    rootPath,
    createdAt: new Date().toISOString()
  };
  await writeProjects([...projects, project]);
  return { canceled: false, project };
});

ipcMain.handle('project:list', async (): Promise<LocalProject[]> => readProjects());

ipcMain.handle('skill:pick-directory', async (): Promise<SkillDirectoryPickResult> => {
  const result = await dialog.showOpenDialog({
    title: 'Install Skill Directory',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }
  const selectedPath = result.filePaths[0];
  return {
    canceled: false,
    path: selectedPath,
    name: path.basename(selectedPath.replace(/\/+$/, '')) || selectedPath,
  };
});

ipcMain.handle('runtime:status', async () => getLocalRuntimeState());
ipcMain.handle('window:state', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? getWindowVisualState(window) : { fullScreen: false, maximized: false };
});
ipcMain.handle('app-update:state', () => getAppUpdateState());
ipcMain.handle('app-update:check', () => checkForAppUpdates());
ipcMain.handle('app-update:download', () => downloadAppUpdate());
ipcMain.handle('app-update:install', () => installAppUpdate());

ipcMain.handle('fs:list-directory', async (_event, projectId: string, relativePath = ''): Promise<FileEntry[]> => {
  const target = await resolveInsideProject(projectId, relativePath);
  const entries = await fs.readdir(target, { withFileTypes: true });
  const rows = await Promise.all(entries.map(async (entry) => {
    const entryRelativePath = path.posix.join(relativePath.split(path.sep).join('/'), entry.name);
    const absolutePath = path.join(target, entry.name);
    const stats = await fs.stat(absolutePath);
    return {
      name: entry.name,
      relativePath: entryRelativePath,
      kind: entry.isDirectory() ? 'directory' : 'file',
      size: entry.isFile() ? stats.size : undefined,
      modifiedAt: stats.mtime.toISOString()
    } satisfies FileEntry;
  }));
  return rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
});

ipcMain.handle('fs:read-file', async (_event, projectId: string, relativePath: string): Promise<ReadFileResult> => {
  const target = await resolveInsideProject(projectId, relativePath);
  const stats = await fs.stat(target);
  if (!stats.isFile()) {
    throw new Error('Path is not a file.');
  }
  if (stats.size > 1024 * 1024) {
    throw new Error('File is larger than the 1MB preview limit.');
  }
  return {
    relativePath,
    content: await fs.readFile(target, 'utf8'),
    encoding: 'utf8'
  };
});

app.whenReady().then(() => {
  app.setName('Haish');
  applyDockIcon();
  setupAppUpdater();
  startLocalRuntime(runtimePaths()).catch((error) => {
    console.error('Failed to start local Haish runtime:', error);
  });
  registerWebProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => console.error('Failed to start Haish:', error));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let runtimeStopInFlight = false;
app.on('before-quit', (event) => {
  if (runtimeStopInFlight) {
    return;
  }
  runtimeStopInFlight = true;
  event.preventDefault();
  stopLocalRuntime()
    .catch((error) => console.error('Failed to stop local Haish runtime cleanly:', error))
    .finally(() => app.quit());
});
