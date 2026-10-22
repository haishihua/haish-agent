// ChatComposer 拆分后共享的常量与纯函数。
// 这里只放不依赖 React、也不持有任何状态的东西：附件预览条、模型/工具选择、
// 发送按钮三块子组件都从这里取同一份默认值与文案，避免各自再抄一遍。

export const EMPTY_SKILLS = [];
export const EMPTY_HISTORY = [];
export const EMPTY_ANNOTATIONS = [];

// 路径引用超过 Lexical 文本上限时的同一句提示：insertLocalPaths 与 onPathLimit
// 两个入口共用，措辞必须完全一致，否则用户会看到两种说法。
export const PATH_LIMIT_NOTICE =
  'The reference exceeds the message limit (5,000 characters). Shorten the draft and try again.';

// 剪贴板里的图片文件（保持原顺序）。非图片条目和读不出的条目直接丢弃。
export function pastedImageFiles(clipboardData) {
  const items = Array.from(clipboardData?.items || []);
  return items
    .filter((item) => item.kind === 'file' && (item.type || '').toLowerCase().startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

// 图片草稿 chip 的悬浮文案：错误优先，其次上传中，最后退回文件名。
export function imageDraftLabel(image) {
  if (image?.error) return image.error;
  if (image?.uploading) return 'Uploading...';
  return image?.file?.name || 'image';
}

// 选中 skill token 之后用户真正想说的话：`/skill  prompt` → `prompt`。
export function promptAfterSkillToken(text) {
  return String(text || '').match(/^\s*\/[a-z0-9-]*(?:\s+([\s\S]*))?$/i)?.[1] || '';
}
