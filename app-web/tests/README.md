# 回归测试

## 自动测试

- `npm test`：运行所有 `*.test.js` / `*.test.mjs`。
- `npm run check:web`：架构检查、自动测试、ESLint 和生产构建。
- `features/` 按被测功能分组，`contracts/` 保留架构约束和历史缺陷测试，`integration/` 覆盖跨模块行为。
- `features/settings/skill-package.test.js` 直接测试正式 Skill 包解析器，覆盖正常包、坏包、元数据、路径及大小限制。
- `contracts/markdown-list-indent.test.js` 锁住渲染后的 Markdown 列表缩进：标记必须挂在正文列外（`outside` + 左内边距），折行与列表正文同列，并禁止任何样式表再引入 `list-style-position: inside`。
- `contracts/draft-conversation-reentry.test.js` + `features/conversations/draft-conversation-reentry.test.js` 锁住“新建会话草稿不丢”：空白会话 id 每项目稳定复用（否则未发送文本会被孤儿化），发送物化后释放 id，取消草稿时把文本还给该 id。
- `features/chat/path-references.test.js` 锁住“路径卡片”的形状判据：显式路径（`/`、`~/`、`./`、`../`、盘符、UNC）原样认；相对路径要求段名都是纯路径字符、末段像文件（带非纯数字后缀或白名单文件名）。分支名（`release/20260917`）、版本号（`v1.2/3`）、中文短语（`明天/后天`）以及夹在中文句子里的整行（`那就把修复分支合并到release/20260917`）都不再变成 FOLDER 卡片，且模型层（`localPathReference`）与气泡层（`splitPathReferenceDraft`）必须同口径——认不出来就一个字都不从正文里搬走。
- `contracts/user-message-line-breaks.test.js` + `features/chat/remark-hard-breaks.test.js` 锁住用户气泡换行：用户文本的软换行转成 `<br>`（真实 mdast→hast 管线断言），助手回答保持 CommonMark 软换行，代码块不受影响；编号列表里的续行（编辑重发那种「3. xxx / 续行」）同样要留在自己一行，且 resend 行文本（`task.displayText ?? task.title`）只许 trim 两端、不许折叠内部换行。
- `contracts/loading-state.test.js` 锁住设置页的加载占位：懒加载回退必须渲染 assistant-ui Loader（九宫格点亮规则、120ms 计时与清理）、整块居中，标签用正文字体 `--conversation-font` 并有扫光与 reduced-motion 回退。
- `contracts/error-surface-unification.test.js` 锁住“失败提示只有一套 UI”：旧的私有错误类（`.message-action-error` / `.settings-inline-error` / `.haish-dialog-error` / `.haish-approval-error` / `.remote-settings-error` / `.form-error`）必须从 `app-web/src` 与 `app-web/styles` 里消失；聊天失败轮、设置表单、删除对话框、重命名对话框、远端设置、审批卡（含提问卡与工作流审批）、工具卡的失败详情、崩溃屏都渲染 `shared/ui/agent-elements/ErrorState.jsx`（面板内用 `variant="inline"`），红卡/胶囊 Retry 的口径留在同一份 `error-state.css`；崩溃屏必须继续识别陈旧分片（`Failed to fetch dynamically imported module` → “Reload app”），且 `shared/lib/preload-recovery.js` 在 `./app.jsx` 之前挂上 `vite:preloadError` 一次性重载（sessionStorage 防循环）。
- `contracts/steering-message-style.test.js` 锁住“纠偏气泡就是用户气泡”：气泡底色/边框/圆角/内边距必须与用户消息共用同一条规则（不许本地再抄一份），正文走 `.chat-bubble-text` + Markdown hardBreaks，且仍嵌在被打断的 assistant 回复框内。
- `contracts/workflow-task-sidebar.test.js` 锁住 sidecar 任务行与状态词表：终态别名（`completed` / `aborted` / `success` / `error`）只许有一份清单（`conversations/model/conversation-status.js`），而且每个别名都要归一成规范串（`tasks/model/task-runtime.js` 的 `normalizeTaskStatus`：少归一个当场就是「卡片写着 PENDING、行却按已收工排序」，卡片牌子的出口 `tasks/model/task-pill.js` 也有别名断言），「这一轮收工了没」只有 `isTaskSettled` 一个判据（灯、面板 streaming、任务卡、侧边栏排序锚点共用，后者的排序锚点由行为断言锁住：别名写进清单里就会被当成已收工），落地任务压过过期的 `workflowRun` 快照和还挂着 `running` 的状态串，"还在跑" 只有 `isTaskLive` 一个判据（不看 `answerText`、不看 `workflowRun`）。收工判据还要读对拷贝：只认两份权威快照（本地运行时拷贝 + 会话目录/服务端列表拷贝），合并出来的 `currentConversation.tasks` 不能用——本地拷贝会把目录的 `status` / `completedAt` 盖掉，别名终态就藏住了（`features/tasks/task-runtime-paging.test.js` 用行为断言锁住：合并拷贝算没收工，两份快照一起算收工并触发重建）。
- `contracts/activity-orb-revive.test.js` + `features/chat/orb-liveness.test.js` 锁住“切会话时 thinking orb 卡死”的兜底：活动 orb 只能经 `ActivityOrb` 渲染（`thinking-orbs` 只许出现在包装层），画布在屏幕上且页面可见时连续四帧像素完全不变就重挂库组件恢复动画；离屏、隐藏窗口、`prefers-reduced-motion: reduce` 都不算卡死（reduced-motion 下库只画一帧、永不启动循环，实测 4 秒 1 帧），且回前台只在“想要动画”时重挂；不能判断的采样（隐藏窗口 / reduced-motion / 离屏）连像素都不读，不给后台窗口白烧每 400ms 一次 `getImageData`。
- `contracts/assistant-agent-name.test.js` + `features/chat/assistant-name.test.js` 锁住“助手气泡写的是会话选定的 agent”：气泡名字只许来自 `message.agentName`（写死的 `Assistant` 只剩“历史轮次连 agent 记录都没有”这一种显示），AppShell 按「这一轮任务的 `profile_display_name` → 这一轮 agent id → 会话记录的 agent」解析，名字和 ModelPicker 共用同一份 catalog 的 `label`，内部 id（`custom.agent-…`）不许漏到界面上。
- `contracts/reduced-motion-source.test.js` 锁住“reduced-motion 判据只有一份”：`prefers-reduced-motion: reduce` 查询串在 `app-web/src` 里只许出现在 `shared/lib/reduced-motion.js`，orb 看门狗、输入框彩虹环、标题金属字、企鹅手势都 import 同一个 `prefersReducedMotion()`（每次现读，不缓存）。
- `features/conversations/project-rename.test.js` 锁住“项目改名”（双击项目行，跟会话行同一个手势）：只 `PATCH /api/projects/<id>`（body 只有 `name`），两端空白先 trim、空名一个请求都不发，服务端报错时侧边栏名字保持原样，名字回写以服务端落定的值为准（系统项目不会凭空长出 `workspaceLabel`），并盯住手势的接线：双击只由项目行认领，折叠图标与动作按钮不算。
- `features/conversations/list-preview.test.js` 锁住侧边栏预览分页：默认 5 行、每点一次 “Show more” 再加 5 行，条数只有一份来源（`conversations/model/list-preview.js` 的 `PREVIEW_PAGE_SIZE`），隐藏列表（折叠项目 / 收起面板）后重新打开必须回到默认预览，不许恢复上次展开的状态。
- `contracts/appshell-ctx-wiring.test.js` 锁住 AppShell 的 ctx 装配：工厂从 ctx 解构出的键（没带默认值的）必须在对应调用点全部递进去——少一个不会编译报错、也不会让行为测试变红，只会在跑到那行时炸成 `x is not a function`（`createDraftConversationHandlers` 曾漏递 `applyContextUsage` / `latestContextUsageFromTasks`，向上翻页恢复更早轮次记录整条路停在 TypeError 上，聊天里只剩 “Could not load earlier steps. Retry loading steps”）。

## 浏览器 DOM 回归

运行 `npx vite --config vite.app-web.config.ts`，依次打开下面的页面。每页自动执行断言并显示 `PASS` / `FAIL`；这些检查需要真实 DOM，不包含在 `npm test` 中。

| 页面 | 覆盖范围 |
| --- | --- |
| [conversation-search.html](fixtures/conversation-search.html) | 关键词 Range、跨标签匹配、精确跳转和滚动条标记 |
| [message-annotations.html](fixtures/message-annotations.html) | 选区引用、UTF-16 偏移、跨 Markdown 选取和重新定位 |
| [annotation-numbering.html](fixtures/annotation-numbering.html) | 注释编号在整个会话内累加：跨轮次、草稿与已发送引用共用同一序号 |
| [chat-streaming-regression.html](fixtures/chat-streaming-regression.html) | 生产 ChatPanel 的历史消息缓存、最新分支/重试/编辑参数；批注增量处理、滚动布局、DOM 替换及清理；历史步骤连续翻页、搜索、失败重试与切换会话 |
| [day-separator.html](fixtures/day-separator.html) | 生产 ChatPanel + 真实时间戳：会话详情的日期头只在消息自己的 `created_at` 跨天处出现（首条消息也有头，列表从历史中间打开时同样成立），头在当天第一条消息前面、同一天共享一条；追加同一天的消息不新增头，跨到新的一天立刻多一条；每条消息自己的时间仍留在悬停浮标（`.chat-bubble-clock`）上，日期头里没有时间；`#checks[data-result]` 输出逐项 PASS / FAIL |
| [tool-cards.html](fixtures/tool-cards.html) | 生产工具卡片、分组、详情、流式状态、终态收尾和子 Agent 交互 |
| [app-toast.html](fixtures/app-toast.html) | 生产 AppToast：向量徽标、三种状态配色、未知 kind 回退与 `image-rendering` 回归 |
| [send-beam.html](fixtures/send-beam.html) | 生产 MetalActionEffect：彩虹环在“输入框有内容或任务运行中”点亮，空闲隐藏图层但不重挂外壳 |
| [steering-message.html](fixtures/steering-message.html) | 生产 ChatMessageRow：纠偏指令与用户消息的气泡底色/边框/圆角/内边距/正文排版逐项一致，纠偏消息保留换行且仍嵌在 assistant 回复框内 |
| [user-message-lines.html](fixtures/user-message-lines.html) | 生产 ChatMessageRow：编辑重发那种「编号列表 + 续行」的用户气泡必须把续行留在自己一行（列表项内 `<br>`），同一文本的助手气泡仍按 CommonMark 折行；`window.__lineChecks()` 返回逐项断言 |
| [path-reference-cards.html](fixtures/path-reference-cards.html) | 生产 ChatMessageRow：`那就把修复分支合并到release/20260917` 必须原样留在气泡里（不再变成 `20260917 / FOLDER` 的空白泡），分支名 / 版本号 / 中文短语同理；真路径仍然出卡片（绝对路径 = FOLDER、带后缀的相对路径 = 文件类型、路径旁边的正文不丢）；`window.__pathCardChecks()` 返回逐项断言，页面加载后自动跑一次（用 setTimeout 而不是 rAF，后台标签页也能跑） |
| [assistant-agent-name.html](fixtures/assistant-agent-name.html) | 生产 ChatMessageRow + `assistantNameForTask`：助手气泡上方的名字跟着会话选定的 agent（任务记录 → 会话记录 → 当轮 agent id），user 行仍是 `You`，内部 id 不出现；`window.__agentNameChecks()` 返回逐项断言 |
| [conversation-run-lamp.html](fixtures/conversation-run-lamp.html) | 生产 ConversationNode + 生产 `useConversationRunState` + 生产 approvalStore（事件用 `window.haish.onApprovalEvent` 替身推进）：会话行状态灯只从「任务未落终态 = 蓝灯；后端实时快照有未决提问/审批 = 黄灯；任务落地终态 = 熄灯」得出，黄灯的类名/aria-label/琥珀色/15px 共享 glyph/不吃点击逐项断言，落地任务不被旧快照重新点亮；展开后的任务卡同样在提问到达的当帧就换黄灯图标（不再等轮询把 `workflowRun` 追上来），非命中任务的卡保持蓝转圈，“等回答”的图标是气泡+问号（lucide message-circle-question，不再是空白气泡）；`window.__lampChecks()` 返回逐项断言（夹具不走 rAF 就不推进，自动化需先 `Page.bringToFront` 把标签页切到前台） |
| [project-rename.html](fixtures/project-rename.html) | 生产 ConversationsPanel + 生产 ProjectNode + 生产 ConversationDialog：双击项目行弹出「Rename project」对话框（输入框预填当前名字、提交时 trim 后交给项目改名 handler、成功后关闭），单击仍然是选择，折叠图标 / pin / 新建会话按钮上的双击不算改名，系统项目同样能改，取消不发请求，会话行双击仍然是会话改名；`#checks[data-result]` 输出逐项 PASS / FAIL |
| [sidebar-preview.html](fixtures/sidebar-preview.html) | 生产 ConversationsPanel + ProjectNode + ConversationNode（8 个会话、其中一个展开着 8 张任务卡）：会话行与任务卡都默认只放 5 行、每点一次 “Show more” 再加 5 行、再点一下（“Show less”）收回默认预览，两份展开互不影响；`#checks[data-result]` 输出逐项 PASS / FAIL |
| [activity-orb-revive.html](fixtures/activity-orb-revive.html) | 生产 ChatMessageRow 的流式活动 orb：健康 orb 连续动画且不被重挂；IntersectionObserver 投递丢失、rAF 循环被取消导致永久静止时看门狗重挂后恢复动画；隐藏窗口不重挂、回前台才重挂；`prefers-reduced-motion: reduce` 下保持单帧且永不重挂。逐项跑 `window.__runOrbCheck(1…6)`（回传 `pageErrors`），第 5 项需先用 `Emulation.setEmulatedMedia` 把 `prefers-reduced-motion` 设成 `reduce`；自动化窗口被遮蔽时页面会变 hidden 并冻结 rAF，需先用 `Emulation.setFocusEmulationEnabled` + `Page.bringToFront` |
| [workflow-node-reply-name.html](fixtures/workflow-node-reply-name.html) | 生产 WorkflowRuntimePage + 生产 ChatMessageRow：点开工作流节点后，agent 节点的回复气泡署名该节点配置的 `agent_id`（两个不同节点各署各的名字），llm 节点与审批卡仍写 `Assistant`，节点输入气泡仍是 `You`，内部 id 不出现，整轮点节点看回复没有页面报错；`window.__workflowReplyNameChecks` 返回逐项断言 |
| [ask-user-card.html](fixtures/ask-user-card.html) | 生产 AskUserInlineForm + 生产 approvalStore：占位提示写明「可加备注，也可自己写答案」，题目翻页是 26px 描边圆按钮 + `Question 1 of 2` + 悬停说明且真的能切题，最后一题/第一题的禁用边界、提交门禁与「选选项 + 备注 / 纯手写」的答案形状逐项断言；方框勾选是可取消的开关（单选项再点一次就取消、取消后重新点回来照样能选上、取消不删已写下的备注，整行点击走的也是同一条路）；`window.__askUserChecks()` 返回逐项断言 |
| [turn-duration.html](fixtures/turn-duration.html) | 生产 ChatMessageRow：折叠步骤的时长只来自真时间戳——拷贝里没有 `completedAt` 时数字位留空（截图里那个「› 0s」就是这里编出来的），有完成时间的轮次显示量出来的值，在跑的轮次从首字起计时，展开态没有完成时间时不渲染计时器，数字位留空时折叠按钮仍有可访问名（`Show steps`，有时长时名字就是那个真数字）；`#checks[data-result]` 输出逐项 PASS / FAIL |
| [error-states.html](fixtures/error-states.html) | 生产 ErrorState / ErrorBoundary（跑在真实 `chat.css` 上）：失败提示只有一套 UI——聊天失败轮是 16px 圆角红卡 + 胶囊 Retry，设置 / 对话框 / 审批卡里的 inline 卡更紧凑（没有重试入口就不渲染按钮，带 handler 时才回来）且铺满容器（不缩成药丸），同一张卡进聊天气泡时与正文留 8px，重试中是 `role=status` 的扫光行；崩溃屏复用同一张卡（标题 HAISH UI ERROR、卡不再是内联样式方框、原始堆栈收进 Technical details），陈旧分片给 Reload app、普通崩溃给 Try again；`window.__errorStateChecks()` 返回逐项断言 |

页面地址前缀为 `http://127.0.0.1:5173/tests/fixtures/`。保留 `message-annotations.dom-checks.js`、`annotation-numbering.jsx`、`task-attempt-runtime.js` 和工具卡片页面资源，它们是回归测试依赖。

`chat-streaming-regression.html` 挂载生产组件并离线模拟模型列表，自动检查 60 条历史回答在无批注和带批注两种情况下各 30 批流式更新的正文读取次数，以及批注 DOM 遍历/测量次数；不调用模型、不修改真实会话。页面标题及 `#checks[data-result]` 输出最终 PASS / FAIL，完成后恢复拦截并卸载组件。必须在前台浏览器运行（断言等待 requestAnimationFrame），不属于 Node 测试入口。

Electron 审批流回归脚本保留在 `scripts/check-approval-transport.cjs`，依赖编译后的 main 模块及本地 Electron 环境，未纳入浏览器或 Node 自动测试入口。

## 清理规则

仅保留可重复执行、有明确断言的测试及其依赖。设计预览、截图造数页和一次性诊断脚本完成验证后移除；有价值的检查迁入正式用例，直接导入生产代码，不保留组件副本或演示实现。
