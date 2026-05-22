import { useEffect, useMemo, useState } from 'react';
import type { FileEntry, LocalProject, ReadFileResult } from '../shared/haish-api';

function formatSize(size?: number): string {
  if (size == null) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function App() {
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [preview, setPreview] = useState<ReadFileResult | null>(null);
  const [status, setStatus] = useState('Ready');
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  async function refreshProjects() {
    const next = await window.haish.listProjects();
    setProjects(next);
    setActiveProjectId((current) => current || next[0]?.id || null);
  }

  async function addProject() {
    setStatus('Waiting for folder permission...');
    const result = await window.haish.pickProjectDirectory();
    if (result.canceled) {
      setStatus('Folder selection cancelled');
      return;
    }
    await refreshProjects();
    setActiveProjectId(result.project.id);
    setStatus(`Project added: ${result.project.name}`);
  }

  async function loadDirectory(projectId: string) {
    setStatus('Reading local directory...');
    const list = await window.haish.listDirectory(projectId);
    setEntries(list);
    setPreview(null);
    setStatus('Local directory connected');
  }

  async function openFile(entry: FileEntry) {
    if (!activeProject || entry.kind !== 'file') return;
    setStatus(`Reading ${entry.relativePath}...`);
    const file = await window.haish.readFile(activeProject.id, entry.relativePath);
    setPreview(file);
    setStatus('Preview ready');
  }

  useEffect(() => {
    refreshProjects().catch((error) => setStatus(String(error)));
  }, []);

  useEffect(() => {
    if (!activeProjectId) {
      setEntries([]);
      setPreview(null);
      return;
    }
    loadDirectory(activeProjectId).catch((error) => setStatus(String(error)));
  }, [activeProjectId]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">H</div>
          <div>
            <h1>Haish</h1>
            <p>Desktop bridge</p>
          </div>
        </div>
        <button className="primary-button" onClick={addProject}>Add Project</button>
        <section className="project-list" aria-label="Authorized projects">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === activeProjectId ? 'project active' : 'project'}
              onClick={() => setActiveProjectId(project.id)}
            >
              <span>{project.name}</span>
              <small>{project.rootPath}</small>
            </button>
          ))}
          {projects.length === 0 && <p className="empty">No local folders authorized yet.</p>}
        </section>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <h2>{activeProject?.name || 'No project selected'}</h2>
            <p>{activeProject?.rootPath || 'Choose a local folder to grant Haish access.'}</p>
          </div>
          <span className="status">{status}</span>
        </header>

        <div className="content-grid">
          <section className="panel">
            <h3>Local Files</h3>
            <div className="file-list">
              {entries.map((entry) => (
                <button key={entry.relativePath} className="file-row" onClick={() => openFile(entry)}>
                  <span className="file-kind">{entry.kind === 'directory' ? 'DIR' : 'FILE'}</span>
                  <span className="file-name">{entry.name}</span>
                  <span className="file-size">{formatSize(entry.size)}</span>
                </button>
              ))}
              {activeProject && entries.length === 0 && <p className="empty">This folder is empty.</p>}
            </div>
          </section>

          <section className="panel preview">
            <h3>Preview</h3>
            {preview ? (
              <>
                <div className="preview-path">{preview.relativePath}</div>
                <pre>{preview.content}</pre>
              </>
            ) : (
              <p className="empty">Select a small text file to preview the local bridge.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
