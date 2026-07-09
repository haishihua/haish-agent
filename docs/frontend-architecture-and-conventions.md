# Haish 前端架构与编码规范

> **状态：强制规范**  
> 本文档描述 **2025–2026 前端重构之后** 的目标架构，以及后续开发 **必须遵守** 的约定。  
> 目的：避免再次退化成「单文件巨石 + 全局 `window` + 浏览器里 Babel 编译」的形态。

相关文档：

| 文档 | 用途 |
| --- | --- |
| [`README.md`](../README.md) | 仓库总览、如何跑起来 |
| [`docs/local-agent-runtime-architecture.md`](./local-agent-runtime-architecture.md) | Electron ↔ 本地 Python runtime |
| [`app-web/src/lib/README.md`](../app-web/src/lib/README.md) | 源码树与命名速查 |

**维护约定：** 架构或强制规范变更时，**同一 PR 必须同步更新本文档**，避免文档与代码再次分叉。

---

## 1. 系统全景

Haish 桌面端 = **Electron 壳 + Vite 打包的 React UI + 本地 Python runtime**。

```
┌─────────────────────────────────────────────────────────────┐
│  Electron main (src/main/*.ts)                              │
│  - 启动本地 Python runtime                                  │
│  - 注册 haish:// 协议                                       │
│  - 代理 /api/* → runtime                                    │
│  - 加载 UI：app-web/dist/index.html                         │
├─────────────────────────────────────────────────────────────┤
│  preload (src/preload) → window.haish                       │
├─────────────────────────────────────────────────────────────┤
│  Renderer: app-web (Vite 生产构建)                          │
│  - React 19 + ESM                                           │
│  - 产物目录 app-web/dist                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    haish-agent-core (Python)
```

### 1.1 职责边界

| 层级 | 路径 | 职责 | 禁止 |
| --- | --- | --- | --- |
| Electron main | `src/main/` | 进程生命周期、协议、runtime 代理、原生对话框 | 业务 UI 逻辑 |
| preload | `src/preload/` | 白名单 IPC / `window.haish` | 任意 Node 能力下沉到页面 |
| UI 源码 | `app-web/src/` | 全部产品界面与前端状态 | 直接 `require('fs')`、挂业务到 `window` |
| UI 产物 | `app-web/dist/` | Vite 构建输出，运行时加载 | 手改 dist、提交 dist（已 gitignore） |
| 遗留原型 | `src/renderer/` | **不参与** 正式桌面 UI | 勿把新功能写在这里 |

### 1.2 构建与运行（强制）

| 命令 | 作用 |
| --- | --- |
| `npm run build:web` | Vite 生产构建 → `app-web/dist` |
| `npm run dev:web` | Vite watch 重建 dist |
| `npm run dev` | 先 `build:web`，再编译 Electron 并启动；web watch 并行 |
| `npm run typecheck` | TS 检查（Electron / shared） |
| `npm run lint` | ESLint（`app-web/src` 等） |

**硬性规则：**

1. 正式 UI **只**来自 `app-web`，经 **Vite** 构建；禁止恢复 CDN React + `@babel/standalone` 运行时编译。
2. Electron 通过 `haish://app/...` 加载 **`app-web/dist`**（见 `src/main/main.ts` 的 `webRoot`）。
3. 改 UI 后必须重建（或依赖 `dev:web` watch），并刷新窗口（Cmd+R）。
4. **不要提交** `app-web/dist/`、一次性迁移脚本、备份目录（见 `.gitignore`）。
5. 构建入口：`vite.app-web.config.ts`；HTML 入口 `app-web/index.html`；JS 入口 `app-web/src/main.jsx`。

---

## 2. 重构后的前端架构

### 2.1 目录总览

```
app-web/
  index.html                 # Vite HTML 入口
  styles.css                 # 全局样式（仍待按 feature 继续拆）
  assets/                    # 静态资源（运行时按路径访问，构建时拷贝进 dist）
  agent-world/               # 世界地图等静态资源
  src/
    main.jsx                 # Vite JS 入口：styles + app + approval
    app.jsx                  # 挂载 AuthGate + ErrorBoundary；暴露 window.authFetch
    approval-overlay.jsx     # 审批气泡副作用挂载（非路由页）
    panels.jsx               # panels/* 的 barrel 再导出（兼容旧 import 路径）
    Effects.jsx              # 世界特效
    Sprites.jsx              # 精灵渲染
    World.jsx                # 世界画布
    orchestrator.js          # 世界编排辅助
    api/                     # 网络与会话
    features/                # 业务壳：登录、主界面、设置
    panels/                  # 可复用 UI 积木
    lib/                     # 纯逻辑 / 状态工具（无 React 或极少）
```

### 2.2 分层与依赖方向（强制）

依赖 **只能向下**，禁止反向与环：

```
features/*  ──►  panels/*  ──►  api/* , lib/*
     │                │
     └────────────────┴──►  Effects / Sprites / World / orchestrator
```

| 层 | 可以依赖 | 不可以依赖 |
| --- | --- | --- |
| `features/` | panels, api, lib, 世界/特效模块 | 无更上层 |
| `panels/` | api, lib, 少量兄弟 panels（需克制）, Effects/Sprites | `features/` |
| `lib/` | 其他 **叶子** lib、`api`（慎用） | `features/`、`panels/`（**唯一例外见下**） |
| `api/` | 浏览器 API、`api/base` | features / panels / 重业务 lib |

**已知例外（历史债，勿扩大）：**

- `lib/chat-timeline.js` 目前 import `panels/ChatTimeline.jsx` 的 `normalizeToolName`。  
  新代码 **禁止** 再让 `lib` 依赖 `panels`。  
  后续应把 `normalizeToolName` 下沉到 `lib/chat-text.js` 或 `lib/tool-names.js`。

### 2.3 模块职责

#### `api/`

| 文件 | 职责 |
| --- | --- |
| `base.js` | `resolveApiBase` / `API_BASE` |
| `auth.js` | 登录会话、token、`authFetch`、storage key 常量 |

规则：

- 所有需鉴权的 HTTP **走 `authFetch`**，不要散落手写 `fetch` + header。
- 审批 overlay 若无法 import 会话模块，可继续使用 `window.authFetch`（由 `app.jsx` 挂载）；**新代码优先 ESM import**。

#### `features/`

| 路径 | 职责 | 规模基线（约，2026-07） |
| --- | --- | --- |
| `auth/AuthGate.jsx` | 会话门闸：未登录 → AuthScreen，已登录 → AppShell | ~100 行 |
| `auth/AuthScreen.jsx` | 登录 / 注册 UI | ~370 行 |
| `app/AppShell.jsx` | 主壳：会话树、聊天/世界视图、runtime 编排、校准等 | **~4800 行（仍过大）** |
| `settings/SettingsPage.jsx` | 设置页与各配置编辑器 | **~2900 行（仍过大）** |

规则：

- **页面级状态与用例编排**放 features，不要塞进 `panels`。
- 新页面优先 `features/<domain>/`，不要继续堆进 `AppShell.jsx`。
- `AppShell` / `SettingsPage` 已经偏大；新增能力优先 **抽 hook / 子模块**，而不是继续加千行。
- **软上限建议：** 单文件持续增长时，超过 **~1500 行** 应在同一功能 PR 或紧随其后的 PR 中拆出子模块；禁止无计划地堆到万行级。

#### `panels/`

可复用、可组合的 UI 单元（列表、输入条、时间线节点、地图视口等）。

| 文件 | 职责 |
| --- | --- |
| `PortalTooltip.jsx` | Portal 提示（`createPortal` from `react-dom`） |
| `ConversationsPanel.jsx` | 项目/会话树 |
| `ChatTimeline.jsx` | 聊天面板与时间线（含 `ChatPanel`、`normalizeToolName`） |
| `TaskDelegation.jsx` | 世界模式底部委派输入 |
| `TaskRecords.jsx` | 任务记录与筛选 |
| `LiveFeedPanel.jsx` | 实时 feed |
| `ModelPickers.jsx` | 模型 / 审批模式选择器 |
| `Shell.jsx` | BottomNav / MapViewport / TabPlaceholder |
| `TopBar.jsx` | 顶栏 |
| `Format.jsx` | 时间格式、附件 chip 等展示碎片 |
| `path-utils.jsx` | 路径粘贴、run config 持久化 hooks |
| `shared-constants.jsx` | 跨 panel 共享常量（模型列表、图标等） |

规则：

- panel **不**直接持有「全局会话 store」；通过 props / 明确的 hooks 接收数据。
- 跨 panel 共享常量放 `shared-constants.jsx`，禁止再复制一份 `MODEL_OPTIONS`。
- 跨 panel 共享组件/hooks 必须 **export + import**，禁止「碰巧同文件所以能用」。
- 新代码优先 `from './panels/Foo.jsx'`；`panels.jsx` barrel 仅作兼容，勿继续加重依赖图。

#### `lib/`

纯函数与可单测逻辑：

| 文件 | 职责 |
| --- | --- |
| `chat-text.js` | **叶子**：文本/delta 工具（`stripChatImageAugmentation`、`eventDeltaText`） |
| `chat-timeline.js` | 聊天时间线聚合 |
| `workspace-state.js` | 本地工作区树状态；`registerTaskSummaryMapper` |
| `task-runtime.js` | 任务 runtime 结构与 live 快照；初始化后注册 mapper |
| `world-events.js` | 世界事件归一化与路由表 |
| `world-runtime.js` | 地图/pose 等常量 |
| `agent-catalog.js` / `workflow-catalog.js` | Agent / Workflow 默认值与 normalize |
| `context-usage.js` | 上下文用量计算 |
| `calibration-utils.js` | 校准相关纯函数 |
| `ErrorBoundary.jsx` | 顶层错误边界 |

规则：

- **叶子模块**（如 `chat-text.js`）不得依赖其他业务 lib。
- **禁止** `lib` 模块之间形成环。  
  当前约定：`task-runtime` → `workspace-state` **单向**依赖；  
  任务摘要映射通过 `registerTaskSummaryMapper()` 在 `task-runtime` 初始化后注册，**禁止** `workspace-state` 再 import `task-runtime`。
- 会被多处使用的纯函数，优先放进合适的 lib 叶子，而不是复制进 UI 文件。

### 2.4 运行时数据流（简化）

```
用户操作 (panels)
    │
    ▼
features (AppShell / AuthGate / Settings)
    │  authFetch / API_BASE
    ▼
Python runtime  ←── Electron 代理 haish://app/api/*
    │
    ▼  stream / REST
features 更新 workspace / task / chat state (lib helpers)
    │
    ▼
panels 展示 (Conversations / Chat / LiveFeed / World)
```

流式任务、会话切换 abort、activation seq 等并发控制应继续留在 **features 编排层**，不要散落到无状态 panel。

### 2.5 启动链路

```
main.jsx
  ├─ import styles.css + @xyflow/react styles
  ├─ import app.jsx
  │    ├─ window.authFetch = authFetch
  │    └─ ReactDOM.createRoot → ErrorBoundary → AuthGate
  │         ├─ 未登录 → AuthScreen
  │         └─ 已登录 → AppShell (+ 内嵌 panels / World / Settings)
  └─ import approval-overlay.jsx   # 独立副作用挂载，读 window.authFetch
```

### 2.6 与旧架构对照（禁止倒退）

| 旧做法 | 新做法 | 状态 |
| --- | --- | --- |
| CDN React + Babel-in-browser | Vite ESM 生产构建 | **禁止回退** |
| `window.ChatPanel = ...` | ESM `export` / `import` | **禁止新增 window 业务挂载** |
| 单文件 `app.jsx` 1 万+ 行 | features + panels + lib | 禁止再合并回单文件 |
| 手写 `?v=131` 缓存破坏 | 构建 hash | 禁止再手写版本号当方案 |
| `src/renderer` 当产品 UI | 仅 `app-web` | 禁止双入口并行开发 |

**允许的 `window` 使用：**

- `window.haish`（preload）
- `window.authFetch`（兼容 approval-overlay 的历史查找）
- `window.localStorage` / 浏览器 API
- 自定义事件如 `haish-auth-expired`

---

## 3. 编码规范（强制）

### 3.1 命名

| 类型 | 规则 | 示例 |
| --- | --- | --- |
| 入口 / bootstrap | 小写 | `main.jsx`, `app.jsx` |
| React 组件文件 | **PascalCase**，与主组件同名 | `AppShell.jsx`, `PortalTooltip.jsx` |
| 副作用挂载脚本 | kebab-case | `approval-overlay.jsx` |
| 纯逻辑 / utils | kebab-case | `path-utils.jsx`, `agent-catalog.js` |
| 目录 | 小写 | `features/auth/` |
| React 组件 | PascalCase | `function ChatPanel` |
| hooks | `use` 前缀 camelCase | `usePanelWidth`, `usePersistentRunConfig` |
| 常量 | UPPER_SNAKE 或清晰 camel | `API_BASE`, `DEFAULT_REASONING_EFFORT` |

**禁止：**

- 同目录仅大小写不同的两个文件名（macOS 默认大小写不敏感，git 索引会乱）。
- 组件文件用 `chatTimeline.jsx` 这种小写驼峰（应 `ChatTimeline.jsx`）。
- 工具文件用 `pathUtils.jsx` 与 `path-utils.jsx` 混用；统一 **kebab-case**。
- 把组件文件命名为 `App.jsx` 再改成 `AppShell.jsx` 时，在 macOS 上必须 **两步 `git mv`**（经临时名），否则磁盘上可能仍是旧大小写。

### 3.2 模块边界与 import

1. **显式 import / export**  
   凡跨文件使用的函数、组件、常量必须 export，并在使用方 import。  
   「以前在同一文件所以能直接用」在拆分后 **一律视为 bug**。

2. **禁止新增业务全局**  
   不要 `window.XXX = Component`。测试/调试需要时用模块 import。

3. **共享常量集中**  
   模型列表、图标 map、推理档位等放 `panels/shared-constants.jsx` 或对应 lib，禁止复制粘贴。

4. **叶子优先**  
   两处以上使用的纯函数，抽到无 React 依赖的 lib 叶子（参考 `chat-text.js`），避免 `A → B → A`。

5. **barrel 克制**  
   `panels.jsx` 仅作兼容再导出。新代码可直接 `from './panels/Foo.jsx'`，避免 barrel 循环与过重依赖图。

6. **React API 来源**  
   - `createRoot` → `react-dom/client`  
   - `createPortal` → `react-dom`（**不是** `react-dom/client`）

### 3.3 React / UI

1. 使用 React 19 + 函数组件 + hooks；不要引入第二套 UI 运行时。
2. 列表 key 稳定；流式列表注意性能（后续可 memo，但勿过早大改）。
3. 顶层保留 `ErrorBoundary`；业务错误用 toast / 面板提示，避免静默失败。
4. 样式：继续使用现有 `styles.css` 与 CSS 变量；新增样式优先复用 token，避免魔法色值扩散。大块新 UI 建议按 BEM 或 feature 前缀组织选择器，便于日后拆 CSS。

### 3.4 异步与并发

1. 会话切换必须可取消（`AbortController` / activation seq），禁止旧请求写回新会话。
2. 流式事件批处理保持现有节奏（如 `STREAM_EVENT_BATCH_MS`），改动需说明原因。
3. `authFetch` 统一处理 401 refresh；不要绕过。

### 3.5 安全

1. Renderer 保持 `contextIsolation: true`、`nodeIntegration: false`。
2. 不在前端存储明文长期密钥；遵循现有 session 存储策略。
3. `dangerouslySetInnerHTML` 仅用于已转义/可信高亮路径；新增必须审计 XSS。

### 3.6 工程检查清单（PR 自检）

提交 UI 相关改动前确认：

- [ ] `npm run build:web` 通过  
- [ ] `npm run typecheck` 通过（若动了 Electron/TS）  
- [ ] `npm run lint` 无新增 error  
- [ ] 未引入 `window.业务挂载`、未恢复 Babel 浏览器编译  
- [ ] 新文件命名符合 §3.1  
- [ ] 无新的 `lib` 循环依赖  
- [ ] 跨文件符号均有 import（不要假设「同层可见」）  
- [ ] 未把产品逻辑写进 `src/renderer`  
- [ ] 未提交 `app-web/dist` / 临时脚本  
- [ ] 若改了分层/规范，已更新本文档  

建议主路径手测：登录 → 会话列表 → 发消息/停止 → 设置页打开。

---

## 4. 重构踩坑清单（禁止重蹈）

以下问题在拆分过程中真实出现过。**新代码与后续拆分必须主动规避：**

| 症状 | 根因 | 正确做法 |
| --- | --- | --- |
| `createPortal is not a function` | 从 `react-dom/client` 导入 portal | `import { createPortal } from 'react-dom'` |
| `X is not defined` 白屏 | 拆文件后忘了 import 常量/函数 | 拆完立刻 `build:web` + 静态搜引用；禁止「先拆完再统一修」拖很久 |
| 常量在 A 文件用、定义在 B 文件 | 共享常量没落盘 | 放入 `shared-constants.jsx` 或合适 lib 并 export |
| 循环依赖导致 undefined | `task-runtime` ↔ `workspace-state` 互 import | 单向依赖 + `registerTaskSummaryMapper` 注册 |
| 同名不同大小写 | macOS 不敏感 + git 敏感 | 临时名两步 `git mv`；禁止仅大小写改名一步到位 |
| `eventDeltaText is not defined` | 纯函数留在大文件、使用方未 import | 抽到 `lib/chat-text.js` 叶子并两边 import |
| 误改 `src/renderer` | 以为那里是产品 UI | 产品只在 `app-web` |
| 提交 dist / 迁移脚本 | 临时产物当修复 | 只提交源码；产物由 CI/本地 build 生成 |

**拆大文件作业流程（强制习惯）：**

1. 明确边界：UI 积木 → `panels/`，编排 → `features/`，纯函数 → `lib/`。  
2. 先抽出 **叶子**（无反向依赖的常量/纯函数），再抽组件。  
3. 每拆一批就 `npm run build:web`，不要攒到最后一次爆雷。  
4. 对导出符号做 ripgrep：定义处与引用处是否都有 import。  
5. 发现环依赖时：**上提第三模块** 或 **注册函数**，禁止硬互引。

---

## 5. 扩展指南（如何加功能而不腐化）

### 5.1 新增一个 UI 区块

| 类型 | 落点 |
| --- | --- |
| 可复用控件 | `panels/YourWidget.jsx`（PascalCase） |
| 页面 / 用例编排 | `features/<domain>/...` |
| 纯转换 / normalize | `lib/<name>.js` |
| HTTP | `api/auth.js` 的 `authFetch`（可扩展 `api/*.js` 但保持薄） |
| 兼容旧 barrel | 仅当外部仍依赖旧路径时，在 `panels.jsx` 增加 re-export |

### 5.2 拆大文件时的硬规则

1. **先**保证构建与主路径可用，再做美化。  
2. 拆出后立刻修 import；用静态扫描或构建，而不是只靠手点。  
3. 共享常量/小纯函数优先落到 **叶子模块**，再被两边引用。  
4. 禁止制造 `A import B && B import A`；若历史代码需要互操作，用注册函数（如 `registerTaskSummaryMapper`）或上提第三模块。  
5. macOS 重命名大小写：用临时文件名两步 `git mv`，避免索引错乱。  
6. 不要把「拆文件」和「改行为」混在同一大 diff 里；行为变更应可单独 review。

### 5.3 明确不要做的事

- 不要把 `AppShell.jsx` 再堆回 1 万行「因为方便」。  
- 不要为了省事把逻辑挂到 `window`。  
- 不要在 `app-web` 外再开一套平行 React 应用当产品 UI。  
- 不要提交构建产物充当「修复」。  
- 不要引入 CDN 脚本或运行时 Babel 作为「快速验证」捷径并合并进主干。  
- 不要新增 `lib → panels` 依赖。

### 5.4 推荐的后续拆分方向（还债优先级）

1. `AppShell.jsx` → `useTaskStream` / `useWorkspace` / `useCalibration` 等 hooks + 子视图组件。  
2. `SettingsPage.jsx` → 按 LLM / Tools / Agent / Workflow 分文件。  
3. `ChatTimeline.jsx` → 消息节点 / 输入区 / 工具卡拆分。  
4. `normalizeToolName` 下沉到 `lib`，去掉 `lib → panels` 例外。  
5. `styles.css` 按 feature 前缀拆分。  
6. 为 `lib/*` 纯函数补 Vitest 单测作为门禁基础。

---

## 6. 已知技术债（允许存在，但需定向还）

| 债 | 说明 | 还债方向 |
| --- | --- | --- |
| `AppShell.jsx` 仍很大 | 主壳编排集中 ~4.8k 行 | 抽 hooks / 子模块 |
| `SettingsPage.jsx` 仍很大 | 编辑器合集 ~2.9k 行 | 按配置域拆文件 |
| `ChatTimeline.jsx` 仍偏大 | ~2k 行 | 拆消息节点与输入区 |
| `styles.css` 单体 | 数千行 | 按 feature 拆 CSS |
| `lib → panels` 例外 | `normalizeToolName` | 下沉到 lib |
| `src/renderer` 遗留 | 非产品路径 | 文档标明或删除 |
| 前端测试不足 | 无 UT/E2E 门禁 | 先为 lib 纯函数补测 |
| `approval-overlay` 依赖 `window.authFetch` | 历史挂载 | 逐步改为 ESM import |

还债时仍须遵守本文 §2–§4，不得借还债之名引入双构建链或 `window` 业务全局。

---

## 7. 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-07 | 初版：Vite 化、ESM 模块化、features/panels/lib 分层、命名与依赖规范落地 |
| 2026-07 | 增强：规模基线、启动链路、重构踩坑清单、文件体量软上限、还债优先级 |

---

**给 Reviewer 的一句话：**  
若 PR 让依赖图倒流、恢复全局挂载、或把产品逻辑写回单文件巨石 / `src/renderer`，应 **直接打回**，而不是「先合并再还」。
