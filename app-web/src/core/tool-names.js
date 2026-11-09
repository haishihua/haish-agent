/**
 * 工具名的唯一登记处：卡片形状、图标、动作文案都从这里派生。
 * 以前这几面各抄一份名字表，加一个工具要改五处，漏一处就落回通用 JSON 卡 + 通用图标。
 *
 * 刻意不并进本表的清单（语义不同，合并会改行为）：
 *   tool-grouping.js      按动词分桶（read / wrote / edited…），还含 cat_file、apply_diff、
 *                         includes('patch') 这类别名与包含匹配，管的是分组摘要怎么念。
 *                         分桶规则留在那边，只有「某个工具的动词不一样」（list_checkpoints）
 *                         这种单值覆盖登记在这里的 verbPast / verbPresent。
 *   changed-files.js      只算真的产出文件行的工具：含 save_file、不含 create_dir —— 建目录
 *                         不产生文件行，卡片却仍要显示成「Created dir」，两套集合天然不同。
 *                         集合留在那边，只有「去哪个字段取目标路径」登记在这里的 targetField。
 *   tool-presentation.js  的 skill 触发判定（read_file 是否在读 SKILL.md）不是工具分类。
 */

export function normalizeToolName(toolName) {
  return String(toolName || '').trim().toLowerCase();
}

// 一条记录 = 一个工具的全部身份。加工具时只加一行，各面自动跟上。
const TOOL_REGISTRY = [
  // 终端：exec_command 与它的写回 write_stdin 共用一张终端卡。
  // approvalLabel 单独给：审批弹层要说明「这条命令会在终端里跑」，与工具栏的 label 'Shell' 不是一回事。
  { name: 'exec_command', icon: 'ico-terminal', label: 'Shell', terminal: true, approvalLabel: 'Command (runs in terminal)' },
  // write_stdin 的 label 是 Process：它表示「在一次已有终端里继续操作」，不是新开的 shell。
  // terminalInput：不新建卡片，而是把输入/结果并回它续写的那条终端卡。
  { name: 'write_stdin', icon: 'ico-terminal', label: 'Process', terminal: true, terminalInput: true },

  // 只读检索/读文件：结果一定带结构化 path，所以能直接出「动词 + 路径」的读卡。
  { name: 'read_file', icon: 'ico-file-read', label: 'Read', read: true },
  { name: 'search_text', icon: 'ico-search-text', label: 'Search text', read: true },
  { name: 'glob_files', icon: 'ico-glob-files', label: 'Glob files', read: true },
  { name: 'list_dir', icon: 'ico-list-dir', label: 'List dir', read: true },

  // 写入类：diff 卡能画出增删行数；其余各写操作只有结果没有 diff，走变更卡。
  { name: 'write_file', icon: 'ico-file-write', label: 'Wrote', failureLabel: 'Write failed', diff: true, change: true, activeLabel: 'Writing' },
  { name: 'edit_file', icon: 'ico-file-write', label: 'Edited', failureLabel: 'Edit failed', diff: true, change: true },
  { name: 'replace_lines', icon: 'ico-file-write', label: 'Replaced lines', failureLabel: 'Replace lines failed', diff: true, change: true },
  { name: 'multi_edit', icon: 'ico-file-write', label: 'Edited', failureLabel: 'Edit failed', diff: true, change: true },
  { name: 'apply_patch', icon: 'ico-file-write', label: 'Patched', failureLabel: 'Apply patch failed', diff: true, change: true },
  { name: 'create_file', icon: 'ico-file-write', label: 'Created', failureLabel: 'Create failed', change: true },
  { name: 'delete_file', icon: 'ico-delete-file', label: 'Deleted', failureLabel: 'Delete failed', change: true },
  { name: 'copy_file', icon: 'ico-copy-file', label: 'Copied', failureLabel: 'Copy failed', change: true, targetField: 'destination_path' },
  { name: 'create_dir', icon: 'ico-create-dir', label: 'Created dir', change: true },

  // 搜索/浏览器：三者各有专属卡片形态（搜索结果、抓取正文、浏览器截图与代码）。
  { name: 'web_search', icon: 'ico-web', web: true },
  { name: 'web_fetch', icon: 'ico-web', web: true },
  { name: 'browser_use', icon: 'ico-browser', web: true },

  // 过程卡：展示子 Agent 的进度流 / 视觉结论，不能让它们落进通用 JSON 卡。
  { name: 'dispatch_sub_agent', process: true },
  { name: 'sub_agent', process: true },
  { name: 'subagent', process: true },
  { name: 'vision_analyze', icon: 'ico-visual-inspect', process: true, visual: true },
  { name: 'visual_inspect', icon: 'ico-visual-inspect', process: true, visual: true },
  { name: 'image_describe', icon: 'ico-image-describe', process: true, visual: true },
  // 视觉结论与生图分开：生图沿用 Settings → Image 分组的相框图标。
  { name: 'image_generate', icon: 'ico-image-generate', process: true },

  // 其余工具只需要一枚专属图标，卡片形状沿用通用卡。
  // ask_user 是平台控制工具（后端 tool_group=external），不给专属图标会落到 MCP 的魔法棒。
  { name: 'ask_user', icon: 'ico-ask-user', awaitsUser: true },
  { name: 'workspace_artifact', icon: 'ico-workspace-artifact' },
  { name: 'read_artifact', icon: 'ico-read-artifact' },
  { name: 'delete_dir', icon: 'ico-delete-dir' },
  // todo_write 的状态由 todo_updated 事件单独承载，时间线再出一张卡就是把同一件事说两遍。
  { name: 'todo_write', icon: 'ico-todo-write', timelineHidden: true },
  // 列出 checkpoint 是只查不改：分组 chip 要念 “checked” 而不是回滚那一半的 “snapshotted”。
  // verbPresent 一并写在这里：span 进行时的 “checking” 同样不能跟着回滚变 “snapshotting”。
  { name: 'list_checkpoints', verbPast: 'checked', verbPresent: 'checking', checkpointCard: true },
  // browser 是 browser_use 的旧别名，只影响图标，不进 web 卡分派。
  { name: 'browser', icon: 'ico-browser' },
  { name: 'computer_use', icon: 'ico-computer-use' },
];

const toolNamesWith = (flag) => new Set(
  TOOL_REGISTRY.filter((tool) => tool[flag]).map((tool) => tool.name),
);

const lookupWith = (field) => new Map(
  TOOL_REGISTRY.filter((tool) => tool[field]).map((tool) => [tool.name, tool[field]]),
);

/** 终端卡：exec_command 及其写回 write_stdin。 */
export const TOOL_SHELL_NAMES = toolNamesWith('terminal');
/** 读卡：只读且结果带 path 的工具，比分组用的 read 桶窄（那边要认 cat_file 等别名）。 */
export const TOOL_READ_NAMES = toolNamesWith('read');
/** diff 卡：结果里能拿到 unified diff 的写入工具。 */
export const TOOL_DIFF_NAMES = toolNamesWith('diff');
/** 变更卡：会改动工作区的工具。diff 那批先命中 diff 卡，剩下的（建/删/复制/建目录）落到这里。 */
export const TOOL_CHANGE_NAMES = toolNamesWith('change');
/** 过程卡：子 Agent 与视觉/生图，要进度流而不是 JSON。 */
export const TOOL_PROCESS_NAMES = toolNamesWith('process');
/** 视觉类：过程卡里按图像任务渲染（acceptance_check 等别名由调用点的包含匹配兜底）。 */
export const TOOL_VISUAL_NAMES = toolNamesWith('visual');
/** 搜索/浏览器卡。 */
export const TOOL_WEB_NAMES = toolNamesWith('web');
/** 会暂停任务、等人回答的工具：时间线不分组、工作流置 waiting_input 都靠它判。 */
export const TOOL_AWAITS_USER_NAMES = toolNamesWith('awaitsUser');
/** 不进聊天时间线的工具：它们的进展由别的事件（todo_updated）渲染。 */
export const TOOL_TIMELINE_HIDDEN_NAMES = toolNamesWith('timelineHidden');
/** 写回已有终端会话的工具：卡片要并回父终端，不能自己再出一张。 */
export const TOOL_TERMINAL_INPUT_NAMES = toolNamesWith('terminalInput');

/** 工具名 → 分组动词（过去式 / 进行时）；未登记的名字用各分组自己的默认动词。 */
export const TOOL_PAST_VERBS = lookupWith('verbPast');
export const TOOL_PRESENT_VERBS = lookupWith('verbPresent');
/** 用 checkpoint 卡渲染的工具。 */
export const TOOL_CHECKPOINT_CARD_NAMES = toolNamesWith('checkpointCard');

/** 工具名 → 动作文案（进行时）；未登记的名字用 diff 卡的默认 "Editing"。 */
export const TOOL_ACTIVE_LABELS = lookupWith('activeLabel');
/** 工具名 → 结果里真正被写到的路径字段：copy_file 的 subject 同时带源和目的地。 */
export const TOOL_TARGET_FIELDS = lookupWith('targetField');
/** 工具名 → 审批弹层的字段名文案（与 label 分开，同一个工具两处说法不同）。 */
export const TOOL_APPROVAL_LABELS = lookupWith('approvalLabel');

/** 工具名 → 图标类；未登记的名字交给 resolveToolIconClass 的关键词兜底。 */
export const TOOL_ICON_CLASSES = lookupWith('icon');
/** 工具名 → 动作文案（成功态）。 */
export const TOOL_ACTION_LABELS = lookupWith('label');
/** 工具名 → 动作文案（失败态）。 */
export const TOOL_FAILURE_ACTION_LABELS = lookupWith('failureLabel');
