import { contextBridge, ipcRenderer } from 'electron';
import type { DirectoryPickResult, FileEntry, HaishDesktopApi, LocalProject, ReadFileResult } from '../shared/haish-api.js';

const api: HaishDesktopApi = {
  platform: process.platform,
  apiBase: process.env.HAISH_API_BASE || 'http://47.97.24.242',
  pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory') as Promise<DirectoryPickResult>,
  listProjects: () => ipcRenderer.invoke('project:list') as Promise<LocalProject[]>,
  listDirectory: (projectId: string, relativePath = '') => ipcRenderer.invoke('fs:list-directory', projectId, relativePath) as Promise<FileEntry[]>,
  readFile: (projectId: string, relativePath: string) => ipcRenderer.invoke('fs:read-file', projectId, relativePath) as Promise<ReadFileResult>
};

contextBridge.exposeInMainWorld('AGENT_WORLD_API_BASE', api.apiBase);
contextBridge.exposeInMainWorld('haish', api);
