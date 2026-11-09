# Haish 前端架构与编码规范

> 状态：强制规范
>
> 更新日期：2026-08-31
> 适用范围：`app-web` 产品前端。架构变更必须在同一个改动中更新本文和自动检查。

## 1. 运行边界

Haish 桌面端由三层组成：

```text
Electron main / preload
        │ haish:// + IPC
        ▼
app-web（Vite + React）
        │ REST / stream
        ▼
haish-agent-core（Python runtime）
```

| 路径 | 职责 |
| --- | --- |
| `src/main/` | Electron 生命周期、协议、runtime 代理、原生能力 |
| `src/preload/` | 白名单 IPC，向页面暴露 `window.haish` |
| `app-web/src/` | 产品 UI、前端状态、HTTP 调用与流式事件处理 |
| `app-web/dist/` | Vite 构建产物；禁止手改和提交 |

产品 UI 只有 `app-web` 一个入口。禁止恢复第二套 renderer、CDN React、浏览器内 Babel 编译或业务 `window.*` 全局。

## 2. 当前源码结构

```text
app-web/
  src/
    main.jsx                 # 样式和 React 入口
    app.jsx                  # ErrorBoundary + AppShell 挂载
    core/                    # 跨领域运行态语义；不依赖 features（见下表）
    features/
      app/                   # 应用组合根、顶栏和主布局
      approvals/             # 审批 API、状态和 UI
      chat/                  # 对话时间线、输入框、流式消息模型
      conversations/         # 项目/会话树、持久化和激活流程
      schedules/             # 定时任务 API、时间规则、实时状态和管理 UI
      settings/              # 设置页面、编辑器和设置模型
      tasks/                 # 任务部署、任务流和委派（只剩编排 hooks）
      workflow/              # 工作流画布、运行详情与领域算法
    shared/
      api/                   # API base、普通请求与通用 header
      lib/                   # 无业务归属的纯工具与数据加载 hook（如 provider 模型目录）
      ui/                    # 无业务归属的展示组件
  tests/
    contracts/               # 静态契约和边界回归
    features/<domain>/       # 领域单测
    integration/             # 跨模块集成测试
  styles/                    # 静态 CSS 分片
```

`src` 根目录只允许 `main.jsx` 和 `app.jsx`。不存在 `src/api`、`src/lib`、`src/panels` 或聚合 barrel。

`core/` 承载「两个以上领域都要读、且没有 UI」的运行态语义。归属靠用途而不是原产地：

| 分组 | 模块 | 谁在读 |
| --- | --- | --- |
| 状态词表 | `run-status`、`run-catalog`、`workflow-ids`、`execution-identity` | 全部领域 |
| 任务记录 | `task-record`、`task-runtime`、`task-runtime-paging`、`task-pill`、`task-completion-notices`、`task-attempts`、`pending-task` | app、chat、conversations、tasks、workflow |
| 消息与流 | `message-text`、`stream-events`、`event-identity`、`runtime-events`、`terminal-timeline`、`tool-names`、`tool-presentation`、`tool-trace-status`、`context-usage`、`quest-ack`、`chat-timeline`、`tool-grouping`、`tool-view-shared`、`progress-text`、`assistant-name`、`changed-files`、`pet-state`、`conversation-loading` | app、chat、conversations、tasks、workflow |
| 工作流目录 | `workflow-catalog`、`workflow-catalog/*`、`workflow-defaults`、`workflow-snapshot`、`workflow-layout-store`、`runtime-workflow-layout`、`node-attempts`、`node-runtime-config`、`execution-config` | chat、settings、tasks、workflow |
| 定时规则 | `schedule`：时间规则与下次运行计算 | app、chat、schedules |
| 审批与配置 | `approval-store`、`workflow-approval-markdown`、`agent-settings`、`agent-catalog-loading`、`provider-catalog`、`project-matching`、`run-config`、`run-config-sync` | app、chat、conversations、schedules、settings、workflow |

判据：**一个领域的 `model/` 只保留该领域自己的算法**；一旦第二个领域也要读，就搬到 `core/` 并在调用方直接改路径，不留 re-export。

## 3. 依赖方向

```text
main.jsx → app.jsx → features/* → core/* → shared/*
                         │
                         ├─ components → hooks / model / api
                         ├─ hooks      → model / api
                         └─ model      → model / shared（不得依赖 React）
```

强制规则：

1. `shared` 和 `core` 不得 import `features`。
2. `model` 不得 import React、组件或 hooks。
3. 多个 feature 都要读的运行态语义（状态词表、终态判据、运行目录、内置 id、任务记录、工作流目录、审批存储、运行参数）放 `core/`，一个领域都不能为了拿它去 import 另一个领域。领域自己的算法仍留在该领域的 `model/`。**feature 之间不允许出现双向依赖**：`A → B` 存在时，`B → A` 必须是零（组件层复用同一方向也算边）。
4. 组件可以组合其他 feature 的公开组件，但不能从对方页面壳或内部编辑器“借”实现。可复用原语应下沉到 `shared/ui`；明确属于一个领域的组件留在该领域。
5. 网络调用放在领域 `api/` 或 `shared/api/`；普通请求直接 import `apiFetch`。
6. 禁止静态 import 环、注册回调式破环、late-bound 全局和隐式初始化副作用。
7. 禁止为了旧路径保留 re-export、barrel、兼容文件或双份实现。迁移时一次修改全部调用方并删除旧文件。
8. 同一张表（状态词表、节点图标与文案、节点尝试投影）只允许一份实现。两份一旦分开就会**实际漂移**（画布显示方块、详情面板显示勾圈就是这么来的），不是理论风险。

## 4. 领域所有权

| 领域 | 负责内容 | 关键边界 |
| --- | --- | --- |
| `app` | 应用级组合与页面切换 | `AppShell` 只编排，不承接领域算法 |
| `chat` | 消息、工具卡片、输入与运行参数 | 不持有项目树规则 |
| `conversations` | 项目/会话树、激活、草稿、持久化 | 任务摘要转换由调用方显式传入，不反向注册 |
| `tasks` | 任务部署、任务流事件分派和委派（`hooks/` 编排） | 运行态记录在 `core/task-runtime.js`，此处不留 `model/` |
| `workflow` | 工作流画布、运行详情与领域算法 | 目录/布局/尝试投影在 `core/`；运行页和设置编辑器共用 workflow 自己的画布组件 |
| `approvals` | 审批/问答 API、定位算法和卡片 | 审批存储 `core/approval-store.js`；静态 CSS；不使用全局请求函数 |
| `schedules` | 定时定义、时间规则、会话绑定和管理 | 通过 context 显式装配；执行复用 tasks runtime，不另建消息入口 |
| `settings` | 设置页与各类配置编辑器 | `SettingsPage` 不是导出中转站；provider 标记与头像用 `shared/` |

## 5. 模块职责

### 组件

- 文件使用 PascalCase，主导出与文件同名。
- 页面壳只负责组合；可独立测试的显示逻辑拆成领域组件。
- 不在 render 中注入 `<style>`，所有样式进入 `app-web/styles/`。
- 不通过 DOM 查询传递业务状态；DOM 查询只用于焦点、测量和 portal 定位。

### hooks 与流程工厂

- React 生命周期放 hooks；纯事件转换放 model。
- `create*Handlers(ctx)` 是显式依赖注入的流程模块，不得读取隐藏全局。
- 新增依赖时修改参数和调用点，不增加 `window`、模块级可变注册表或兼容桥。

### model

- 纯函数优先，输入输出可序列化。
- 不 import React，不操作 DOM，不发请求。
- 跨领域转换由组合层显式注入，禁止双方互相 import 后用初始化顺序“解环”。

### API

- `shared/api/client.js` 统一普通请求、header 和响应错误解析。
- 领域 API 只处理请求/响应，不修改 React 状态。
- 禁止 `window.apiFetch`、`fetch || apiFetch` 之类双路径。

## 6. 状态与并发

- 会话切换、任务取消、stream abort 必须带明确 owner（conversation/task id）和 abort controller。
- 服务端快照、本地草稿、运行中状态分别建模，不能靠一个“大对象”覆盖全部阶段。
- 跨领域运行态只有一处：任务运行记录 `core/task-runtime.js`、工作流目录 `core/workflow-catalog.js`、审批存储 `core/approval-store.js`。任何领域都不得为拿这些去 import 另一个领域。
- 状态词表只有一处：`core/run-status.js`（原始串别名归一、终态清单、`isTaskLive` / `isTaskSettled` / `terminalNoticeStatus` / `workflowTaskDisplayStatus`）。chat、conversations、tasks、workflow、approvals 都读它，谁都不 import 对方。
- 会话“还在不在跑”只有一处判据：`conversations/model/conversation-run-state.js`（任务自身未落终态 = 在跑；后端实时快照 `approvalStore` 有未决提问/审批 = 在等人；落地终态 = 熄灯）。侧边栏状态灯、面板 streaming、面板活动文案都读它。禁止在组件里重新推导运行态，也不准把 `workflowRun` 快照、在飞工具卡当状态源——那些是轮询旧值/渲染结果，会让两侧慢半拍而互相矛盾。
- 自动创建 Chat/Bot 会话时不发送 `title`（包括首发草稿落地、附件提前建会话、`/goal`、启动和删除后的空会话兜底）。占位标题由后端首任务路径持久化，前端可按显示需求在本地乐观显示 48 字符占位，但不能通过标题 PATCH 写回；标题 PATCH 只用于用户主动改名，哪怕改名文字与占位相同。生成结果复用现有会话目录刷新进入侧栏，不在前端另发模型请求。
- 循环执行和审批历史按 attempt 追加；旧 attempt 折叠展示，不覆盖历史输入输出。
- UI 自动滚动只在用户位于底部时跟随；用户主动向上浏览后不得抢焦点。
- workflow 与 agent 两种模式分别保存当前项目、会话、任务和选中节点。

## 7. 样式与资源

- `app-web/styles.css` 只作为静态样式入口，具体样式放 `app-web/styles/*.css`。
- 禁止运行时创建 style 标签、重复内联大段 CSS 或用 JS 字符串维护主题。
- 组件 class 保持领域前缀；共享组件使用稳定的语义 class。
- 图片和图标走构建期 import 或明确的静态资源路径。

## 8. 测试

生产源码和测试物理分离：

```text
app-web/src/**          # 只放生产代码
app-web/tests/**        # 所有 test/spec
```

测试文件按被测领域放置；跨领域行为进入 `integration`；静态架构与历史 bug 契约进入 `contracts`。禁止在生产目录旁放 `*.test.*` 或 `*.spec.*`。

依赖真实浏览器 DOM 的回归页放在 `app-web/tests/fixtures`，加载后自动执行断言并显示 `PASS` / `FAIL`，不调用模型或写入会话。运行 `npx vite --config vite.app-web.config.ts` 后，可访问 `/tests/fixtures/conversation-search.html`、`/tests/fixtures/message-annotations.html` 和 `/tests/fixtures/tool-cards.html`；修改相关 DOM 逻辑时需单独运行，`npm test` 不包含这些浏览器检查。临时演示页、手工造数和全局请求 mock 不作为长期测试保留，当前入口见 [回归测试说明](../app-web/tests/README.md)。

## 9. 自动门禁

| 命令 | 内容 |
| --- | --- |
| `npm run check:architecture` | 目录、依赖、循环、导入解析（剥离 `?inline` 等查询串）与具名导出存在性、`shared`/`core` 不得反向 import `features`、动态 CSS、全局请求等边界 |
| `npm test` | 运行 `app-web/tests` 中所有 `*.test.js` / `*.test.mjs` 自动测试 |
| `npm run lint` | 生产代码和测试代码 ESLint；warning 也会失败 |
| `npm run build:web` | Vite 生产构建 |
| `npm run check:web` | 依次执行以上四项 |

合并前必须运行 `npm run check:web`。新增架构规则时，先把规则写进 `scripts/check-app-web-architecture.mjs`，再更新本文。

移动或下沉模块时必须改完所有调用方：`eslint` 和 `npm test` 都不会报「导入了不存在的名字」，只有打包才炸。`check:architecture` 现在会核对每个具名 import 是否真的由目标模块导出，这类漏改在提交前就会失败。

当前硬门禁：

- `src` 根文件白名单；
- 禁止 feature 内通用 `lib/`；
- 禁止测试混入 `src`；
- 禁止 `index.js(x)` barrel；
- 单文件不超过 2000 行；
- 禁止运行时样式注入和全局请求函数；
- model React-free、不得依赖 components/hooks；
- 相对 import 必须可解析；
- `shared → features` 禁止、`core → features` 禁止；
- feature 之间不得双向依赖；
- 静态 import 不得成环。

## 10. 新增功能的标准路径

1. 先确定唯一领域；不要先建 `utils`、`common` 或 `misc`。
2. 纯规则放 `model`，请求放 `api`，生命周期放 `hooks`，显示放 `components`。
3. 只有两个以上领域都真正需要且没有业务语义的代码才进入 `shared`。
4. 直接迁移所有 import，不建立旧路径兼容层。
5. 测试放 `app-web/tests/features/<domain>` 或 `integration`。
6. 运行 `npm run check:web`。

## 11. 大文件规则

- 800 行是审查警戒线，不是机械拆分指标。
- 2000 行是自动门禁硬上限。
- `AppShell` 是组合根，可以比普通组件大，但任何新增逻辑必须优先进入所属领域；不得突破硬上限。
- 不允许通过“props 搬家”制造无职责的壳组件，也不为降低行数引入额外状态框架。

迁移历史和旧路径对照见 [`frontend-giant-file-refactor-plan.md`](./frontend-giant-file-refactor-plan.md)。
