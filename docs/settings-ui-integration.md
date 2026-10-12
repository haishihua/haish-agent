# Settings UI 接入说明

过渡期设计预览和一次性手工验证页已于 2026-09-11 清理。以下保留正式组件、接口约束和接入记录。

## 生产组件与回归入口

- 正式页面：`app-web/src/features/settings/components/SettingsPage.jsx`；主题：`app-web/src/features/settings/settings.css`。
- 上游控件：`app-web/src/shared/ui/settings-elements/`，来源清单和 assistant-ui、shadcn、Dice UI 许可证均保留在该目录。
- 上传元数据解析：`app-web/src/features/settings/model/skill-package.js`；回归用例迁至 `app-web/tests/features/settings/skill-package.test.js`，直接导入生产实现。
- 保存与上传交互逻辑：`app-web/tests/features/settings/settings-save.test.js`。
- 执行：`npm run check:web`；测试目录及浏览器回归入口见 [测试说明](../app-web/tests/README.md)。

## Skills 来源子页与缓存（2026-10-08）

- Built-in、Global、Project 放在左侧 Skills 下面，独立来源计数（含禁用项），不再使用页内横向 Tab；搜索只作用于当前子页。Refresh 和 Install 在右上角并排。
- Built-in 仅系统预设；Global 为安装包与用户级 Codex 来源；Project 为当前会话工作区的有效项目来源。Global 和 Project 都有安装入口：项目包实际保存到当前项目 `.haish/installed-skills/`，不写全局目录或可替换的运行副本。上传弹窗标明目的地与默认启用效果；开关仍按名称全局生效，不引入项目级开关。
- 原 API 的有效 `items` 保持按名称去重，另返回 `groups` 和 `workspace`。Global 清单不会因项目覆盖而少一项，覆盖项标注 shadowed；其开关及卸载入口隐藏，避免通过按名称接口卸载错误来源。Project 仍展示有效项目来源，不宣称枚举被安装包/预设遮蔽的所有项目文件。
- 现有 Tools GET/PUT 和 Skill 安装/启停/卸载接口接受可选 conversation_id，并校验会话归属；显式空值使用默认工作区，不再跟随别的会话最近同步状态。旧调用不带参数保持原行为。
- 使用有上限的会话内本地 inventory 缓存，按 owner/会话/工作区隔离，不使用未分作用域的 localStorage 草稿。缓存命中时保留列表并后台刷新；打开页、展开左侧 Skills（无需点击子页，也不切换当前设置页）、窗口获焦、手动 Refresh 检查外部变化，写操作结束清除缓存并重取完整列表。失败保留已知列表但明确显示错误和 Retry；旧请求/旧上下文写响应不能覆盖新工作区。
- Settings、默认 Agent 和运行副本同步共用按工作区维护的后端索引；Agent 从索引构建 registry，不再扫描 mirror。文件仍在各自源目录，mirror 不参与来源计数；自定义 SkillsConfig 保持原发现语义。缓存有上限，外部文件的新增/更新/删除触发失效，启用与角色过滤在使用端执行。
- 没有改实际 Skill 源文件或开关状态；没有启用嵌套 Skill 与 Codex `.system`。没有部署或重启运行应用。
- 最新验证：前端 895 项单元/契约测试通过，修改源码 ESLint 通过；浏览器左侧子页、覆盖控制、并排操作、项目安装目的地、刷新失败保留列表及详情开关交互通过。生产 trace 最终离线回放 100 条、1,374 次请求，Skill 区块与完整请求消息一致；另对 3 个工作区当前来源与旧发现规则做独立一致性检查。历史 trace 没有归档 Skill 正文或旧开关状态，不把离线回放当作生产部署或新模型行为评测。详见后端 `docs/config/skill-shared-inventory.md`。

- 展开计数修复：Skills 展开状态通知 AppShell，允许在非 Tools 页面加载 inventory；加载状态按 owner/会话/工作区隔离而非页面选择，切换设置页不把已知数量重置为 `—`。首次加载失败在 Skills 子项下提供 Retry skill counts。验证：前端 897 tests、修改文件 ESLint、浏览器 18 项交互检查通过（含展开即加载、子页点击前显示计数），隔离构建输出见 `expand-count-build.log`。

- Skills 紧凑布局：仅 Skills 内容内边距从 24/28px 收紧为 16/20px，标题与说明间距 6px，说明段间距 2px；Refresh 增加刷新图标，后台刷新时旋转并禁用重复点击。897 项前端测试、修改文件 ESLint 和浏览器 21 项交互检查通过（包括实际 computed style 与图标状态）。

- 展开加载生命周期修复：AppShell 使用 `useLiveToolsSettings`，effect 只绑定启用状态、工作区与写操作，不再因 Built-in/Global/Project 选择变化取消并重启请求。浏览器夹具直接使用同一生产 hook（不再用展开回调伪造加载），26 项检查通过，覆盖展开后请求、子页点击前计数、进行中切页不增加请求且正常完成。页面加载复用 Settings 首屏的 `LoadingState`，不再使用自写 Loading current skills 文本；导航计数复用已有 Settings spinner。897 项测试、ESLint 通过；已构建到实际 `app-web/dist`。可信客户端读取运行接口成功，当前会话与默认工作区均返回 Built-in 10 / Global 7 / Project 0；这不是桌面窗口已重载的证明。

## Skills 使用当前接口数据（2026-10-08，早期实现，已由上节取代）

- Skill 列表、数量、加载错误和安装路径不再从 localStorage 草稿恢复，也不再随草稿保存。其他配置草稿保持不变。
- 打开 Tools/Skills、切换 Skills 子页/会话/工作区、Skill 写操作结束以及 Skills 页面重新获焦时刷新；请求 `cache=no-store`，旧请求通过 abort 和序号失效。
- 刷新期间列表显示加载状态、侧栏数量显示 `—`，失败显示错误和 Retry，不把旧列表或失败当空列表。提供 Refresh 手动获取当前结果。
- Skills 页面刷新只合并 inventory，不覆盖未保存的 MCP/Web Search 草稿。未加载 inventory 时，整份保存省略 skills.disabled，避免把空列表解释为全部启用。
- 数量是接口当前列表总数，工作区改变仍可能合法变化，不固定为 17/36。本次已批准删除四个同名旧上传包后，接口返回 36、无冲突错误，四个系统预设仍启用；没有删系统预设、改其他 Skill 开关或部署应用。

## 系统预设 Skill 标签（2026-10-06）

Skills 列表按来源映射标签：`preset` / `builtin` → **Built-in**，`installed` / `haish` → **Haish**，`codex-copy` → **Codex**；未知来源显示 **Unknown**，不再误归为 Codex。`settings-manager` 后端已返回 `source=preset`，仅修正前端展示，不改接口、启用状态或卸载权限，也不通过 `readOnly` 禁用预设开关。实现位于 `model/skill-source-label.js`，生产行直接调用该映射。相关 Settings 与详情开关回归 57 项通过，修改文件 ESLint、`git diff --check` 与 Vite 生产构建通过（输出到独立验证目录，未覆盖当前应用资源）；不重启或部署运行中的应用。

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

## Settings 加载占位（2026-09-15）

设置页首次打开时，`AppShell` 的懒加载回退原来只是一个没有样式的 `<div role="status">Loading settings…</div>`：纯文本贴在左上角，而且继承 `body` 的 Zpix 像素字体，观感很差。现在改为 assistant-ui Elements 的 **Loader**（`/elements/loading-state`，像素矩阵 + 扫光标签）：

- 组件 `app-web/src/shared/ui/agent-elements/LoadingState.jsx`，样式 `loading-state.css`。九宫格、`pixelOffset = floor(tick / 3)`、`(index * 2 + pixelOffset) % 9 < 3` 的点亮规则、8px 格子与 4px 间距、300ms 透明度过渡都沿用上游；`variant` 保留 `dots` / `squares` / `rounded`。上游把时钟交给调用方（120ms 一拍），`LoadingState` 在挂载时自行计时、卸载时清掉，`GenerationLoader` 仍是无状态的原版接口。
- Tailwind 工具类改为 `aui-loader-*` 作用域 CSS（与 `error-state.css` 同一做法），扫光沿用项目已有的写法，等价于上游的 `tw-shimmer`（MIT，assistant-ui）。许可证见同目录 `LICENSE-assistant-ui.txt`。
- 标签文字保持 “Loading settings…”，但字体按要求换成**正文字体** `--conversation-font`（聊天正文那一套）：`body` 用的是像素字体，不显式指定会继承成像素字。
- 占位整块居中：`app-shell.css` 新增 `.app-body-loading { display: grid; place-items: center; }`；工作流的 `Loading workflow…` 占位未改。
- 验证：Electron 挂生产样式表实测，loader 中心与设置区中心重合（1280×716 区域内 640/414 对 640/414），9 个格子 8px、间距 4px，点亮格按拍移动，标签 14px、55% 透明度、`LXGW WenKai Screen`、扫光动画运行；`npm test` 新增 `contracts/loading-state.test.js` 锁住上述结论。

## Embedding 归入 Context、连接测试结果跟着配置存（2026-09-15）

- 导航分组调整：Embedding 从 Providers 子标签移到 **Context** 分组，与 Memory 并列；Providers 只剩 Chat / Vision。Embedding 段的列表、编辑面板、Add provider、连接测试与删除全部复用原 LLM 通道（`configItemsForSection('embedding')` 走 `getLlmConfigItems`，测试走 `onTestLlmConfig`，删除走 `onDeleteLlmProvider('embedding')`）。单条目段的搜索框和已配置时的 Add 一并隐藏。
- Qdrant 的“测没测过”原来只存在浏览器 `localStorage`（`haish.settingsConnectionStatus.v1`，靠一段连接签名匹配）。签名由本地草稿算出，草稿没落盘、记录改名（knowledge-qdrant → memory-qdrant）或换过一个段都会让它对不上，结果就退回 `Not tested`，下一次同步还会把已存的结果覆盖掉。现在改由后端跟着已保存的连接存：`memory.qdrant.last_test`（state / message / tested_at + 内部 `identity`），`GET /api/settings/memory` 只返回结果不返回 identity，连接（URL、collection、是否带 key）变了就当没测过。前端删掉整层签名与 localStorage 持久化，只保留本轮会话的临时状态。
- 验证：`npm test` 310 项、ESLint、架构检查（128 个模块）与 `build:web` 通过；后端新增 `test_connection_test_result_is_stored_with_the_saved_connection`，全量 `pytest --ignore=tests/test_app_web.py` 1613 passed。

## 2026-10-11：模型记录身份与 OAuth 单存储

- 执行 network / run-config 使用 `llm_config_id`，它对应 Settings 持久记录 `id`；`provider` 仅用于协议类型与品牌展示，不是执行 selector。聊天、Goal、retry/edit、任务恢复、workflow 默认/节点/重跑均传递记录 ID。
- runtime options 不按品牌/名称/模型/位置生成 selector，不回退第一条；缺失、保留或重复 ID 不进入执行列表。有效模型覆盖与四档 Thinking 恢复保持，目录刷新不能覆盖已有有效选择。
- 新建或旧无 ID 辅助草稿的 UI 编辑 ID 不冒认持久记录：保存前不进入执行选项，独立目录/连接测试省略 `llm_config_id`，明确传协议/地址/凭据；Settings 保存返回记录后才可执行。
- 已提供 ID 的目录/测试请求即使有显式 Key 也由后端校验；协议、认证或地址被编辑时不借原记录保存 Key。Model ID 继续直接编辑，不恢复 Add model / 附加模型列表。
- OAuth 登录、状态、执行、目录、测试和刷新使用后端应用 Settings 根目录唯一 `auth.json`；旧用户 OAuth 文件不兜底、不双写、不自动迁移。缺凭据时在 Settings 重新登录。
- 最终前端离线验证：`npm test` **987 passed / 0 failed**；架构检查 **197 modules**、ESLint、typecheck 与 `build:web` 均退出 0。Vite 仅有大 chunk 提示。未发布、重启应用或调用真实模型；已有 UI 改动保留。

### 历史会话恢复与空配置保护

- 桌面端使用 `app-web/dist`，修改源码或只重启 Python 后端不会更新已经打开的 renderer。记录 ID 协议升级后必须重建此目录并重新加载桌面应用；旧构建只识别 `provider`，会丢失后端返回的 `llm_config_id`。
- `ChatComposer` 保存配置使用恢复出的记录 ID，而不是用当前 options 的查找结果生成空字符串。未加载、已删除或不可用的配置保持可见，发送校验明确拒绝，不自动选择其他记录。
- `useConversationRunConfig` 接收 `saveBlockedReason`，无效路由不进入自动 observe/save，也不能通过 ensureSaved 或 Agent 切换绕过。用户明确选择有效配置后才恢复保存；Bot 的完整节点路由仍可在无全局配置时执行。
- 当时已被旧构建写空的会话不能仅凭 renderer 更新恢复身份；能否自动恢复取决于是否保留可确认的原引用证据。两条已单独授权恢复的会话另行完成恢复；本节不代表继续修改真实数据的许可。第三轮兼容规则见下方。
- 验证：前端 **991 tests passed**；架构检查 **197 modules**、lint、typecheck、`build:web` 和 diff checks 通过。`send-blocked-tooltip.html` 真实 React 离线夹具通过，覆盖无效恢复不覆盖配置、已删除身份保留、明确重选保存、`llm_config_id` 历史会话保留 Xhigh 并发送。未调用真实模型或重启桌面应用。

### 统一身份升级与兼容收尾

- 后端读取旧 Settings 时自动补一次并持久化记录 ID，用户无需手填。Settings 回传的 `legacy_selectors` 是升级时冻结且可确认的旧 selector → 原记录映射；前端只消费它，不根据今天的品牌/名字/模型/排序推测配置。
- 旧 `provider` 中的精确有效 ID 或冻结 alias 自动兼容；新 `llm_config_id` 仍严格校验。不可用/冲突身份保留并阻止发送及无效自动保存，删除后不会静默绑定同名新记录。
- 修复旧工作流 Agent `runtime_config.provider` 与 LLM `provider` 被前端误拦截的问题。节点展示、提取、保存及重跑共用迁移函数；节点明确换配置时不得借全局的模型和 effort。
- 历史与本地缓存恢复可自动转规范 ID，保留原模型与 Thinking。Settings 延迟加载时仅旧字段可走 alias；错误的新 ID 不能冒充旧字段绕过校验。既有 `saveBlockedReason` guard 保持。
- 最新验收：**996 tests passed、0 failed**；architecture **198 modules**、lint、typecheck、`build:web` 均 exit 0。最终 renderer 入口为 `app-web/dist/assets/js/index-C4CJ6EPq.js`，回读确认包含新兼容与防护逻辑。Vite 只有大 chunk 提示。
- 真实 React 离线夹具 **PASS**：旧 alias 无需手动重选可恢复/保存/发送，Xhigh 保留，恢复过程中不写空 ID；新 ID 历史、不可用引用及其他保存 guard 同时通过。临时 Vite 已停止。
- 本轮只改源码、构建及隔离验证，未重载桌面、调用真实模型、写真实 Settings/凭据或重新恢复会话。构建成功不等于已打开 renderer/运行中后端已加载新版本；完全缺失原身份依据的数据仍不自动猜配。

### 失败页 Retry 收尾修复

- 离线行为回归先复现：收到 `run_started` 后传输失败，旧处理先回滚并清空 active task 指针，再读取它去标记失败，导致已确认的新 attempt 留在 `running`。现在先处理已接收事件，区分未确认请求和已确认任务；后者保留任务并标记失败、释放属于该次请求的运行占用。已经收到终态的任务不被后续传输错误覆盖。
- 从本地 pending 转为服务端任务时保留 model、Thinking 和 request text，Chat 重试使用当前已保存的明确选择，Bot 保留规范化节点路由。不可用配置仍由 `ensureSaved` guard 拒绝，composer 不再丢弃该 guard 的句柄并只报泛化的“等待配置”。
- 移除失败卡下面独立的 Retry action-error 小卡；实际错误合并在原失败卡内，不吞错。编辑重发的草稿及行内失败反馈保持不变。
- 本次验证：前端 **999 tests passed、0 failed**，architecture **198 modules**、lint、typecheck 通过；renderer 重建入口为 `app-web/dist/assets/js/index-DyL791nz.js`，只有既有大 chunk 提示。后端无新源码修改，隔离 HOME/Settings、禁外网的 attempt/身份回归 **86 passed**。
- 真实 React 离线 `failure-retry.html` **16 checks PASS**：连续两次重试、双击防重、当前记录/model/Xhigh、流失败释放占用、无下方小卡、无效身份不写不发及错误保留。既有 `edit-resend-immediate.html` 与 `send-blocked-tooltip.html` 同时 PASS，无页面错误；临时 Vite 已停止。
- 上述 999 项与旧 bundle 是本次边界修复之前的历史验收，不作为当前提交依据；当时两处身份遗漏尚未修复。当前最终结果见下节。

### 2026-10-12：身份恢复 / 幂等重放边界修复与提交验收

- 恢复配置时保留冲突的两份身份，模型与 Xhigh 不丢；阻止 localStorage 写入、自动保存、Retry/发送保存及 Agent 切换。改模型、Thinking 或刷新 Settings 不能解除冲突；明确选择有效配置才清除旧身份。guard 不被重选提示或默认回退替代。
- 后端 Retry 重放统一首次执行的显式身份清空规则；旧 `provider: null`、空白/失效 ID 或另一记录返回 409，不新增任务或模型调用。省略身份、相同记录 ID 和合法冻结 alias 仍重放原任务。
- 最终前端 **1000 passed、0 failed**；architecture **198 modules**、lint、typecheck、`build:web` 串行链 exit 0，仅既有 chunk-size warning。renderer 入口 **`app-web/dist/assets/js/index-OEYvguuy.js`**；回读确认冲突保留、规范 ID、guard 与 Retry 收尾均在产物中。
- 后端隔离 HOME/Settings、禁外网全仓 **3223 passed、599 subtests passed、67 skipped、3 warnings**，exit 0；其中 attempt/身份专项 **95 passed**，已被全仓覆盖，不另累加。67 skipped 属于可选 Harbor、真实浏览器/Embedding 与历史证据项，不当作通过。
- 真实 React 离线 `failure-retry.html` **16 PASS**（重复检查）、`edit-resend-immediate.html` **19 PASS**、`send-blocked-tooltip.html` **66 PASS**，无页面异常；覆盖双击防重、连续重试、已确认中断及终态保护、当前路由/Xhigh、冲突阻断和明确重选规范保存、原错误保留与无下方小提示。Retry 夹具等待 mock 目录 effect 完成，生产 guard 未放宽。
- 本次按照用户授权，将现有完整增量按功能本地分批 commit；精确 hash 以最终 Git 记录为准，不 push。验收日志在后端 `build/settings-only-runtime/submission-final-*`（本地 ignored 产物）。
- 未写真实 Settings/凭据/历史会话、未再次执行已获批会话恢复，未安装依赖、发布、重载桌面或调用真实模型。新产物不证明运行中的 renderer/后端已加载更新，也不证明真实 OAuth/远程模型验收。
