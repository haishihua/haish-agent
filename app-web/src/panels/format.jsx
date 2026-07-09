// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';

export function fmtAgo(ts, now) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return s === 0 ? `${m}m ago` : `${m}m ${s}s ago`;
  }
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}
export function fmtAgoCompact(ts, now) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return '0m ago';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

export function getAttachmentKind(attachment) {
  const name = String(attachment?.name || attachment?.title || '').trim();
  const type = String(attachment?.type || attachment?.mime || '').toLowerCase();
  const ext = name.match(/\.([^.\\/]+)$/)?.[1];
  if (ext) return ext.slice(0, 5).toUpperCase();
  if (type.includes('markdown')) return 'MD';
  if (type.includes('pdf')) return 'PDF';
  if (type.startsWith('image/')) return 'IMG';
  if (type.startsWith('text/')) return 'TXT';
  return 'FILE';
}

export function AttachmentFileChip({ attachment, uploading = false, onClear }) {
  if (!attachment) return null;
  const name = attachment.name || attachment.title || 'Attached file';
  const kind = getAttachmentKind(attachment);
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
          <span className="composer-file-kind">{kind}</span>
        </span>
        <button type="button" className="composer-file-remove" onClick={onClear} aria-label="Remove file" disabled={uploading}>×</button>
      </div>
    </PortalTooltip>
  );
}

