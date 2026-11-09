import React from 'react';
import { TOOL_ICON_CLASSES } from '../../../../core/tool-names.js';

// 工具卡之间的审批上下文：时间线（AgentTimeline）提供，工具节点消费。
export const ToolApprovalsContext = React.createContext(new Map());

// 登记过的工具名去 core/tool-names.js 取图标，这里只留「名字里带关键词」的兜底：
// 未登记的别名、MCP 工具（chrome_devtools_* 之类）都得靠它。
export function resolveToolIconClass(toolName, defaultClass) {
  // 只小写化、不 trim：历史实现如此，带空白的名字一直落到默认图标，
  // 换成 normalizeToolName 会静默改变渲染。
  const name = String(toolName || '').toLowerCase();
  if (!name) return defaultClass;
  const registered = TOOL_ICON_CLASSES.get(name);
  if (registered) return registered;
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return 'ico-checkpoint';
  }
  if (name.startsWith('note_')) {
    return 'ico-note';
  }
  if (name.includes('memory') || name.includes('remember') || name.includes('recall')) {
    return 'ico-memory';
  }
  if (name.includes('weather') || name.includes('forecast') || name.includes('temperature')) {
    return 'ico-weather';
  }
  if (name.includes('write') || name.includes('create_file') || name.includes('save_file') || name.includes('patch')) {
    return 'ico-file-write';
  }
  if (
    name.includes('read_file') ||
    name.includes('read_text') ||
    name.includes('open_file') ||
    name.includes('cat_file') ||
    name.includes('view_file')
  ) {
    return 'ico-file-read';
  }
  if (
    name.includes('web') ||
    name.includes('search') ||
    name.includes('fetch') ||
    name.includes('http') ||
    name.includes('url')
  ) {
    return 'ico-web';
  }
  return defaultClass;
}
