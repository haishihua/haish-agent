# 重构审计记录

审计范围：untangle-codebase 的「特殊案例」与四类关联问题，覆盖 `app-web/src` 全部源码。
结论按「已修 / 测试锁定的误解 / 故意不修 / 待办」四类留档，避免下次重新审一遍。

## 已修

| 位置 | 问题 |
| --- | --- |
| `core/run-status.js` | `terminalNoticeStatus` 自列第三份状态别名表；改读 `normalizeTaskStatus` + `isTerminalStatus` |
| `core/task-runtime.js` | 可见事件集合里带着 `final_answer`，而 `buildChatTimeline` 从不渲染它——空壳会因此不回滚 |
| `core/workflow-catalog/labels.js` | `WORKFLOW_FIELD_LABELS` 是恒等映射，25 行表等价于 `item.fieldId` |
| `features/workflow/model/node-reasoning-options.js` | 一行包装，声明 `model_id` 却从不读；调用点直接用 `REASONING_EFFORT_OPTIONS` |
| `core/tool-view-shared.js` | `isToolFailure` 抄了 `tool-trace-status.js` 的失败判据；改为复用 |
| `core/tool-presentation.js` | 8000 / 1000 截断值手写 6 次，提成命名常量（输出文本不变） |
| `core/workflow-catalog/nodes.js` | 默认输出映射/schema 与已有常量逐字重复，改引用 |
| `features/conversations/hooks/createConversationRuntime.js` | 四个字段 setter 逐字复制同一骨架，合成 `runtimeFieldWriter` |
| `features/app/AppShell.jsx` → `conversations/model` | 「本地拷贝 + 目录拷贝」的合并抽成 `conversationSettledTaskIds`，接线从此可测 |

## 测试锁定的误解

- **`task-runtime.js` 的 `serverFinished` 只认 `done` / `failed` / `cancelled`，不是漏洞。**
  `tests/features/tasks/task-runtime-paging.test.js` 明确要求它不认 `completed` 等历史别名：
  合并后的列表会拿本地拷贝覆写目录写下的落地标记，`serverFinished` 认了别名就检测不出
  「拷贝停在半路」。改前必须读锁定该行为的测试。

## 故意不修

| 位置 | 理由 |
| --- | --- |
| `draft-handlers/task-runtime-restore.js` 的 `restoreLatestTaskRuntime` | 看着像转发，但带三条前置校验；是防御性入口，不是 pass-through |
| `tool-presentation.js` 用 `compactToolText` 统一截断 | 两者截断后的尾部标记不同，统一会改用户可见文本 |
| `contracts/*` 里的 JSX 结构断言 | 仓库没有 JSX 测试基建（无 SSR/jsdom 先例）；先抽可测函数，再逐批替换 |
| `AppShell.jsx` 881 行 | 组合根，30+ state 全向下分发；逻辑已在 `useShellHandlers` / `useShellRuntimeWiring` |

## 待办（需产品决策或更大验证成本）

1. `shared/lib/conversation-load-perf.js` —— 自述 `TEMPORARY` 的启动打点仍在生产链路，
   还为聊天 DOM 挂着 MutationObserver。删它要确认不再需要这份诊断。
2. `core/chat-timeline.js` —— toolItem 构造在「事件流」与「toolCalls 兜底」两条路径各写一份（约 40 行）。
3. 「从事件里取文本」的回落链有 4–5 份实现，字段顺序不一致（`message-text` / `stream-events` /
   `task-runtime` / `chat-timeline` / `progress-text`）。
4. 供应商推断两套（`shared/lib/provider-brand.js` 的正则表 vs `core/runtime-events.js` 的 includes 链）。
5. skill 根目录清单两套（`tool-presentation.js` 认四个根，`runtime-events.js` 只认两个）。
6. 自动排版算法两套（`workflow-catalog/layout.js` 与 `runtime-workflow-layout.js`）。
7. `conversations/hooks/useConversationRunConfig.js` —— 手写了一份 `waitForAttemptRunConfig` 的完整副本，
   以 `background` 布尔量选择实现。
8. `conversations/model/workspace-state.js` —— 四个导出函数的 `mapTask` 默认恒等，漏传会静默产出错形状。

前七项都涉及「同一语义两处实现」，改动要么触到用户可见输出，要么要跨 2 个以上领域同步验证；
按领域分批做，每批都跑 `npm run check:web`。
