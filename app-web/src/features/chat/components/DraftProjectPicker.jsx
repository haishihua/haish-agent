import React from 'react';
import { Check, ChevronUp, Folder, Plus, Search } from 'lucide-react';
import { PortalTooltip, closeAllPortalTooltips } from '../../../shared/ui/PortalTooltip.jsx';

export function DraftProjectPicker({ projects = [], selectedId, onSelect, onAddProject, disabled = false }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  // 菜单向上展开，必须自己限制在触发按钮以上的可用空间里：.chat-workspace 是
  // overflow: clip，超出去的部分会被直接裁掉（项目多时看起来就像被顶掉了）。
  const [menuMaxHeight, setMenuMaxHeight] = React.useState(null);
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
  React.useLayoutEffect(() => {
    if (!open) { setMenuMaxHeight(null); return undefined; }
    function measure() {
      const trigger = rootRef.current?.querySelector('.draft-project-trigger');
      if (!trigger) return;
      const clip = rootRef.current?.closest('.chat-workspace');
      const clipTop = clip ? clip.getBoundingClientRect().top : 0;
      const available = trigger.getBoundingClientRect().top - clipTop - 12;
      // 默认跟 model 菜单同高（360）；窗口/面板矮时再向下收敛，保证顶边不越界。
      setMenuMaxHeight(Math.max(180, Math.min(360, Math.round(available))));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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
        <Folder size={15} aria-hidden="true" /><span>{selected.name}</span><ChevronUp className="draft-project-chevron" size={14} aria-hidden="true" />
      </button>
    </PortalTooltip>
    {open ? <div className="draft-project-menu" role="dialog" aria-label="Choose project" style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px` } : undefined}>
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
