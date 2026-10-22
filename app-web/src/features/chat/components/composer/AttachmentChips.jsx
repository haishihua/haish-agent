import React from 'react';
import { PortalTooltip } from '../../../../shared/ui/PortalTooltip.jsx';
import { AttachmentFileChip } from '../../../../shared/ui/AttachmentFileChip.jsx';
import { ContextTaskChip } from '../../../../shared/ui/ContextTaskChip.jsx';
import { imageDraftLabel } from './shared.js';

/**
 * 输入框内部的载荷预览条：上下文任务 / 文档附件 / 粘贴进来的图片草稿。
 * 只渲染 props 里的东西；删除、清空、预览全部回调 ChatComposer 既有的处理器，
 * 所以这三类 chip 的生命周期（imageStore 里的条目、blob URL）仍然归主文件管。
 */
export function AttachmentChips({
  contextTask,
  onClearContextTask,
  disabled,
  attachment,
  uploading,
  onClearFile,
  images,
  onRemoveImage,
  onPreviewImage,
}) {
  return (
    <>
      {contextTask && (
        <ContextTaskChip task={contextTask} onClear={onClearContextTask} disabled={disabled} />
      )}
      {attachment && (
        <AttachmentFileChip attachment={attachment} uploading={uploading} onClear={onClearFile} />
      )}
      {images.length > 0 && (
        <div className="chat-composer-images" aria-label="Pasted images">
          {images.map((img) => (
            <PortalTooltip
              key={img.id}
              text={imageDraftLabel(img)}
              position="above"
            >
              <div
                className={`chat-composer-image-chip ${img.uploading ? 'is-uploading' : ''} ${img.error ? 'has-error' : ''}`}
              >
                <button
                  type="button"
                  className="chat-composer-image-preview-button"
                  onClick={() => onPreviewImage?.({
                    src: img.previewUrl || img.path,
                    title: img.file?.name || img.path || 'Pasted image',
                  })}
                  disabled={!img.previewUrl && !img.path}
                  aria-label="Preview pasted image"
                >
                  {img.previewUrl ? (
                    <img src={img.previewUrl} alt="" draggable={false} />
                  ) : (
                    <span className="chat-composer-image-fallback" aria-hidden="true">!</span>
                  )}
                </button>
                {img.uploading && <span className="chat-composer-image-spinner" aria-hidden="true" />}
                <button
                  type="button"
                  className="chat-composer-image-remove"
                  onClick={() => onRemoveImage(img.id)}
                  aria-label="Remove image"
                >×</button>
              </div>
            </PortalTooltip>
          ))}
        </div>
      )}
    </>
  );
}
