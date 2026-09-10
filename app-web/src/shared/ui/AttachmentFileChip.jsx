import React from 'react';
import { FileText, Folder } from 'lucide-react';
import { PortalTooltip } from './PortalTooltip.jsx';

function attachmentKind(attachment) {
  const name = String(attachment?.name || attachment?.title || '').trim();
  const type = String(attachment?.type || attachment?.mime || '').toLowerCase();
  const extension = name.match(/\.([^.\\/]+)$/)?.[1];
  if (extension) return extension.slice(0, 5).toUpperCase();
  if (type.includes('markdown')) return 'MD';
  if (type.includes('pdf')) return 'PDF';
  if (type.startsWith('image/')) return 'IMG';
  if (type.startsWith('text/')) return 'TXT';
  return 'FILE';
}

export function AttachmentFileChip({ attachment, uploading = false, onClear, pathReference = false, disabled = false }) {
  if (!attachment) return null;
  const name = attachment.name || attachment.title || 'Attached file';
  const iconState = uploading ? 'is-loading' : attachment.uploaded ? 'is-ready' : 'is-pending';
  const glyphClass = uploading ? 'ico-loading' : attachment.uploaded ? 'ico-google-docs' : 'ico-attach';
  const PathIcon = attachment.kind === 'file' ? FileText : Folder;

  return (
    <PortalTooltip text={pathReference ? attachment.path : name} position="above">
      <span className={`composer-file-chip ${pathReference ? 'is-path-reference' : ''} ${uploading ? 'is-uploading' : ''} ${attachment.uploaded ? 'is-ready' : ''}`}
        tabIndex={pathReference ? 0 : undefined} aria-label={pathReference ? attachment.path : undefined}>
        <span className={`composer-file-icon ${iconState}`} aria-hidden="true">
          {pathReference ? <PathIcon size={20} strokeWidth={1.5} /> : <span className={`ico composer-file-glyph ${glyphClass}`} />}
        </span>
        <span className="composer-file-copy">
          <span className="composer-file-name">{name}</span>
          <span className="composer-file-kind">{pathReference ? attachment.kindLabel : attachmentKind(attachment)}</span>
        </span>
        {onClear && <button type="button" className="composer-file-remove" onClick={onClear}
          aria-label={pathReference ? `Remove reference to ${name}` : 'Remove file'} disabled={uploading || disabled}>×</button>}
      </span>
    </PortalTooltip>
  );
}
