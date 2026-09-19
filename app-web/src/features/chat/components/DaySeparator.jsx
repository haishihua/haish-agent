import React from 'react';

// 会话详情里的日期分隔（对照 assistant-ui 的 day-separator 元素）：一条居中的
// 「rule + 日期 + rule」。文案由消息自己的时间戳算出（model/day-separators.js），
// 组件本身不猜日期、也不按条数插——只把传进来的那一天画出来。
export function ChatDaySeparator({ label }) {
  const text = String(label || '').trim();
  if (!text) return null;
  return (
    <div className="chat-day-separator" role="separator" aria-label={text}>
      <span className="chat-day-separator-label">{text}</span>
    </div>
  );
}
