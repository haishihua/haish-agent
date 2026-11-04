import React from 'react';
import { Check, ChevronDown, Folder, Plus, Search } from 'lucide-react';
import { PortalTooltip, closeAllPortalTooltips } from '../../../shared/ui/PortalTooltip.jsx';

export function DraftProjectPicker({ projects = [], selectedId, onSelect, onAddProject, disabled = false }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const rootRef = React.useRef(null);
  const searchRef = React.useRef(null);
  const selected = projects.find((project) => project.id === selectedId);
  const created = selected?.createdAt ? new Date(selected.createdAt) : null;
  const createdLabel = created && !Number.isNaN(created.getTime())
    ? `${created.getFullYear()}年${created.getMonth() + 1}月${created.getDate()}日 ${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}` : '';
  const matching = projects.filter((project) => `${project.name || ''} ${project.workspacePath || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  React.useEffect(() => {
    if (open) closeAllPortalTooltips();
  }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    const dismiss = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  if (!selected) return null;
  const tooltip = <span className="project-tooltip-content">
    <span className="project-tooltip-name">{selected.name}</span>
    {selected.workspacePath ? <span className="project-tooltip-path">{selected.workspacePath}</span> : null}
    {createdLabel ? <span className="project-tooltip-meta">创建于 {createdLabel}</span> : null}
  </span>;
  return <div className="draft-project-picker" ref={rootRef}>
    <PortalTooltip text={tooltip} position="above" multiline>
      <button type="button" className="draft-project-trigger" aria-label={`Project: ${selected.name}`}
        aria-expanded={open} aria-haspopup="dialog" disabled={disabled} onClick={() => { setQuery(''); setOpen((value) => !value); }}>
        <Folder size={15} aria-hidden="true" /><span>{selected.name}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
    </PortalTooltip>
    {open ? <div className="draft-project-menu" role="dialog" aria-label="Choose project">
      <div className="draft-project-search"><Search size={15} aria-hidden="true" />
        <input ref={searchRef} aria-label="Search projects" placeholder="Search projects" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="draft-project-options">
        {matching.map((project) => <button type="button" key={project.id} className="draft-project-option"
          onClick={() => { onSelect(project.id); setOpen(false); }}>
          <Folder size={15} aria-hidden="true" /><span>{project.name}</span>{project.id === selectedId ? <Check size={15} aria-label="Selected" /> : null}
        </button>)}
        {!matching.length ? <div className="draft-project-empty">No matching projects.</div> : null}
      </div>
      <button type="button" className="draft-project-add" onClick={() => { setOpen(false); onAddProject(); }}>
        <Plus size={15} aria-hidden="true" /><span>Add Project</span>
      </button>
    </div> : null}
  </div>;
}
