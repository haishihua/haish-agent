import React from 'react';
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

export function AttachmentFileChip({ attachment, uploading = false, onClear }) {
  if (!attachment) return null;
  const name = attachment.name || attachment.title || 'Attached file';
  const iconState = uploading ? 'is-loading' : attachment.uploaded ? 'is-ready' : 'is-pending';
  const glyphClass = uploading ? 'ico-loading' : attachment.uploaded ? 'ico-google-docs' : 'ico-attach';

  return (
    <PortalTooltip text={name} position="above">
      <div className={`composer-file-chip ${uploading ? 'is-uploading' : ''} ${attachment.uploaded ? 'is-ready' : ''}`}>
        <span className={`composer-file-icon ${iconState}`} aria-hidden="true">
          <span className={`ico composer-file-glyph ${glyphClass}`} />
        </span>
        <span className="composer-file-copy">
          <span className="composer-file-name">{name}</span>
          <span className="composer-file-kind">{attachmentKind(attachment)}</span>
        </span>
        <button type="button" className="composer-file-remove" onClick={onClear} aria-label="Remove file" disabled={uploading}>×</button>
      </div>
    </PortalTooltip>
  );
}
