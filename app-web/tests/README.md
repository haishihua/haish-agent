# 回归测试

## 自动测试

- `npm test`：运行所有 `*.test.js` / `*.test.mjs`。
- `npm run check:web`：架构检查、自动测试、ESLint 和生产构建。
- `features/` 按被测功能分组，`contracts/` 保留架构约束和历史缺陷测试，`integration/` 覆盖跨模块行为。
- `features/settings/skill-package.test.js` 直接测试正式 Skill 包解析器，覆盖正常包、坏包、元数据、路径及大小限制。

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
| [send-beam.html](fixtures/send-beam.html) | 生产 MetalActionEffect：彩虹环只在任务运行中显示，空闲隐藏图层但不重挂外壳 |

页面地址前缀为 `http://127.0.0.1:5173/tests/fixtures/`。保留 `message-annotations.dom-checks.js`、`annotation-numbering.jsx`、`task-attempt-runtime.js` 和工具卡片页面资源，它们是回归测试依赖。

`chat-streaming-regression.html` 挂载生产组件并离线模拟模型列表，自动检查 60 条历史回答在无批注和带批注两种情况下各 30 批流式更新的正文读取次数，以及批注 DOM 遍历/测量次数；不调用模型、不修改真实会话。页面标题及 `#checks[data-result]` 输出最终 PASS / FAIL，完成后恢复拦截并卸载组件。必须在前台浏览器运行（断言等待 requestAnimationFrame），不属于 Node 测试入口。

Electron 审批流回归脚本保留在 `scripts/check-approval-transport.cjs`，依赖编译后的 main 模块及本地 Electron 环境，未纳入浏览器或 Node 自动测试入口。

## 清理规则

仅保留可重复执行、有明确断言的测试及其依赖。设计预览、截图造数页和一次性诊断脚本完成验证后移除；有价值的检查迁入正式用例，直接导入生产代码，不保留组件副本或演示实现。
