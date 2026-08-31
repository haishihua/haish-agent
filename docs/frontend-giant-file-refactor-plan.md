# 前端架构治理迁移记录

> 状态：已完成
>
> 完成日期：2026-08-31
> 本文记录一次性迁移结果，不是待办清单。当前强制规范见 [`frontend-architecture-and-conventions.md`](./frontend-architecture-and-conventions.md)。

## 1. 治理目标

旧结构按技术类型堆放在 `api`、`lib`、`panels`，页面壳兼任状态仓库、流程编排和导出中转。测试与生产代码混排，部分模块靠 barrel、全局请求函数、运行时 CSS 和注册回调维持兼容。

本次治理采用以下决定：

- 按业务领域组织源码；
- `shared` 只收无业务归属的 API、纯工具和 UI 原语；
- 测试全部迁到 `app-web/tests`；
- 删除旧路径、barrel 和兼容 re-export；
- 删除 `window.authFetch` 与运行时样式注入；
- 拆开纯 model、React hooks、API 和组件；
- 用自动脚本把边界变成合并门禁。

没有保留双目录、旧 import 或兜底实现。

## 2. 迁移结果

### 2.1 目录

| 旧位置/形态 | 当前归属 |
| --- | --- |
| `src/api/*` | `src/shared/api/*` 或 `features/<domain>/api/*` |
| `src/lib/agent-catalog.js` | `features/agents/model`、`features/workflow/model`、`features/settings/model` |
| `src/lib/workspace-state.js` | `features/conversations/model` |
| `src/lib/task-runtime.js` | `features/tasks/model` |
| `src/panels/*` | 对应领域的 `components`、`hooks`、`model` |
| `panels.jsx` / 页面 re-export | 删除；调用方直接 import owner |
| `src/**/*.test.*` | `app-web/tests/**` |

### 2.2 重点拆分

- `effects.jsx` 拆为 `shared/ui/Markdown.jsx` 与 `ResultDialog.jsx`。
- `Format.jsx` 拆为时间格式纯函数和附件展示组件。
- `path-utils.jsx` 拆入 chat model/hooks 与 shared clipboard/message 工具。
- `shared-constants.jsx` 拆入 chat 运行目录与 app 导航组件。
- Agent、Workflow、LLM、Settings records 从单一 catalog 按领域拆开。
- workflow 节点组件和边样式归入 workflow，设置编辑器和运行页共同直接使用。
- approval 请求、状态、卡片和静态 CSS 分离；删除动态 style 标签。
- `workspace-state` 不再通过注册 mapper 绕开循环；任务映射由组合层显式注入。
- AppShell 的会话、草稿、设置、任务流和部署处理按领域拆入 hooks/流程模块。

### 2.3 测试布局

共 20 个测试文件迁入：

```text
app-web/tests/
  contracts/
  features/chat/
  features/conversations/
  features/tasks/
  features/workflow/
  integration/
```

`scripts/run-app-web-tests.mjs` 显式递归收集测试，避免依赖 Node 对目录参数的非递归行为。

## 3. 当前依赖模型

```text
app → features → shared

feature/components → feature/hooks | feature/model | feature/api | shared
feature/hooks      → feature/model | feature/api | shared
feature/model      → model | shared（无 React）
shared             → shared
```

跨领域 UI 组合必须直接指向真实 owner，不能从页面壳借导出。需要跨领域复用的无业务原语下沉到 `shared/ui`。

## 4. 自动化门禁

新增 `scripts/check-app-web-architecture.mjs`，对以下问题直接失败：

- 错误的根目录文件、测试位置和通用 feature `lib`；
- barrel、无法解析的相对 import；
- model 依赖 React/components/hooks；
- `shared` 反向依赖 feature；
- 静态 import 环；
- 运行时 style 注入和 `window.authFetch`；
- 超过 2000 行的源文件。

统一验收入口：

```bash
npm run check:web
```

它依次执行架构检查、105 项测试、ESLint 和 Vite 生产构建。

## 5. 不再允许的做法

- 为旧路径创建 re-export 或 alias 文件；
- 在页面文件集中导出其他模块；
- 在 `src` 旁放测试；
- 用 `window`、模块级注册器或初始化顺序传递依赖；
- 在 JS 中拼接大段 CSS；
- 用 `utils/common/misc` 掩盖领域归属；
- 为拆文件而制造只转发几十个 props 的空壳；
- 以“后续再清理”为由同时保留新旧实现。

## 6. 维护结论

治理完成后的结构以代码和自动门禁为准。后续功能应在既有领域内扩展；如果确实新增领域，同一个改动必须补齐目录、测试和架构文档。`AppShell` 作为组合根受 2000 行硬上限约束，新增业务规则不得继续堆入其中。
