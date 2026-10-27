// 只做「按工具类型分派」：每种工具的形状在 tool-view/ 下。
//   terminal  终端卡（exec_command / write_stdin）
//   file      读 / 写 / diff 卡
//   search    搜索与浏览器
//   agent     子 Agent / 视觉 / 生成图片
//   shared    文本压缩、JSON 清洗、失败判定与标签文案
import { normalizeToolName } from './tool-names.js';
import { skillTrigger } from './tool-presentation.js';
import { buildJsonToolView, firstToolPath, isToolFailure } from './tool-view/shared.js';
import { TOOL_SHELL_NAMES, buildTerminalToolView } from './tool-view/terminal.js';
import {
  TOOL_CHANGE_NAMES,
  TOOL_DIFF_NAMES,
  TOOL_READ_NAMES,
  buildChangeToolView,
  buildDiffToolView,
  buildReadToolView,
} from './tool-view/file.js';
import { buildSearchToolView } from './tool-view/search.js';
import { buildProcessToolSummary, buildProcessToolView, buildSubAgentTimelineItems, isProcessTool } from './tool-view/agent.js';

export { TOOL_SHELL_NAMES, buildSubAgentTimelineItems };

export function buildToolView(item, { details = true } = {}) {
  const name = normalizeToolName(item.toolName);
  // 折叠的 sub-agent chip 只要 label / failed / 是否可展开：不碰 toolInput 的字段，
  // 也不枚举 progressEvents。放在 skill 前面是安全的——`skillTrigger` 只认
  // read_file / load_skill / skill，哪一个都不可能落成 category `subagent`。
  if (!details && item.category === 'subagent') return buildProcessToolSummary(item);
  const path = firstToolPath(item);
  const skill = skillTrigger(item);
  if (skill) return { mode: 'skill', label: skill.name, skill, failed: isToolFailure(item) };
  if (name === 'web_search' || name === 'web_fetch' || name === 'browser_use') {
    return buildSearchToolView(item, name);
  }
  if (isProcessTool(item, name)) return buildProcessToolView(item, name);
  if (TOOL_DIFF_NAMES.has(name)) return buildDiffToolView(item, name, path);
  if (TOOL_CHANGE_NAMES.has(name)) return buildChangeToolView(item, path);
  if (TOOL_READ_NAMES.has(name)) return buildReadToolView(item, path);
  if (TOOL_SHELL_NAMES.has(name)) return buildTerminalToolView(item, name);
  return buildJsonToolView(item);
}
