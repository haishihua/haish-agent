import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const resultDialogSource = fs.readFileSync(new URL('../../../src/shared/ui/ResultDialog.jsx', import.meta.url), 'utf8');
const appIconSource = fs.readFileSync(new URL('../../../src/shared/ui/AppIcon.jsx', import.meta.url), 'utf8');
const contextChipSource = fs.readFileSync(new URL('../../../src/shared/ui/ContextTaskChip.jsx', import.meta.url), 'utf8');
const chatComposerSource = fs.readFileSync(new URL('../../../src/features/chat/components/ChatComposer.jsx', import.meta.url), 'utf8');
const appShellSource = fs.readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const conversationHandlersSource = fs.readFileSync(new URL('../../../src/features/conversations/hooks/createConversationHandlers.js', import.meta.url), 'utf8');
const deployHandlersSource = fs.readFileSync(new URL('../../../src/features/tasks/hooks/createDeployHandlers.js', import.meta.url), 'utf8');
const streamHandlersSource = fs.readFileSync(new URL('../../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url), 'utf8');
const taskRuntimeSource = fs.readFileSync(new URL('../../../src/features/tasks/model/task-runtime.js', import.meta.url), 'utf8');
const chatTimelineSource = fs.readFileSync(new URL('../../../src/features/chat/model/chat-timeline.js', import.meta.url), 'utf8');
const taskCardsSource = fs.readFileSync(new URL('../../../src/features/conversations/components/ConversationTaskCards.jsx', import.meta.url), 'utf8');
const projectNodeSource = fs.readFileSync(new URL('../../../src/features/conversations/components/ProjectNode.jsx', import.meta.url), 'utf8');
const modalsCss = fs.readFileSync(new URL('../../../styles/modals.css', import.meta.url), 'utf8');
const chatCss = fs.readFileSync(new URL('../../../styles/chat.css', import.meta.url), 'utf8');
const panelsCss = fs.readFileSync(new URL('../../../styles/panels.css', import.meta.url), 'utf8');

test('报告对话框底部的入口：有引用才出现，点了挂标签、关对话框', () => {
  assert.match(resultDialogSource, /export function ResultDialog\(\{ open, title, result, onClose, onUseAsContext \}\)/);
  assert.match(resultDialogSource, /className="iv-btn iv-btn-context"/);
  assert.match(resultDialogSource, /onClick=\{onUseAsContext\}/);
  assert.match(resultDialogSource, /\{onUseAsContext \? \(/);
  assert.match(modalsCss, /\.iv-btn-context\s*\{/);
  assert.match(appShellSource, /onUseAsContext=\{hollow\?\.contextSource/);
  assert.match(appShellSource, /setContextTask\(hollow\.contextSource\); setHollow\(null\);/);
});

test('报告对话框只有标题行，三个动作都是图标按钮', () => {
  // `TASK OUTPUT` 小标签删干净：同一个对话框还给「会话启动失败」复用，那行标签在那边是错的。
  assert.doesNotMatch(resultDialogSource, /iv-label/);
  assert.doesNotMatch(modalsCss, /\.iv-label\s*\{/);
  assert.equal((resultDialogSource.match(/<AppIcon /g) || []).length, 3);
  assert.match(resultDialogSource, /name="close" size=\{15\}/);
  assert.match(resultDialogSource, /name="layers" size=\{15\}/);
  assert.match(resultDialogSource, /name="download" size=\{15\}/);
  assert.match(appIconSource, /download: Download/);
  // 按钮里只剩图标，文案走 title / aria-label（键盘与读屏仍认得出三枚动作）。
  assert.doesNotMatch(resultDialogSource, />Close</);
  assert.doesNotMatch(resultDialogSource, />Use as context</);
  assert.doesNotMatch(resultDialogSource, />Export</);
  assert.match(resultDialogSource, /title="Close"/);
  assert.match(resultDialogSource, /title="Use as context for a new task"/);
  assert.match(resultDialogSource, /title="Export as Markdown"/);
  assert.match(resultDialogSource, /aria-label="Close report"/);
  assert.match(resultDialogSource, /aria-label="Export report as Markdown"/);
  // 图标按钮的皮：30px 方块；悬停只在真有指针的机器上生效。
  assert.match(modalsCss, /\.iv-btn\s*\{[^}]*width:\s*30px/);
  assert.match(modalsCss, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.iv-btn-close:hover/);
});

test('入口先只对工作流任务开：会话处理器只在 bot 任务的报告里给 contextSource', () => {
  assert.match(conversationHandlersSource, /contextSource: task\?\.executionMode === 'bot' && taskId/);
  assert.match(conversationHandlersSource, /conversationId: task\?\.conversationId \|\| task\?\.conversation_id \|\| null/);
});

test('输入框上的标签复用文件附件芯片的皮', () => {
  assert.match(contextChipSource, /className="composer-file-chip is-context-task"/);
  assert.match(contextChipSource, /className="composer-file-copy"/);
  assert.match(contextChipSource, /className="composer-file-kind">TASK/);
  assert.match(contextChipSource, /className="composer-file-remove"/);
  assert.match(contextChipSource, /Remove context task/);
  assert.match(chatCss, /\.composer-file-chip\.is-context-task\s*\{/);
  assert.match(chatComposerSource, /import \{ ContextTaskChip \}/);
  assert.match(chatComposerSource, /composerImages\.length > 0 \|\| attachment \|\| contextTask/);
  assert.match(chatComposerSource, /<ContextTaskChip task=\{contextTask\} onClear=\{onClearContextTask\}/);
  // 只有工作流那侧的输入框接这枚标签，聊天侧不接（聊天没有这号入口）。
  assert.equal((appShellSource.match(/contextTask=\{contextTask\}/g) || []).length, 1);
  assert.match(appShellSource, /onClearContextTask=\{\(\) => setContextTask\(null\)\}/);
});

test('发送链路只带引用：start 请求带 context_tasks，重试/编辑由服务端沿用', () => {
  assert.equal((streamHandlersSource.match(/context_tasks:/g) || []).length, 1);
  assert.match(streamHandlersSource, /task_id: item\.taskId \|\| item\.task_id/);
  assert.match(streamHandlersSource, /\(Array\.isArray\(pendingTask\.contextTasks\) \? pendingTask\.contextTasks : \[\]\)/);
  assert.match(deployHandlersSource, /contextTasks: contextTask/);
  assert.match(deployHandlersSource, /pendingTask\.contextTasks = Array\.isArray\(request\.contextTasks\)/);
  assert.match(deployHandlersSource, /if \(request\.contextTasks\?\.length\) clearContextTask\?\.\(\)/);
  assert.match(appShellSource, /clearContextTask: \(\) => setContextTask\(null\)/);
});

test('任务行不带来源标：引用只进请求，不进任务卡和任务模型', () => {
  // 任务卡标题下面挂过一枚来源标（`.conversation-task-source-chip`，点一下跳回来源任务），
  // 用户否掉了——这一轮带没带上下文不需要在任务行上再挂个标签。整条显示链路都不许回来，
  // 引用只在 start 请求里带一次。
  assert.doesNotMatch(taskCardsSource, /onOpenSourceTask/);
  assert.doesNotMatch(taskCardsSource, /conversation-task-source/);
  assert.doesNotMatch(projectNodeSource, /onOpenSourceTask/);
  assert.doesNotMatch(panelsCss, /conversation-task-source/);
  // 运行时任务模型也不再归一这份纯显示用的数据（发送读的是本地 pending 草稿自己的字段）。
  assert.doesNotMatch(taskRuntimeSource, /contextTasks/);
  assert.doesNotMatch(taskRuntimeSource, /normalizeTaskContextRefs/);
  assert.doesNotMatch(chatTimelineSource, /contextTasks/);
});
