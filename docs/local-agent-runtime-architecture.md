# Haish 本地 Agent Runtime 架构设计

> 状态：v1 方案设计
>
> 目标客户端：`/Users/zhanruitao/front-end-project/Haish-agent`
>
> 目标本地 runtime：`/Users/zhanruitao/py-project/haishihua-agent-core`
>
> 设计结论：Haish 桌面端应从“云端 agent runtime + 本地 workspace bridge”迁移为“客户端托管本地 agent runtime + 云端模型网关/同步服务”。第一阶段主要改造 `Haish-agent`，`haishihua-agent-core` 复用现有本地 workspace/tool/app 能力，只做 sidecar 启动、配置和少量 API 适配。

## 1. 背景

当前 Haish 的客户端负责选择本地目录，云端服务负责保存会话、运行 agent，并通过 WebSocket bridge 请求客户端代读文件、代跑终端。

这个形态可以工作，但对“本地项目 agent”来说有天然错位：

- 用户选择的是本机目录，但 agent runtime 在云端。
- 服务端没有真实文件系统，只能理解一个 `desktop:<project_id>` 虚拟工作区。
- 绝对路径、相对路径、授权 root、bridge 状态必须在客户端和服务端之间保持一致。
- prompt、工具 schema、会话 workspace mode 一旦没有同步，就会出现“明明已选工作区，agent 却说没选”的问题。
- bridge 断开后，云端任务会继续保留，但工具能力实际上已经不可用。

因此，本方案不是重写 `haishihua-agent-core`，而是恢复它原本更擅长的本地 runtime 形态：客户端启动一个本机 sidecar，UI 直接请求本机 runtime，本机 runtime 直接使用真实 workspace tools。云端只保留模型网关、账号、配置、计费和可选同步。

## 1.1 设计修订

经过进一步讨论，本方案按以下判断收敛：

- `haishihua-agent-core` 原有 `ReadFileTool(workspace)`、`ListDirTool(workspace)`、`SearchTextTool(workspace)`、`TerminalTool(workspace)` 等逻辑本来就是本地 workspace 模型，不需要大改。
- 当前复杂度主要来自客户端为了适配云端 agent runtime 而引入的 `desktop:<project_id>`、workspace bridge、Remote tools 和桥接会话语义。
- 新主线应让 `Haish-agent` 成为本地 runtime host：启动 Python runtime、代理本地 API、管理本地项目授权和进程生命周期。
- runtime 侧只需要提供更稳定的 sidecar 启动入口、健康检查、配置注入和必要的模型网关配置，不作为第一阶段大规模重构目标。

## 2. 目标

### 2.1 用户目标

- 用户在 Haish App 中选择本地目录后，agent 能直接理解这个目录就是当前工作区。
- 用户输入 `/Users/...` 绝对路径时，只要路径存在且在授权范围内，agent 可以直接访问。
- 跨项目任务可以通过授权更上层目录实现，不再被 bridge 语义误伤。
- 文件读取、搜索、终端、git、测试等本地项目操作稳定可用。
- App 重启后可以恢复本地会话、项目列表和任务历史。

### 2.2 工程目标

- `Haish-agent` 作为桌面客户端和 runtime host，负责 UI、窗口、项目授权、runtime 进程生命周期、本地 API 代理。
- `haishihua-agent-core` 作为本地 agent runtime，复用已有 app/agent/tool 能力，负责会话、agent loop、工具、模型调用、事件流。
- 本地工具直接访问本机文件系统，不再通过云端 bridge 转发。
- 云端服务收敛为 control plane 和 model gateway，不参与本地文件工具执行。
- 迁移过程以客户端改造为主，先跑通本地 runtime host，再逐步移除 workspace bridge。

## 3. 非目标

本阶段不做以下事情：

- 不要求完全离线运行。LLM 推理仍可走云端模型 API。
- 不要求立即删除云端服务。云端仍保留模型代理、配置和可选同步。
- 不要求马上支持 Windows/Linux。第一阶段按 macOS 桌面 App 落地。
- 不重写 `haishihua-agent-core` 的 agent 框架，也不重写已有 workspace tool 逻辑。
- 不在第一阶段新增一套全新的本地 API，如果现有 Agent World API 能复用，应优先复用。
- 不在第一阶段实现多人协同或云端长任务托管。

## 4. 目标架构

```text
Haish.app
  ├─ Electron Main
  │   ├─ project authorization
  │   ├─ local runtime process manager
  │   ├─ local API proxy
  │   └─ app update / logs / crash recovery
  │
  ├─ React Renderer
  │   ├─ Agent World UI
  │   ├─ project/conversation/task panels
  │   ├─ stream event rendering
  │   └─ model/settings UI
  │
  └─ Local Agent Runtime
      ├─ haishihua-agent-core
      ├─ local conversation store
      ├─ local fs/search/terminal/git tools
      ├─ local skill/mcp integration
      └─ model gateway client

Cloud
  ├─ auth
  ├─ model gateway
  ├─ model catalog / policy config
  ├─ usage / quota / billing
  └─ optional conversation sync
```

核心变化：

```text
旧形态：
Renderer -> Electron -> Cloud Agent Runtime -> Workspace Bridge -> Electron -> Local FS

新形态：
Renderer -> Electron -> Local Agent Runtime -> Local FS
                              |
                              v
                         Cloud Model Gateway
```

## 5. 组件职责

### 5.1 Haish-agent

客户端仓库是第一阶段主改造对象，继续承担桌面产品职责，并新增 runtime host 职责：

- 启动、停止、重启本地 runtime。
- 管理本地 runtime 端口、健康检查、日志路径。
- 维护已授权项目列表。
- 将 `haish://app/api/*` 代理到本地 runtime，而不是默认代理到云端。
- 提供 macOS folder picker、文件拖拽、系统通知、菜单栏等原生能力。
- 提供 App 级权限确认，例如终端执行、写文件、删除文件。

Electron Main 不再承担“远端工具执行器”职责，而是承担“本地 runtime 进程管理器 + 本地 API 代理”职责。`workspace-bridge.ts` 只作为旧云端桥接模式的兼容层，默认路径不再依赖它。

### 5.2 haishihua-agent-core

Python 仓库已经具备本地 runtime 的主要基础能力，第一阶段应尽量复用：

- 复用现有本地 HTTP API 和 NDJSON/SSE 流式接口。
- 复用现有会话、任务、事件、上下文和报告机制。
- 复用 `AgentWorldAssistant` 以及已有 agent loop。
- 复用本地工具：`read_file`、`list_dir`、`search_text`、`glob_files`、`write_file`、`edit_file`、`delete_file`、`terminal`。
- 继续以真实 workspace root 作为工具安全边界。
- 轻量补齐 sidecar 启动、健康检查、数据目录和模型网关配置。

第一阶段不应把 runtime 侧改成全新架构。只有当现有 `haishihua-agent-world-web` 无法满足 sidecar 进程管理时，才新增薄入口。

### 5.3 云端服务

云端从 data plane 退到 control plane：

- 用户登录、设备绑定、token 下发。
- 模型列表、默认模型、provider 策略。
- LLM API 代理，隐藏真实 provider key。
- 用量统计、额度、审计。
- 可选：会话摘要、报告、任务结果同步。

云端不直接读写用户本地文件，不直接运行本地项目命令。

## 6. Runtime 进程模型

### 6.1 启动方式

第一阶段采用 sidecar 子进程：

```text
Electron Main
  -> spawn python runtime
  -> wait /health ready
  -> renderer uses haish://app/api/*
```

推荐 runtime 命令：

```bash
python -m haishihua_agent_core.app.local_runtime \
  --host 127.0.0.1 \
  --port 0 \
  --data-dir "$APP_SUPPORT/Haish/runtime" \
  --log-dir "$APP_SUPPORT/Haish/logs"
```

`--port 0` 表示 runtime 自选空闲端口，启动后通过 stdout 输出一行 JSON：

```json
{"type":"ready","base_url":"http://127.0.0.1:49321","pid":12345}
```

Electron Main 读取该 ready 事件后保存 `localRuntimeBaseUrl`，并将 `haish://app/api/*` 代理到本地 runtime。

### 6.2 进程管理

Electron Main 需要实现：

- App 启动时拉起 runtime。
- runtime 崩溃时最多自动重启 3 次。
- App 退出时优雅停止 runtime。
- runtime 卡死时 kill 并重启。
- 日志写入 `~/Library/Application Support/Haish/logs/`。

健康检查：

```http
GET /api/local/health
```

示例响应：

```json
{
  "ok": true,
  "runtime": "haishihua-agent-core",
  "version": "0.1.0",
  "pid": 12345,
  "started_at": "2026-05-23T00:00:00Z"
}
```

## 7. 本地 API 设计

本地 runtime 优先复用现有 Agent World 的会话和任务 API。客户端侧把 API base 从云端切到 `127.0.0.1:<runtime_port>` 后，前端应尽量不感知“云端 runtime”还是“本地 runtime”。

因此，第一阶段 API 设计原则是：

- 能复用现有 `/api/conversations`、`/api/conversations/{id}/tasks/stream` 就复用。
- 只新增本地 runtime 必需接口，例如健康检查、项目授权、runtime 状态。
- 不引入 `desktop:<project_id>` 作为本地 runtime 的主路径语义。
- conversation 中保存真实 `workspace_path`，例如 `/Users/zhanruitao`。

### 7.1 项目授权

Electron Main 仍负责系统 folder picker。选中目录后可以直接调用现有会话创建接口，也可以先调用一个轻量 project API。第一阶段推荐最小改造：

```http
POST /api/local/projects
```

请求：

```json
{
  "root_path": "/Users/zhanruitao",
  "label": "zhanruitao"
}
```

响应：

```json
{
  "project_id": "local_abc",
  "root_path": "/Users/zhanruitao",
  "label": "zhanruitao",
  "created_at": "2026-05-23T00:00:00Z"
}
```

如果现有 runtime 还没有 project store，则可以先由 Electron 保存项目列表，创建 conversation 时把真实 `workspace_path` 传给 runtime。项目授权数据建议第一阶段双写：

- Electron 保存用于启动前展示和权限确认。
- runtime 保存用于任务执行和恢复。

后续收敛为 runtime 保存，Electron 只做 picker 和系统权限。

### 7.2 会话创建

```http
POST /api/conversations
```

请求：

```json
{
  "title": "New Conversation",
  "project_id": "local_abc"
}
```

响应中必须包含真实 workspace：

```json
{
  "conversation_id": "conv_abc",
  "workspace_path": "/Users/zhanruitao",
  "workspace_label": "zhanruitao",
  "runtime_location": "local"
}
```

不再使用 `desktop:<project_id>` 作为 workspace path。`desktop:<project_id>` 只作为旧协议兼容字段保留。

### 7.3 任务流

```http
POST /api/conversations/{conversation_id}/tasks/stream
```

请求：

```json
{
  "message": "/Users/zhanruitao/py-project/haishihua-agent-core 你来分析一下这个项目",
  "options": {
    "model_id": "deepseek-ai/DeepSeek-V3.2",
    "reasoning_effort": "high",
    "use_history": true
  }
}
```

响应仍为 NDJSON 事件流。现有前端 Agent World 可继续消费：

```json
{"type":"task_started","task_id":"task_abc"}
{"type":"llm_started","provider":"DeepSeek","model":"deepseek-ai/DeepSeek-V3.2"}
{"type":"llm_tool_call_requested","tool_name":"list_dir","arguments":{"path":"/Users/zhanruitao/py-project/haishihua-agent-core"}}
{"type":"tool_result_returned","tool_name":"list_dir","status":"ok"}
{"type":"answer_delta","text":"..."}
{"type":"task_completed","task_id":"task_abc"}
```

## 8. Workspace 和路径语义

### 8.1 授权 root

每个 conversation 必须绑定一个授权 root：

```text
conversation.workspace_root = /Users/zhanruitao
```

工具访问规则：

- 相对路径：相对 `workspace_root` 解析。
- 绝对路径：允许，但必须在 `workspace_root` 内。
- `..`：允许解析，但最终路径必须仍在 `workspace_root` 内。
- symlink：需要 resolve 后检查是否仍在授权 root 内。

示例：

| 输入路径 | workspace_root | 结果 |
|---|---|---|
| `py-project/haishihua-agent-core` | `/Users/zhanruitao` | 允许 |
| `/Users/zhanruitao/py-project/haishihua-agent-core` | `/Users/zhanruitao` | 允许 |
| `/Users/zhanruitao/haishihua-agent-core` | `/Users/zhanruitao` | 路径不存在 |
| `/etc/hosts` | `/Users/zhanruitao` | blocked |

### 8.2 Agent prompt 约束

本地 runtime 的 system prompt 必须明确：

```text
Current workspace root: /Users/zhanruitao
You may use workspace-relative paths or absolute paths under the workspace root.
If a user gives an absolute path under the workspace root, use it directly.
If the path does not exist, inspect the parent or search from the workspace root before claiming the workspace is missing.
Never say no workspace is selected when workspace_root is present.
```

### 8.3 工具 schema 文案

现有工具描述中大量写着 “Workspace-relative path”。本地 runtime 下应统一改为：

```text
Path to a file or directory inside the authorized workspace root.
May be workspace-relative or absolute. Absolute paths must remain under the workspace root.
```

这不是纯文案问题。LLM 是否会正确使用绝对路径，强依赖工具 schema。

## 9. 模型调用

本地 runtime 不直接保存第三方 provider key。推荐通过云端 model gateway：

```text
Local Runtime -> Cloud Model Gateway -> Provider
```

请求字段：

```json
{
  "model_id": "deepseek-ai/DeepSeek-V3.2",
  "messages": [],
  "tools": [],
  "stream": true,
  "reasoning_effort": "high",
  "user_id": "xxx",
  "device_id": "mac_xxx"
}
```

云端职责：

- 解析 model_id 到 provider。
- 注入 provider key。
- 做用量统计和限流。
- 返回 provider 原生流或统一后的流。

本地 runtime 职责：

- 构造 agent messages。
- 提供 tools schema。
- 消费模型流。
- 执行本地工具。
- 生成 Agent World 事件流。

## 10. 数据存储

建议本地 runtime 使用独立数据目录：

```text
~/Library/Application Support/Haish/
  runtime/
    runtime.db
    projects.json
    conversations/
    attachments/
    reports/
  logs/
    runtime.log
    electron.log
```

第一阶段可以复用现有 `session_store.py`，把路径从服务端 workdir 切到本地 data dir。

后续可收敛到 SQLite：

- projects
- conversations
- messages
- tasks
- task_events
- attachments
- usage_cache

## 11. 安全模型

### 11.1 本地授权

授权分两层：

1. 用户在 macOS folder picker 中选择目录。
2. Haish 内部把该目录登记为 workspace root。

大目录和 home 目录不应硬拦截，但要明确提示：

- 该目录下所有文件可能被 agent 读取。
- 写文件和终端命令会在该目录权限范围内执行。
- 用户可以随时移除项目授权。

### 11.2 写操作确认

第一阶段建议：

- `read_file`、`list_dir`、`search_text`、`glob_files`：默认允许。
- `write_file`、`edit_file`、`delete_file`：按风险策略确认。
- `terminal`：默认需要确认，后续可做 per-project trust。

确认不应放到云端服务。它应该由本地 App 决定，因为实际副作用发生在本机。

### 11.3 云端数据最小化

云端模型调用不可避免会收到必要上下文，但云端服务不应主动读取本地文件。

本地 runtime 需要区分：

- 发送给模型的代码片段和工具结果。
- 只在本地 UI 展示的原始文件内容。
- 可选同步的摘要和最终报告。

## 12. 迁移方案

### Phase 0：定方案和保护现有能力

目标：

- 保留当前云端 agent world 能力。
- 新增本地 runtime 设计文档和任务清单。
- 不破坏现有 UI。

产出：

- 本文档。
- runtime API 草案。
- Electron runtime manager 草案。

### Phase 1：本地 runtime 最小可用

目标：

- 客户端启动本地 `haishihua-agent-core` runtime。
- 客户端把 `haish://app/api/*` 从云端代理切到本地 runtime。
- 客户端 Add Project 后创建绑定真实 `workspace_path` 的 conversation。
- 复用 runtime 现有 conversations、`tasks/stream` 和本地 workspace tools。
- runtime 侧仅补齐 sidecar 必需的健康检查/启动输出/配置项。

验收：

- 选择 `/Users/zhanruitao` 作为工作区。
- 提问 `/Users/zhanruitao/py-project/haishihua-agent-core 你来分析一下这个项目`。
- agent 能列目录、读 README/pyproject，并输出项目分析。
- 不出现“没有选择工作空间”。

### Phase 2：写工具和终端本地化

目标：

- 接入 `write_file`、`edit_file`、`delete_file`、`terminal`。
- Electron 提供本地确认 UI。
- 支持任务取消。
- 支持实时工具事件在 Agent World 中展示。

验收：

- agent 能在授权项目里创建测试文件。
- 用户能看到写操作确认。
- 用户能取消长时间终端命令。

### Phase 3：云端服务降级为模型网关

目标：

- 本地 runtime 不再依赖云端 agent world runtime。
- 云端只提供模型、账号、配置、用量。
- 客户端模型列表从云端 model catalog 拉取。

验收：

- 断开旧云端 agent API 后，本地项目任务仍可运行。
- 只要模型网关可用，agent 就能继续工作。

### Phase 4：同步和产品化

目标：

- 可选同步会话摘要、报告、任务状态。
- 支持自动更新本地 runtime。
- 支持 crash recovery。
- 支持本地 runtime 版本迁移。

验收：

- App 重启后恢复项目、会话和任务历史。
- runtime 崩溃后自动重启并提示用户。

## 13. 代码改造点

### 13.1 Haish-agent

第一阶段主改造仓库。建议新增：

```text
src/main/local-runtime.ts
src/main/local-api-proxy.ts
src/main/project-store.ts
src/shared/local-runtime-api.ts
```

建议调整：

```text
src/main/main.ts
  - app ready 后启动 local runtime
  - haish://app/api/* 代理到 local runtime
  - 保留 cloud API 作为 /cloud-api/* 或 model gateway

src/preload/preload.ts
  - 暴露 runtime status
  - 暴露 project picker
  - 暴露 confirmWrite / confirmTerminal 等本地确认能力

app-web/src/app.jsx
  - 去掉默认路径对 desktop bridge 的依赖
  - project/conversation 直接使用 local runtime 返回的 workspace_path
  - 继续复用现有 Agent World UI 和任务流消费
```

建议废弃：

```text
src/main/workspace-bridge.ts
```

### 13.2 haishihua-agent-core

第一阶段轻量适配仓库。优先复用现有 `haishihua-agent-world-web` / app API；只有缺口明确时才新增：

```text
src/haishihua_agent_core/app/local_runtime.py      # 可选：sidecar 薄入口
src/haishihua_agent_core/app/local_settings.py     # 可选：本地 data/log/model gateway 配置
src/haishihua_agent_core/app/model_gateway_client.py # 可选：如果现有 llm adapter 不能直接配置网关
```

建议调整：

```text
src/haishihua_agent_core/app/assistant.py
  - 尽量复用 selected workspace prompt
  - 必要时补充 root 内绝对路径说明

src/haishihua_agent_core/tool/workspace_read.py
src/haishihua_agent_core/tool/workspace_write.py
src/haishihua_agent_core/tool/terminal.py
  - 可选：统一路径描述
  - 保持 resolve 后不能越过 workspace root

src/haishihua_agent_core/app/api.py
  - 优先复用任务流协议
  - 如存在云端部署假设，再做最小抽离
```

旧 bridge 相关代码暂不删除，只从默认链路移除：

```text
src/haishihua_agent_core/app/remote_fs_tools.py
src/haishihua_agent_core/app/workspace_bridge.py
```

废弃要分阶段，不应在 Phase 1 立即删除。

## 14. 兼容策略

第一阶段保留两个模式：

```text
local_runtime: 新主线，Haish App 默认使用
cloud_bridge: 旧模式，只作为回滚开关
```

Electron 环境变量：

```bash
HAISH_RUNTIME_MODE=local
HAISH_LOCAL_RUNTIME_CMD=...
HAISH_MODEL_GATEWAY_BASE=https://...
```

回滚方式：

```bash
HAISH_RUNTIME_MODE=cloud-bridge
```

这样可以先把本地 runtime 跑通，不用一次性删除云端 bridge。

## 15. 风险和应对

| 风险 | 表现 | 应对 |
|---|---|---|
| Python runtime 打包复杂 | 用户机器缺 Python 或依赖不一致 | 第一阶段开发态使用本机 venv；产品化阶段打包 embedded Python 或 standalone binary |
| App 关闭导致任务中断 | 长任务无法云端续跑 | 第一阶段接受；后续做本地 daemon 或后台 helper |
| 本地日志泄露敏感路径 | 日志包含文件路径和工具结果 | 日志分级，默认不写完整文件内容 |
| 模型 gateway 延迟 | 本地 loop 等云端模型流 | 使用 streaming，UI 展示模型连接状态 |
| 绝对路径误访问 | agent 访问未授权目录 | 所有工具统一 resolve 后检查 workspace root |
| 老会话不兼容 | `desktop:<project_id>` 老数据存在 | 兼容读取，打开时迁移到 local project |

## 16. 第一版任务清单

### 客户端

1. 新增 `local-runtime.ts`，支持 spawn runtime 和健康检查。
2. 新增 `local-api-proxy.ts`，将 `haish://app/api/*` 代理到 runtime。
3. 调整项目选择流程，选择目录后保存真实 `rootPath`，并创建绑定真实 `workspace_path` 的 conversation。
4. 调整 conversation 创建流程，不再写入 `desktop:<project_id>`。
5. 移除新任务对 `startWorkspaceBridge` 的依赖。
6. UI 显示 runtime 状态：starting、ready、failed、restarting。

### 本地 runtime

1. 确认现有 web/app 入口可作为 sidecar 启动；不满足时新增薄入口。
2. 确认或新增 `/api/local/health`。
3. 确认 conversation 创建能接受真实 `workspace_path`。
4. 复用 conversation/task stream。
5. 复用本地 workspace read tools。
6. 如模型 key 不落本地，则接入云端 model gateway。
7. 必要时在 prompt/tool schema 中补充 `workspace_root` 和绝对路径规则。

### 验收用例

1. 授权 `/Users/zhanruitao`。
2. 提问 `/Users/zhanruitao/py-project/haishihua-agent-core 你来分析一下这个项目`。
3. 确认 agent 使用 `list_dir` 访问绝对路径。
4. 确认 agent 能读取 `README.md`、`pyproject.toml`。
5. 确认最终回答包含技术栈、目录结构、运行方式和架构评价。
6. 确认不会出现“没有选择工作空间”。

## 17. 关键设计结论

1. Haish 的代码项目 agent 体验应以本地 runtime 为主。
2. Electron App 是产品外壳和权限边界。
3. `haishihua-agent-core` 是本地执行核心。
4. 云端只保留模型网关和 control plane。
5. `desktop:<project_id>` 和 workspace bridge 是过渡方案，不应成为长期主线。
6. 绝对路径支持不是前端字符串处理问题，而是 workspace 语义、prompt、tool schema 和安全检查的统一设计问题。
