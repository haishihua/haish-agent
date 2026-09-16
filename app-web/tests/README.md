# 回归测试

## 自动测试

- `npm test`：运行所有 `*.test.js` / `*.test.mjs`。
- `npm run check:web`：架构检查、自动测试、ESLint 和生产构建。
- `features/` 按被测功能分组，`contracts/` 保留架构约束和历史缺陷测试，`integration/` 覆盖跨模块行为。
- `features/settings/skill-package.test.js` 直接测试正式 Skill 包解析器，覆盖正常包、坏包、元数据、路径及大小限制。
- `contracts/markdown-list-indent.test.js` 锁住渲染后的 Markdown 列表缩进：标记必须挂在正文列外（`outside` + 左内边距），折行与列表正文同列，并禁止任何样式表再引入 `list-style-position: inside`。
- `contracts/draft-conversation-reentry.test.js` + `features/conversations/draft-conversation-reentry.test.js` 锁住“新建会话草稿不丢”：空白会话 id 每项目稳定复用（否则未发送文本会被孤儿化），发送物化后释放 id，取消草稿时把文本还给该 id。
- `contracts/user-message-line-breaks.test.js` + `features/chat/remark-hard-breaks.test.js` 锁住用户气泡换行：用户文本的软换行转成 `<br>`（真实 mdast→hast 管线断言），助手回答保持 CommonMark 软换行，代码块不受影响；编号列表里的续行（编辑重发那种「3. xxx / 续行」）同样要留在自己一行，且 resend 行文本（`task.displayText ?? task.title`）只许 trim 两端、不许折叠内部换行。
- `contracts/loading-state.test.js` 锁住设置页的加载占位：懒加载回退必须渲染 assistant-ui Loader（九宫格点亮规则、120ms 计时与清理）、整块居中，标签用正文字体 `--conversation-font` 并有扫光与 reduced-motion 回退。
- `contracts/steering-message-style.test.js` 锁住“纠偏气泡就是用户气泡”：气泡底色/边框/圆角/内边距必须与用户消息共用同一条规则（不许本地再抄一份），正文走 `.chat-bubble-text` + Markdown hardBreaks，且仍嵌在被打断的 assistant 回复框内。
- `contracts/activity-orb-revive.test.js` + `features/chat/orb-liveness.test.js` 锁住“切会话时 thinking orb 卡死”的兜底：活动 orb 只能经 `ActivityOrb` 渲染（`thinking-orbs` 只许出现在包装层），画布在屏幕上且页面可见时连续四帧像素完全不变就重挂库组件恢复动画；离屏、隐藏窗口、`prefers-reduced-motion: reduce` 都不算卡死（reduced-motion 下库只画一帧、永不启动循环，实测 4 秒 1 帧），且回前台只在“想要动画”时重挂；不能判断的采样（隐藏窗口 / reduced-motion / 离屏）连像素都不读，不给后台窗口白烧每 400ms 一次 `getImageData`。
- `contracts/assistant-agent-name.test.js` + `features/chat/assistant-name.test.js` 锁住“助手气泡写的是会话选定的 agent”：气泡名字只许来自 `message.agentName`（写死的 `Assistant` 只剩“历史轮次连 agent 记录都没有”这一种显示），AppShell 按「这一轮任务的 `profile_display_name` → 这一轮 agent id → 会话记录的 agent」解析，名字和 ModelPicker 共用同一份 catalog 的 `label`，内部 id（`custom.agent-…`）不许漏到界面上。
- `contracts/reduced-motion-source.test.js` 锁住“reduced-motion 判据只有一份”：`prefers-reduced-motion: reduce` 查询串在 `app-web/src` 里只许出现在 `shared/lib/reduced-motion.js`，orb 看门狗、输入框彩虹环、标题金属字、企鹅手势都 import 同一个 `prefersReducedMotion()`（每次现读，不缓存）。

## 浏览器 DOM 回归

运行 `npx vite --config vite.app-web.config.ts`，依次打开下面的页面。每页自动执行断言并显示 `PASS` / `FAIL`；这些检查需要真实 DOM，不包含在 `npm test` 中。

| 页面 | 覆盖范围 |
| --- | --- |
| [conversation-search.html](fixtures/conversation-search.html) | 关键词 Range、跨标签匹配、精确跳转和滚动条标记 |
| [message-annotations.html](fixtures/message-annotations.html) | 选区引用、UTF-16 偏移、跨 Markdown 选取和重新定位 |
| [annotation-numbering.html](fixtures/annotation-numbering.html) | 注释编号在整个会话内累加：跨轮次、草稿与已发送引用共用同一序号 |
| [chat-streaming-regression.html](fixtures/chat-streaming-regression.html) | 生产 ChatPanel 的历史消息缓存、最新分支/重试/编辑参数；批注增量处理、滚动布局、DOM 替换及清理；历史步骤连续翻页、搜索、失败重试与切换会话 |
| [tool-cards.html](fixtures/tool-cards.html) | 生产工具卡片、分组、详情、流式状态、终态收尾和子 Agent 交互 |
| [app-toast.html](fixtures/app-toast.html) | 生产 AppToast：向量徽标、三种状态配色、未知 kind 回退与 `image-rendering` 回归 |
| [send-beam.html](fixtures/send-beam.html) | 生产 MetalActionEffect：彩虹环在“输入框有内容或任务运行中”点亮，空闲隐藏图层但不重挂外壳 |
| [steering-message.html](fixtures/steering-message.html) | 生产 ChatMessageRow：纠偏指令与用户消息的气泡底色/边框/圆角/内边距/正文排版逐项一致，纠偏消息保留换行且仍嵌在 assistant 回复框内 |
| [user-message-lines.html](fixtures/user-message-lines.html) | 生产 ChatMessageRow：编辑重发那种「编号列表 + 续行」的用户气泡必须把续行留在自己一行（列表项内 `<br>`），同一文本的助手气泡仍按 CommonMark 折行；`window.__lineChecks()` 返回逐项断言 |
| [assistant-agent-name.html](fixtures/assistant-agent-name.html) | 生产 ChatMessageRow + `assistantNameForTask`：助手气泡上方的名字跟着会话选定的 agent（任务记录 → 会话记录 → 当轮 agent id），user 行仍是 `You`，内部 id 不出现；`window.__agentNameChecks()` 返回逐项断言 |
| [activity-orb-revive.html](fixtures/activity-orb-revive.html) | 生产 ChatMessageRow 的流式活动 orb：健康 orb 连续动画且不被重挂；IntersectionObserver 投递丢失、rAF 循环被取消导致永久静止时看门狗重挂后恢复动画；隐藏窗口不重挂、回前台才重挂；`prefers-reduced-motion: reduce` 下保持单帧且永不重挂。逐项跑 `window.__runOrbCheck(1…6)`（回传 `pageErrors`），第 5 项需先用 `Emulation.setEmulatedMedia` 把 `prefers-reduced-motion` 设成 `reduce`；自动化窗口被遮蔽时页面会变 hidden 并冻结 rAF，需先用 `Emulation.setFocusEmulationEnabled` + `Page.bringToFront` |

页面地址前缀为 `http://127.0.0.1:5173/tests/fixtures/`。保留 `message-annotations.dom-checks.js`、`annotation-numbering.jsx`、`task-attempt-runtime.js` 和工具卡片页面资源，它们是回归测试依赖。

`chat-streaming-regression.html` 挂载生产组件并离线模拟模型列表，自动检查 60 条历史回答在无批注和带批注两种情况下各 30 批流式更新的正文读取次数，以及批注 DOM 遍历/测量次数；不调用模型、不修改真实会话。页面标题及 `#checks[data-result]` 输出最终 PASS / FAIL，完成后恢复拦截并卸载组件。必须在前台浏览器运行（断言等待 requestAnimationFrame），不属于 Node 测试入口。

Electron 审批流回归脚本保留在 `scripts/check-approval-transport.cjs`，依赖编译后的 main 模块及本地 Electron 环境，未纳入浏览器或 Node 自动测试入口。

## 清理规则

仅保留可重复执行、有明确断言的测试及其依赖。设计预览、截图造数页和一次性诊断脚本完成验证后移除；有价值的检查迁入正式用例，直接导入生产代码，不保留组件副本或演示实现。
