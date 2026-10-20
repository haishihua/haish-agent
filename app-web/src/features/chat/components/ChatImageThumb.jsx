import React from 'react';
import { ImageOff } from 'lucide-react';

/**
 * 聊天里的图片缩略图。
 *
 * 历史消息只保存图像的绝对路径，真正渲染时走
 * `/api/conversations/<id>/messages/images/preview?image_path=...`。一旦
 * runtime state 里的文件被清理/迁移，这个接口会返回 404，浏览器就会画出
 * 一个"碎图"图标；点击预览还会打开一个空白浮层。这里显式接住 onError，
 * 换成明确的 "Image unavailable"，并且不再提供预览入口。
 */
export function ChatImageThumb({ image, onPreview }) {
  const src = String(image?.previewUrl || '');
  const key = `${image?.image_id || image?.path || ''}::${src}`;
  const [failedKey, setFailedKey] = React.useState('');
  const failed = Boolean(src) && failedKey === key;
  const title = image?.name || image?.path || 'Attached image';

  if (!src) {
    return (
      <span className="chat-message-image-fallback" aria-hidden="true">▦</span>
    );
  }

  return (
    <button
      type="button"
      className={`chat-message-image-button${failed ? ' is-unavailable' : ''}`}
      onClick={() => {
        if (failed) return;
        onPreview?.({ src, title });
      }}
      aria-label={failed ? 'Image unavailable' : 'Preview attached image'}
      title={failed ? 'Image unavailable — the file is no longer on this device' : undefined}
      disabled={failed}
    >
      {failed ? (
        <span className="chat-message-image-unavailable">
          <ImageOff size={15} strokeWidth={1.6} aria-hidden="true" />
          <span>Image unavailable</span>
        </span>
      ) : (
        <img src={src} alt="" draggable={false} onError={() => setFailedKey(key)} />
      )}
    </button>
  );
}
