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
    features/
      agents/model/          # Agent 配置领域模型
      app/                   # 应用组合根、顶栏和主布局
      approvals/             # 审批 API、状态和 UI
      chat/                  # 对话时间线、输入框、流式消息模型
      conversations/         # 项目/会话树、持久化和激活流程
      settings/              # 设置页面、编辑器和设置模型
      tasks/                 # 任务部署、任务流和委派 UI
      workflow/              # 工作流模型、画布和运行详情
    shared/
      api/                   # API base、普通请求与通用 header
      lib/                   # 无业务归属的纯工具
      ui/                    # 无业务归属的展示组件
  tests/
    contracts/               # 静态契约和边界回归
    features/<domain>/       # 领域单测
    integration/             # 跨模块集成测试
  styles/                    # 静态 CSS 分片
```

`src` 根目录只允许 `main.jsx` 和 `app.jsx`。不存在 `src/api`、`src/lib`、`src/panels` 或聚合 barrel。

## 3. 依赖方向

```text
main.jsx → app.jsx → features/* → shared/*
                         │
                         ├─ components → hooks / model / api
                         ├─ hooks      → model / api
                         └─ model      → model / shared（不得依赖 React）
```

强制规则：

1. `shared` 不得 import `features`。
2. `model` 不得 import React、组件或 hooks。
3. 组件可以组合其他 feature 的公开组件，但不能从对方页面壳或内部编辑器“借”实现。可复用原语应下沉到 `shared/ui`；明确属于一个领域的组件留在该领域。
4. 网络调用放在领域 `api/` 或 `shared/api/`；普通请求直接 import `apiFetch`。
5. 禁止静态 import 环、注册回调式破环、late-bound 全局和隐式初始化副作用。
6. 禁止为了旧路径保留 re-export、barrel、兼容文件或双份实现。迁移时一次修改全部调用方并删除旧文件。

## 4. 领域所有权

| 领域 | 负责内容 | 关键边界 |
| --- | --- | --- |
| `app` | 应用级组合与页面切换 | `AppShell` 只编排，不承接领域算法 |
| `chat` | 消息、工具卡片、输入与运行参数 | 不持有项目树规则 |
| `conversations` | 项目/会话树、激活、草稿、持久化 | 任务摘要转换由调用方显式传入，不反向注册 |
| `tasks` | 任务 runtime、stream、部署和委派 | 不把 UI 状态写入通用 shared |
| `workflow` | 工作流 schema、布局、节点 UI、运行详情 | 运行页和设置编辑器共用 workflow 自己的画布组件 |
| `approvals` | 审批/问答 API、状态和卡片 | 静态 CSS；不使用全局请求函数 |
| `settings` | 设置页与各类配置编辑器 | `SettingsPage` 不是导出中转站 |
| `agents` | Agent 配置与纯模型 | 不依赖 settings UI |

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

## 9. 自动门禁

| 命令 | 内容 |
| --- | --- |
| `npm run check:architecture` | 目录、依赖、循环、导入解析、动态 CSS、全局请求等边界 |
| `npm test` | 运行 `app-web/tests` 全部测试 |
| `npm run lint` | 生产代码和测试代码 ESLint；warning 也会失败 |
| `npm run build:web` | Vite 生产构建 |
| `npm run check:web` | 依次执行以上四项 |

合并前必须运行 `npm run check:web`。新增架构规则时，先把规则写进 `scripts/check-app-web-architecture.mjs`，再更新本文。

当前硬门禁：

- `src` 根文件白名单；
- 禁止 feature 内通用 `lib/`；
- 禁止测试混入 `src`；
- 禁止 `index.js(x)` barrel；
- 单文件不超过 2000 行；
- 禁止运行时样式注入和全局请求函数；
- model React-free、不得依赖 components/hooks；
- 相对 import 必须可解析；
- `shared → features` 禁止；
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
