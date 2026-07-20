# 前端大文件拆分与质量优化方案

> **状态：阶段 A–D 已落地；ConversationsPanel 叶子拆分已完成；AppShell ~2074 行（可选继续）**  
> **目标：** 在 **零功能变更** 前提下，按 [`frontend-architecture-and-conventions.md`](./frontend-architecture-and-conventions.md) 消解单文件巨石、修正命名/分层债。  
> **原则：** 行为保持、先叶子后壳、分批可回滚、每批 `build:web` + lint。

相关文档：

| 文档 | 用途 |
| --- | --- |
| [`frontend-architecture-and-conventions.md`](./frontend-architecture-and-conventions.md) | 强制架构与编码规范 |
| [`app-web/src/lib/README.md`](../app-web/src/lib/README.md) | 源码树与命名速查 |

---

## 1. 问题基线（2026-07 扫描）

规范软上限：**单源文件持续超过 ~1500 行应拆分**。

### 1.1 超标文件

| 文件 | 基线行数 | 本轮后 | 主要问题 / 结果 |
| --- | --- | --- | --- |
| `app-web/styles.css` | ~13500 | **入口 13 行** + `styles/*.css` | 按 section 物理拆分（class 名未改） |
| `app-web/src/features/app/AppShell.jsx` | **5717** | **~2074** | 已抽 12 个 `create*` factory；state/effect/JSX 仍集中 |
| `app-web/src/features/settings/SettingsPage.jsx` | **3779** | **~781** | 按域拆 editor / payload / ui |
| `app-web/src/panels/chatTimeline.jsx` | **2104** | Nodes / MessageRow / ChatPanel；兼容 barrel 已删 | 工具纯函数 + 节点 + panel 已拆 |
| `app-web/src/panels/ConversationsPanel.jsx` | **1192** | **~336 壳** + 叶子模块 | 图标/任务卡/节点/页脚/状态 helper 已拆 |

### 1.2 约定偏差

| 偏差 | 现状 | 目标 |
| --- | --- | --- |
| 组件文件命名 | 磁盘 `chatTimeline.jsx` / `format.jsx` / `shell.jsx` / `world.jsx` | PascalCase：`ChatTimeline.jsx` 等 |
| import 大小写 | barrel 写 PascalCase，依赖 macOS 大小写不敏感 | 磁盘名与 import 一致 |
| 分层例外 | `lib/chat-timeline.js` → panels 的 `normalizeToolName` | 下沉到 `lib/tool-names.js`，消除例外 |
| 跨层耦合 | `AppShell` 从 `SettingsPage.jsx` 拉 payload 工具 | 改为从 `settings-payload.js` 导入 |

### 1.3 明确不做

- 不改业务逻辑、流式并发、会话 abort / activation 语义
- 不引入新状态框架 / 不恢复 `window` 业务挂载
- 遗留 `src/renderer` 已删除（死代码清理）；勿恢复第二套 renderer 入口
- 不提交 `app-web/dist/`
- 不做全库 prettier 格式刷

---

## 2. 目标架构（落地后）

### 2.1 Settings（Phase A）

```
app-web/src/features/settings/
  SettingsPage.jsx              # 页面壳 + 列表/选中编排（目标 <900 行）
  settings-payload.js           # 纯 payload / JSON / 摘要（AppShell 可直接依赖）
  settings-ui.jsx               # FieldRow / SecretKey / MenuSelect / 图标等
  settings-list.js              # getLlmConfigItems / configItemsForSection 等列表辅助
  LlmConfigEditor.jsx
  AgentConfigEditor.jsx
  WorkflowConfigEditor.jsx      # 含 WorkflowFlowNode / canvas helpers
  ToolsConfigEditor.jsx
  MemoryConfigEditor.jsx
  KnowledgeConfigEditor.jsx
  GenericConfigEditor.jsx
  WorkflowFormControls.jsx      # WorkflowVariable* / SchemaList / OutputContract
  index.js                      # 可选 barrel：对外稳定 re-export
```

**兼容策略：**

- `SettingsPage.jsx`（或 `index.js`）继续 re-export 原有 `export` 符号，旧 import 路径短期可用。
- `AppShell` 优先改为从 `settings-payload.js` 引入 payload 工具。

### 2.2 ChatTimeline（Phase B）

```
app-web/src/lib/
  tool-names.js                 # normalizeToolName（叶子，无 React）
  tool-view.js                  # 可选：工具摘要/JSON 压缩等纯函数

app-web/src/panels/
  ChatTimelineNodes.jsx         # Tool / thinking / meta 节点
  ChatMessageRow.jsx            # 消息行 + 图片预览
  ChatPanel.jsx                 # 输入区 / 主面板
```

**兼容策略：**

- `panels.jsx` 继续导出 `ChatPanel`、`normalizeToolName`（后者 re-export from lib）。
- `lib/chat-timeline.js` 改为 `import { normalizeToolName } from './tool-names.js'`。

### 2.3 AppShell（Phase C，分批）

```
app-web/src/features/app/
  AppShell.jsx                  # 组装与 JSX 布局（当前 ~2074；目标 <2000 / <1500）
  hooks/
    createComposerHandlers.js
    createSettingsHandlers.js
    createConversationHandlers.js
    createConversationRuntime.js
    createConversationActivationHandlers.js
    createDraftConversationHandlers.js
    createWorldCalibrationHandlers.js
    createWorldRouteHelpers.js
    createScenePlaybackHelpers.js
    createScenePlayHandlers.js
    createTaskStreamHandlers.js
    createDeployHandlers.js
    # 后续可再演进为真正的 use* hooks（带依赖数组）
```

采用 **行为保持的 `create*(ctx)` factory** 抽出连续 handler 区间；跨 factory 依赖用 `*ApiRef` / late-bound 桥接，避免 TDZ。未一次搬完全部 state/effect/JSX。

### 2.4 命名与 CSS（Phase D）

| 磁盘现状 | 目标 |
| --- | --- |
| `panels/chatTimeline.jsx` | 已拆为 Nodes / MessageRow / ChatPanel（兼容 barrel 已删） |
| `panels/format.jsx` | `panels/Format.jsx` |
| `panels/shell.jsx` | `panels/Shell.jsx` |
| `world.jsx` | `World.jsx` |
| `app-web/styles.css` | 按 section 拆到 `styles/` 或 feature 级 CSS（后置） |

macOS 大小写不敏感：`git mv` 需 **两步改名**（中间名 → 目标名）。

---

## 3. 执行阶段与验收

### Phase A — Settings 按域拆分（优先）

| 步骤 | 动作 | 验收 |
| --- | --- | --- |
| A1 | 抽出 `settings-payload.js`（payload / parse / normalize 纯函数） | AppShell 可改 import；`build:web` 通过 |
| A2 | 抽出 `settings-ui.jsx` + `WorkflowFormControls.jsx` | Settings 页渲染不变 |
| A3 | 抽出各 `*ConfigEditor.jsx` + `settings-list.js` | 设置各 Tab 可打开/保存路径不变 |
| A4 | 瘦身 `SettingsPage.jsx` 为壳；必要时加 re-export | 行数 <900；对外 export 不丢 |

**Settings 内部依赖方向：**

```
SettingsPage  →  *ConfigEditor  →  settings-ui / WorkflowFormControls
      │                │
      └────────────────┴──► settings-payload / settings-list / lib/*
```

禁止 editor 反向依赖 `SettingsPage` 壳组件。

### Phase B — ChatTimeline 与分层债

| 步骤 | 动作 | 验收 |
| --- | --- | --- |
| B1 | `normalizeToolName` → `lib/tool-names.js`；更新所有引用 | 无 `lib → panels` |
| B2 | 工具纯函数迁 `lib/tool-view.js`（可选同 PR） | chat 时间线展示不变 |
| B3 | 拆 `ChatMessageRow` / Tool 节点 / `ChatPanel` | 主文件 <1200 行 |
| B4 | 磁盘改名为 `ChatTimeline.jsx`（两步 git mv） | import 与磁盘一致 |

### Phase C — AppShell hooks（分批）

建议顺序（耦合从低到高）：

1. `useChatComposer` — 附件/图片/路径选择  
2. `useSettingsDrafts` — 设置草稿保存与测试连接（依赖 Phase A payload）  
3. `useWorkspaceConversations` — 会话/项目 CRUD、pin、reorder  
4. `useWorldScene` — 走路/pose/calibration/场景队列  
5. `useTaskStream` — NDJSON / world event / executeQuest / stop（**最高风险，最后**）

**每批验收：**

- 仅结构移动，不改控制流与依赖数组语义  
- `npm run build:web` 成功  
- 主路径手测：登录 → 会话列表 → 发消息/停任务 → 设置保存（按批次相关项）

### Phase D — 命名修正 + CSS

- 统一 PascalCase 组件文件名  
- `styles.css` 按已有 section 注释拆分（Auth / Chat / Settings / Panels / World…）  
- 更新 `app-web/src/lib/README.md` 与架构文档规模基线

---

## 4. 实施规则（强制）

1. **行为保持：** 只移动代码与调整 import；不改算法、默认值、请求字段、事件时序。  
2. **先叶子后壳：** 纯函数 / UI 原语 → 编辑器 → 页面壳 → AppShell hooks。  
3. **稳定导出：** 对外符号优先 re-export，避免一次性打碎所有调用方。  
4. **依赖单向：** 遵守 `features → panels → lib/api`；禁止新的 `lib → panels`。  
5. **小步提交语义：** 每个 Phase（或 AppShell 每个 hook）应可独立 review / 回滚。  
6. **验证：** 每批至少 `npm run build:web`；有触达文件时跑 `npm run lint`。  
7. **命名：** 新文件遵守 PascalCase 组件 / kebab-case 纯逻辑。  
8. **禁止：** 借重构改产品行为、加框架层、恢复 Babel-in-browser / `window` 业务全局。

---

## 5. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| macOS 大小写改名失败 | 两步 `git mv`；改完立即 build |
| 循环依赖 | 先抽纯函数到 lib/payload；editor 不 import 页面壳 |
| AppShell 闭包/stale state | hooks 抽出时保持原 `useCallback` 依赖；高风险域最后做 |
| re-export 遗漏 | 拆完用导出符号清单 diff；AppShell/Settings 引用全量搜索 |
| CSS 选择器耦合 | Phase D 只物理拆分，不改 class 名 |

回滚：按 checkpoint / git 回退对应 Phase；不混入功能改动。

---

## 6. 进度跟踪

| Phase | 状态 | 说明 |
| --- | --- | --- |
| 方案文档 | **done** | 本文 |
| A1 settings-payload | **done** | `settings-payload.js`；AppShell 已改 import |
| A2 settings-ui / workflow controls | **done** | `settings-ui.jsx` / `WorkflowFormControls.jsx` |
| A3 editors + list helpers | **done** | 各 `*ConfigEditor.jsx` |
| A4 SettingsPage 瘦身 | **done** | `SettingsPage.jsx` ~781 行（原 ~3779） |
| B1 normalizeToolName 下沉 | **done** | `lib/tool-names.js`；消除 `lib→panels` |
| B2–B4 ChatTimeline 拆分/命名 | **done** | `tool-view.js` / Nodes / MessageRow / ChatPanel；兼容 barrel 已删 |
| C AppShell handler factories | **done（首批）** | 初批 5 个 factory；壳 ~4178 |
| C2 stream / scene / deploy | **done** | `createScenePlayHandlers` / `createConversationRuntime` / `createTaskStreamHandlers` / `createDeployHandlers` |
| C3 activation / draft / route | **done** | `createConversationActivationHandlers` / `createDraftConversationHandlers` / `createWorldRouteHelpers`；壳 **~2074** |
| D 命名 + CSS | **done** | PascalCase：`Format/Shell/ChatTimeline/World`；`styles.css` 入口 + `styles/*.css`；CSS 相对资源路径已修为 `../assets/...` |
| 硬刷新首屏 | **done（缓解）** | Electron 窗口背景 `#05060b`；`index.html` 关键深色 first-paint |
| 验证 | **done（当前）** | `npm run build:web` 通过；`npm run lint` **0 errors**（~287 warnings 基线） |

**后续可选：** 再压 AppShell state/late effects/JSX 到 <2000 / <1500；factory → 真 `use*` hooks；`ConversationsPanel` 拆分；清理临时 `scripts/extract_appshell_*.py` / scan 脚本。

---

## 7. 给 Reviewer 的检查清单

- [ ] diff 是否 **仅结构移动**（无业务条件/文案/API 字段变化）  
- [ ] 依赖方向是否仍向下  
- [ ] `normalizeToolName` 是否已离开 panels（Phase B 后）  
- [ ] 大文件行数是否下降到阶段目标  
- [ ] `build:web` / lint 是否通过  
- [ ] 是否误提交 `dist` / 备份文件  

---

**一句话：**  
Settings / ChatTimeline / 分层债 / 命名与 CSS 已落地；AppShell 已从 ~5717 压到 ~2074（12 个 factory）。任何一步若需要改行为，应拆成独立功能 PR，不得混进本方案。
