/**
 * Markdown → 一行纯文本。
 *
 * 只服务一个用途：把渲染成 Markdown 的模型文本（题目、选项、上下文）压成
 * 可访问名称（`aria-label`、`title`）。这类地方不能直接塞 markdown 源码——
 * 读屏会把 `**什么**` 连星号一起念出来——也不能塞整段长文。
 *
 * 不追求 CommonMark 完备：聊天里真实出现的形态是反引号、粗斜体、链接、列表、
 * 表格和代码围栏，这些剥干净就够用；解析不了的行原样保留，宁丑不丢信息。
 */
const FENCE = /^\s*(?:`{3,}|~{3,})/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s+/;
const QUOTE = /^\s{0,3}>\s?/;
const BULLET = /^\s{0,3}[-*+]\s+/;
const ORDERED = /^\s{0,3}\d{1,3}[.)]\s+/;

function stripInline(line) {
  return line
    // 图片先于链接：`![alt](src)` 要留 alt，不能只留一个空壳。
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 行内代码只去掉反引号，内容照留（"`agent_id`" → "agent_id"）。
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    // `*` 与 `_` 分开处理：CommonMark 里词内下划线不算强调，
    // `snake_case_name` 必须原样留下（压成 `snakecasename` 就是丢信息）。
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, '$1')
    .replace(/(?<![\w])_(?=\S)(.+?)(?<=\S)_(?![\w])/g, '$1');
}

export function markdownPlainText(source, { maxLength = 0 } = {}) {
  const text = String(source ?? '');
  const lines = text.split(/\r?\n/);
  // 竖线只在整块确实是表格（有分隔行）时才算分隔符：正文里的 “a | b” 要原样留着。
  const isTable = lines.some((line) => TABLE_DIVIDER.test(line));
  const kept = [];
  for (const raw of lines) {
    if (FENCE.test(raw) || TABLE_DIVIDER.test(raw)) continue;
    const content = raw.replace(HEADING, '').replace(QUOTE, '');
    const line = stripInline(isTable ? content.replace(/\s*\|\s*/g, ' ') : content)
      .replace(BULLET, '')
      .replace(ORDERED, '');
    const trimmed = line.replace(/\s+/g, ' ').trim();
    if (trimmed) kept.push(trimmed);
  }
  const plain = kept.join(' ').trim();
  if (!maxLength || plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
