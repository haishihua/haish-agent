import React from 'react';

// 工具卡之间的审批上下文：时间线（AgentTimeline）提供，工具节点消费。
export const ToolApprovalsContext = React.createContext(new Map());

export function resolveToolIconClass(toolName, defaultClass) {
  const name = String(toolName || '').toLowerCase();
  if (!name) return defaultClass;
  if (name === 'ask_user') {
    // ask_user 是平台控制工具（后端 tool_group=external），不显式匹配会落到
    // ico-mcp 的魔法棒图标上，语义不对。
    return 'ico-ask-user';
  }
  if (name === 'workspace_artifact') {
    return 'ico-workspace-artifact';
  }
  if (name === 'vision_analyze' || name === 'visual_inspect') {
    return 'ico-visual-inspect';
  }
  if (name === 'image_describe') {
    return 'ico-image-describe';
  }
  if (name === 'image_generate') {
    // 与 Settings → Image 分组同一枚相框图标；不显式匹配会落回 ico-tool 的
    // 通用工具图标，和“生图”这件事对不上。
    return 'ico-image-generate';
  }
  if (name === 'browser_use' || name === 'browser') {
    return 'ico-browser';
  }
  if (name === 'computer_use') {
    return 'ico-computer-use';
  }
  if (name === 'exec_command' || name === 'write_stdin') {
    return 'ico-terminal';
  }
  if (name === 'copy_file') {
    return 'ico-copy-file';
  }
  if (name === 'create_dir') {
    return 'ico-create-dir';
  }
  if (name === 'read_artifact') {
    return 'ico-read-artifact';
  }
  if (name === 'delete_file') {
    return 'ico-delete-file';
  }
  if (name === 'delete_dir') {
    return 'ico-delete-dir';
  }
  if (name === 'todo_write') {
    return 'ico-todo-write';
  }
  if (name === 'list_dir') {
    return 'ico-list-dir';
  }
  if (name === 'glob_files') {
    return 'ico-glob-files';
  }
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return 'ico-checkpoint';
  }
  if (name.startsWith('note_')) {
    return 'ico-note';
  }
  if (name === 'search_text') {
    return 'ico-search-text';
  }
  if (name === 'edit_file' || name === 'replace_lines' || name === 'multi_edit' || name === 'apply_patch') {
    return 'ico-file-write';
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

/**
 * 复用的 collapse/expand chevron。
 * 用 inline SVG 而不是 <img src=...png>——因为全局 body 有 `image-rendering: pixelated`
 * 会把任何位图强制走最邻近缩放、变得很糊。SVG 是矢量，不受影响。
 * fill="currentColor" 让箭头颜色跟随容器 color（比如折叠胶囊的金色）。
 *
 * open=false → ▸ (next, 朝右)
 * open=true  → ▾ (down, 朝下)
 */
