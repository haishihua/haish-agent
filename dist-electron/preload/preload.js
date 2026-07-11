import { contextBridge, ipcRenderer, webUtils } from 'electron';
const api = {
    platform: process.platform,
    apiBase: '',
    homePath: process.env.HOME || '',
    getRuntimeStatus: () => ipcRenderer.invoke('runtime:status'),
    getWindowState: () => ipcRenderer.invoke('window:state'),
    onWindowStateChange: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('window:state', listener);
        return () => ipcRenderer.removeListener('window:state', listener);
    },
    pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory'),
    pickSkillDirectory: () => ipcRenderer.invoke('skill:pick-directory'),
    listProjects: () => ipcRenderer.invoke('project:list'),
    listDirectory: (projectId, relativePath = '') => ipcRenderer.invoke('fs:list-directory', projectId, relativePath),
    readFile: (projectId, relativePath) => ipcRenderer.invoke('fs:read-file', projectId, relativePath),
    getPathForFile: (file) => webUtils.getPathForFile(file),
};
contextBridge.exposeInMainWorld('AGENT_WORLD_API_BASE', '');
contextBridge.exposeInMainWorld('haish', api);
