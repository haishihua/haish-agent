# Settings UI 接入说明

过渡期设计预览和一次性手工验证页已于 2026-09-11 清理。以下保留正式组件、接口约束和接入记录。

## 生产组件与回归入口

- 正式页面：`app-web/src/features/settings/components/SettingsPage.jsx`；主题：`app-web/src/features/settings/settings.css`。
- 上游控件：`app-web/src/shared/ui/settings-elements/`，来源清单和 assistant-ui、shadcn、Dice UI 许可证均保留在该目录。
- 上传元数据解析：`app-web/src/features/settings/model/skill-package.js`；回归用例迁至 `app-web/tests/features/settings/skill-package.test.js`，直接导入生产实现。
- 保存与上传交互逻辑：`app-web/tests/features/settings/settings-save.test.js`。
- 执行：`npm run check:web`；测试目录及浏览器回归入口见 [测试说明](../app-web/tests/README.md)。

## 正式 Settings 接入（2026-09-10）

已将审核通过的界面接入 `SettingsPage`，覆盖 Providers、MCP、Skills、Web Search、Memory、Knowledge、Agent 及 Workflow 列表。`SettingsPrimitives.jsx` 仅组合字段、列表行、搜索和编辑面板，上游控件直接从所属模块导入。主题 CSS 限定在 Settings 内，排除原 Workflow 详情，避免影响聊天区和画布。

- 模型目录、OpenAI OAuth、密钥保存、连接测试、MCP 校验与重载、Agent 权限均沿用原有数据和业务处理。
- 保存失败返回明确的失败结果并保留编辑区；删除/卸载失败也保留确认面板，成功后才关闭。
- `WorkflowConfigEditor.jsx`、`WorkflowFormControls.jsx` 和旧 `settings-ui.jsx` 未改；详情保留原来的返回按钮、名称编辑、节点工具栏、画布及保存逻辑。

### 正式 Skill 包安装

客户端使用 Dice UI 上传控件和 fflate/js-yaml 预览元数据，随后把原始 ZIP 作为 `application/zip` 请求体提交到 `POST /api/settings/tools/skills/install`。无需填写目录，无需新增 Electron IPC，也不执行包内内容。

后端变更位于配套工程 `haish-agent-core` 的 `settings.py`、`skill/package.py` 和 `app/api.py`：

- 上传包永久存放在 `~/.haish/installed-skills/<name>`，和 Codex 来源一起按现有任务边界同步到工作区 `.haish/skills`。上传来源不写入或修改 Codex 目录。
- 同名安装返回 409，避免覆盖已安装或 Codex 同步的 Skill。后续 Codex 新增同名来源时，已上传包保留优先级。
- 停用保留上传源，重新启用恢复运行时副本；卸载上传包删除 Haish 源和当前副本，其他工作区在下一次同步时清理。卸载 Codex 来源仍只删除/停用 Haish 副本。
- 请求上限 20 MB，解压上限 64 MB，最多 4096 个条目，单文件上限 16 MB，SKILL.md 上限 256 KB。拒绝越界路径、重名文件、符号链接、特殊文件和有歧义的多 Skill 包；保留普通脚本执行位，去除额外权限位。先在临时目录验证，成功后才移动到安装目录。
- 返回现有 tools settings 结构及 `skills.can_install: true`，前端据此刷新列表。正式运行需要同时使用本次更新的配套 Python runtime。

验证记录：正式组件浏览器检查覆盖模型选择和 XHigh、保存失败后保留草稿、MCP 校验、Web Search 保存/测试、Memory 与 Knowledge 配置、Agent 权限、原 Workflow 详情。上传解析、请求与失败反馈以及后端安装/同步/卸载均有独立测试；工程架构检查、ESLint、TypeScript 与正式 Vite 构建通过；前端 257 项测试、后端 36 项 Skill 相关测试通过。


## 正式页面细节修正（2026-09-10）

- 自定义提供商缩写按空格、下划线、点和短横线拆分，`opencode_go` 显示 `OG`。
- 按本轮反馈对调页面底色：左侧导航使用深蓝 `#151d29`，右侧工作区使用深灰 `#121419`，列表和编辑区保留中性灰层次。
- Skill 加载器与设置启停/卸载使用同一名称校验，兼容 `esx.coding.backend.implement` 这样的点分名称；继续拒绝路径分隔符、空命名段和超长名称。截图中的四个真实 Skill 文件已做只读解析验证。
- 其他 Skill 加载错误改用 shadcn Collapsible，默认只显示错误数量，展开后查看原因与来源路径。
- 按本轮明确要求修复 Workflow 节点工具栏：移除通用 span 的偏移，匹配当前 AppIcon 类名，用 flex 居中 16px 图标和 26px 底框。保留节点操作、画布和详情布局。

验证：浏览器读取确认 OG 和两区底色，六个工具栏图标中心偏差接近 0，错误提示可折叠；架构检查、ESLint 和正式构建通过，38 项后端 Skill 相关测试通过。

## 复用聊天页背景与提供商操作位置（2026-09-10）

- 按最新反馈，用聊天页原有渐变替代上一节的平面底色。主区、侧栏和应用底层背景提取到 `app-web/styles/surfaces.css`，聊天页与设置页共用；列表、输入框和编辑面板继续保留现有深灰色。
- Chat、Vision、Embedding 的 Add provider 移到搜索框同一行右侧，位于数据列表正上方。
- 验证：ESLint、正式构建及 `git diff --check` 通过；浏览器确认背景、按钮位置及新增提供商编辑面板正常打开。
