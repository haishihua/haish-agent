// 任务记录的共用原语：id、时间戳、图片引用归一。
// conversations 与 tasks 都读这一份，谁也不再为了拿时间戳去 import 对方。
import { chatImagePreviewUrl } from '../shared/api/chat-image.js';

export function generateHexId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

export function normalizeChatImageRefs(refs, conversationId) {
  return (Array.isArray(refs) ? refs : [])
    .filter((ref) => ref && (ref.path || ref.previewUrl))
    .map((ref, index) => ({
      image_id: ref.image_id || ref.imageId || `image-${index}`,
      path: ref.path || '',
      mime: ref.mime || null,
      previewUrl: chatImagePreviewUrl(ref, conversationId),
    }));
}

function mergeChatImageRefValue(existing = {}, incoming = {}) {
  return {
    ...existing,
    ...incoming,
    image_id: incoming.image_id || incoming.imageId || existing.image_id || existing.imageId,
    path: incoming.path || existing.path || '',
    mime: incoming.mime || existing.mime || null,
    previewUrl: incoming.previewUrl || existing.previewUrl || '',
  };
}

export function mergeChatImageRefs(...groups) {
  // 去重以 path 为优先 key——同一张图被多个源头（服务端记录 / 消息标记还原 /
  // 上一轮客户端 state）各自合成的 image_id 不同，但 path 是真正稳定的"内容标识"。
  // 历史实现按 image_id 优先，导致重启恢复 task 时 2 张图被算成 4 张。
  const order = [];
  const mergedByKey = new Map();
  groups.flat().forEach((ref) => {
    if (!ref) return;
    const path = String(ref.path || '').trim();
    const key = path || ref.image_id || ref.imageId || ref.previewUrl;
    if (!key) return;
    if (!mergedByKey.has(key)) {
      order.push(key);
      mergedByKey.set(key, ref);
      return;
    }
    mergedByKey.set(key, mergeChatImageRefValue(mergedByKey.get(key), ref));
  });
  return order.map((key) => mergedByKey.get(key)).filter(Boolean);
}

export function timestampValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function taskUpdatedTimestamp(task) {
  if (!task) return 0;
  return Math.max(
    timestampValue(task.updatedAt),
    timestampValue(task.updated_at),
    timestampValue(task.completedAt),
    timestampValue(task.completed_at),
    timestampValue(task.createdAt),
    timestampValue(task.created_at),
  );
}

export function taskCreatedTimestamp(task) {
  if (!task) return 0;
  return Math.max(
    timestampValue(task.createdAt),
    timestampValue(task.created_at),
  );
}
