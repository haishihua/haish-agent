// 会话详情里的日期分隔（对照 assistant-ui 的 day-separator 元素）。
//
// 时间戳是真数据，不是现造的：后端每个 task 记录都带 created_at（见
// core 的 PersistedTaskRecord），前端在 conversations/model → task-runtime.js
// 里把它解析成毫秒的 task.createdAt，AppShell 组装消息行时逐行带出来。
// 这里只做「分组 + 起个名字」，不产生新的时间。
//
// 规则和元素一致：只跟前一条比，日子一变就插一条日期头（rule + label + rule）；
// 列表里出现乱序时间戳时，重复出现的日子会再插一条头，而不是并进上面那组。
// 没有可用时间戳的消息不参与分组——不猜日期，也不插头。时间本身仍留在每条消息
// 自己的悬停浮标上（.chat-message-actions，默认透明、悬停才亮），这里不重复显示。

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return null;
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 本地日历日（不受 UTC 影响：跨零点的那条消息归到用户当时看到的那一天）。 */
function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function absoluteLabel(date, today) {
  const monthDay = `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === today.getFullYear() ? monthDay : `${monthDay}, ${date.getFullYear()}`;
}

/** 某条消息该标哪一天：今天 / 昨天 / 同年只写「Sep 18」、跨年补年份。 */
export function describeMessageDay(timestamp, now = Date.now()) {
  const date = toDate(timestamp);
  if (!date) return null;
  const key = localDayKey(date);
  const today = toDate(now);
  if (!today) return { key, label: absoluteLabel(date, date) };
  if (key === localDayKey(today)) return { key, label: 'Today' };
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key === localDayKey(yesterday)) return { key, label: 'Yesterday' };
  return { key, label: absoluteLabel(date, today) };
}

/**
 * 把消息列表摊平成「日期头 + 消息」的渲染列表：
 *   [header, message, message, header, message, ...]
 * 日期头只在跨天处出现；消息原对象原样保留（React 靠 message.id 复用，不被这里改写）。
 */
export function withDaySeparators(messages, now = Date.now()) {
  const rows = [];
  let previousKey = '';
  (Array.isArray(messages) ? messages : []).forEach((message, index) => {
    const day = describeMessageDay(message?.createdAt, now);
    if (day && day.key !== previousKey) {
      rows.push({ kind: 'day', id: `${message?.id ?? index}-day`, day: day.key, label: day.label });
    }
    if (day) previousKey = day.key;
    rows.push(message);
  });
  return rows;
}
