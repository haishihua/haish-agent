import React from 'react';
import { ChatImageThumb } from '../ChatImageThumb.jsx';
import { Markdown } from '../../../../shared/ui/Markdown.jsx';

export function ChatTimelineUserInputNode({ item, onPreviewImage }) {
  const text = String(item.text || '').trim();
  const images = Array.isArray(item.images) ? item.images : [];
  if (!text && images.length === 0) return null;
  // 纠偏/打断指令与用户自己发出的消息完全一样：气泡外观直接与
  // .chat-message-row.user .message-speech-body 共用同一套 CSS 声明，正文也用同一个
  // .chat-bubble-text + Markdown hardBreaks 渲染（换行照原样保留）。不加任何特殊
  // 标签（You / Queued instruction）或虚线边框。
  return (
    <div className="chat-timeline-user-input">
      <div className="chat-timeline-user-input-bubble">
        {images.length > 0 ? (
          <div className="chat-message-images chat-timeline-user-input-images" aria-label="Attached images">
            {images.map((image, index) => (
              <div key={image.image_id || image.path || index} className="chat-message-image">
                <ChatImageThumb image={image} onPreview={onPreviewImage} />
              </div>
            ))}
          </div>
        ) : null}
        {text ? (
          <div className="chat-bubble-text">
            <Markdown source={text} hardBreaks />
          </div>
        ) : null}
      </div>
    </div>
  );
}
