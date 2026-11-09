# 重构审计记录

审计范围：untangle-codebase 的「特殊案例」与四类关联问题，覆盖 `app-web/src` 全部源码。
结论按「已修 / 测试锁定的误解 / 故意不修 / 待办」分类留档，避免下次重新审一遍。

## 已修

| 位置 | 问题 |
| --- | --- |
| `core/run-status.js` | `terminalNoticeStatus` 自列第三份状态别名表；改读 `normalizeTaskStatus` + `isTerminalStatus` |
| `core/task-runtime.js` | 可见事件集合里带着 `final_answer`，而 `buildChatTimeline` 从不渲染它——空壳会因此不回滚 |
| `core/workflow-catalog/labels.js` | `WORKFLOW_FIELD_LABELS` 是恒等映射，25 行表等价于 `item.fieldId` |
| `core/workflow-catalog/nodes.js` | 默认输出映射/schema 与已有常量逐字重复，改引用 |
| `core/tool-view-shared.js` | `isToolFailure` 抄了 `tool-trace-status.js` 的失败判据；改为复用 |
| `core/tool-presentation.js` | 8000 / 1000 截断值手写 6 次，提成命名常量（输出文本不变） |
| `core/tool-presentation.js` + `core/runtime-events.js` | skill 根目录清单两套：事件流只认 `.skills(-src)`，真实安装根里的 skill 取不到名字；归一成 `skillNameFromPath` |
| `core/chat-timeline.js` | toolItem 构造在「事件流」与「toolCalls 兜底」两条路径各写约 40 行；抽成 `buildToolItem` |
| `shared/lib/local-image-path.js` | 图片扩展名写了两遍（正则 + 拼进大正则的片段）；由同一个源生成 |
| `shared/api/base.js` | 模块顶层硬读 `window.HAISH_API_BASE`，让纯数据投影链在 Node 里整体加载失败；改为容错 |
| `shared/lib/conversation-load-perf.js` | 自述 `TEMPORARY` 的启动探针仍在生产链路（改写每个会话响应、挂 subtree MutationObserver）；删除 |
| `features/workflow/model/node-reasoning-options.js` | 一行包装，声明 `model_id` 却从不读；调用点直接用 `REASONING_EFFORT_OPTIONS` |
| `features/conversations/hooks/createConversationRuntime.js` | 四个字段 setter 逐字复制同一骨架，合成 `runtimeFieldWriter` |
| `features/conversations/model/workspace-state.js` | 任务映射参数默认恒等，漏传会静默产出 summary 形状；改为必需，并补上 `createDeployHandlers` 那处漏传 |
| `features/app/AppShell.jsx` → `conversations/model` | 「本地拷贝 + 目录拷贝」合并抽成 `conversationSettledTaskIds`，接线从此可测 |

## 测试锁定的误解

- **`task-runtime.js` 的 `serverFinished` 只认 `done` / `failed` / `cancelled`，不是漏洞。**
  `tests/features/tasks/task-runtime-paging.test.js` 明确要求它不认 `completed` 等历史别名：
  合并后的列表会拿本地拷贝覆写目录写下的落地标记，认了别名就检测不出「拷贝停在半路」。
- **`node-attempts.js` 的 `goalJudgeInput` 特判 Goal 工作流不是「通用投影里的意外特判」**——
  函数名就是它的职责边界。

## 故意不修

| 位置 | 理由 |
| --- | --- |
| `useConversationRunConfig.ensureSaved` 与 `attempt-run-config.waitForAttemptRunConfig` | 看着同构，但前者要查挂载状态、会话归属、保存阻塞原因；合并等于把 React 生命周期塞进通用函数 |
| 「从事件里取文本」的回落链（`message-text` / `stream-events` / `progress-text`） | 字段优先级不同是有意的：子 agent 事件用 `message` 承载叙述，增量流用 `delta`。统一会改显示文本 |
| `provider-brand.js` 与 `runtime-events.normalizeProviderKey` | 前者「model id → 图标品牌」，后者「provider 字段 → 协议标签」，词表重叠但语义与默认值不同 |
| `workflow-catalog/layout.js` 与 `runtime-workflow-layout.js` | 两套自动排版（列数、回环规则不同），统一会改变用户看到的图 |
| `tool-presentation.js` 改用 `compactToolText` | 两者截断后的尾部标记不同，统一会改用户可见输出 |
| `contracts/*` 里的 JSX 结构断言 | 仓库没有 JSX 测试基建（无 SSR/jsdom 先例）；先抽可测函数，再逐批替换 |
| `AppShell.jsx` 881 行 | 组合根，30+ state 全向下分发；逻辑已在 `useShellHandlers` / `useShellRuntimeWiring` |

## 待办

1. `core/pet-state.js` —— 为了算一个表情把整棵 chat timeline 构建一遍；需要一条轻量活动投影。
2. `shared/lib/local-file-link.js` —— 解析根是模块级可变全局，靠别处 effect 注入；应改成显式参数或独立 store。
3. `shared/lib/settings-sync.js` —— 「写入方先应用响应、被跳过的读再恢复」的顺序契约压在一个 `setTimeout(…, 0)` 里。
4. `shared/ui/Markdown.jsx` —— 打开本机文件失败靠 `haish:toast` 自定义事件字符串约定，接收方在 features 里。
5. `shared/ui/ImagePreviewOverlay.jsx` —— 复制图片的失败只 `console.error`，界面无反馈（属产品行为，需产品决策）。
6. `features/conversations/model/task-runtime-requests.js` —— 通用合并器里混进调用方词汇（`joinBatch`）。

第 1–3 项是纯结构调整，第 4 项要定一个跨层通知出口，第 5 项要产品决策，第 6 项影响请求合并键。
