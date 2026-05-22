import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DirectoryPickResult, FileEntry, LocalProject, ReadFileResult } from '../shared/haish-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectsFile = () => path.join(app.getPath('userData'), 'projects.json');
const webRoot = () => path.join(app.getAppPath(), 'app-web');

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

function registerWebProtocol(): void {
  protocol.handle('haish', (request) => {
    const url = new URL(request.url);
    const normalizedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const relativePath = normalizedPath.replace(/^\/+/, '');
    const filePath = path.join(webRoot(), relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: 'Haish',
    backgroundColor: '#080b12',
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
