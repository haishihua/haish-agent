# 工具卡片与详情组件优化

日期：2026-09-10

## 已确认范围

本次修改前端展示与 Electron 桌面端截图读取桥接，Python 后端和事件协议无需修改。以 assistant-ui Elements 的源码和视觉结构为基础，保留 Haish 的事件模型、工具分组、默认折叠、审批和问答交互，不接入 assistant-ui Runtime。

```text
ToolTimeline：read 2 files · searched 3 times（保留具体动作统计）
  ToolCall：各工具独立展开
    现有专用详情 / WebSearch / ComputerUse 浏览器详情 / 通用 JSON
Skill：图标 + 名称 + 加载状态，不可展开
```

- 工具组继续按现有连续调用规则合并，使用调用 ID 保持节点身份。
- 单卡详情在对应卡片下方展开，不重复渲染另一套工具列表。
- 终端、文件 Diff、审批、浏览器安装提示、ask_user、子 Agent 对话复用现有实现。
- 读文件、搜索文件、列目录等读类工具继续不展示长响应；没有详情的节点不增加空折叠区域。
- 通用 JSON 保留 Request / Response 切换、默认 Response、已有脱敏与截断规则；改善配色、留白、边框和滚动。
- 工具组、卡片、通用详情以及 Shell 命令/输出、文件 Diff 全部使用正文 `--conversation-font`，不单独强制等宽字体。
- 工具组、单独工具、组内工具和 Skill 的标题均按内容收缩，状态紧跟内容，使用统一间距；Shell 详情中的退出状态也紧跟命令。单独工具没有展开内容时不预留箭头空位；组内工具保留时间线缩进和对齐。
- Skill 不保留空箭头占位，图标与最外层工具组箭头对齐，名称与组标题对齐。运行中的外层工具组、组内工具、独立工具及 Skill 复用同一文字扫光样式；同组已完成或失败的工具保持静止，执行结束后停止扫光；系统减少动态效果时改为静态文字。
- 工具卡片不展示悬停提示，包括图标、状态、命令、路径、Skill 和浏览器地址；保留状态的无障碍标签。
- 模型重试提示复用 ToolCall 的静态行，移除旧胶囊边框和前置状态圆点；重试图标与外层工具对齐，状态紧跟正文同款文字。重试中显示扫光与状态旋转，恢复/失败后停止，保留原文案、尝试次数和无障碍实时播报；窄屏允许文案换行，不增加展开或悬停提示。
- 自动压缩上下文提示同样复用 ToolCall：无胶囊边框和前置状态圆点，正文字体，状态紧跟标题；压缩中扫光，完成后停止。有压缩摘要时显示左侧展开箭头，默认折叠，保留 Markdown 摘要、消息数量与压缩前后 token 统计；没有摘要时保持静态行。
- 重试和上下文压缩缺失结束事件时，未结束的状态行跟随任务终态收尾：完成显示完成、失败显示失败、取消显示取消，停止旋转及扫光；实时状态更新与历史重建一致。已收到的成功/失败结果和压缩摘要保留，不被后续任务状态覆盖。`context_compaction_failed` 即时结束对应压缩行，即使任务仍在运行。
- 工具详情滚动条沿用透明轨道和圆角滑块的样式，统一为 8px 宽、两侧各留 2px 空隙，使用低对比灰蓝色滑块，悬停时提亮；原生控件采用深色配色，保留滚轮、拖动及键盘滚动。

## 搜索与浏览器详情

`web_search` 的现有输入和返回值提供 query、results[].title/url/snippet、direct_answer。前端映射为 WebSearch 的来源列表，链接仅接受 HTTP/HTTPS，来源计数按实际数据计算，补充空结果、失败状态。

`web_fetch` 与 `web_search` 共用 WebSearch 详情组件。映射现有 subject.url、data.final_url/title/content/truncated，抓取成功后只保留可跳转的页面来源行，移除重复的网址和 Page fetched 文案；加载、失败、取消和空内容仍显示相应状态。来源行左侧的箭头独立控制正文，默认折叠，点击链接只跳转页面。正文以纯文本渲染，最多展示前 8000 字符，展开后卡片内滚动并标注截断，收起时正文和截断标记一起隐藏。仅使用实际返回的页面生成来源条目，不把等待或失败的请求当作搜索结果，不新增后端字段。

`browser_use` 的所有调用均使用 ComputerUse 浏览器面板。使用已有的 input.code、stdout/stderr 和错误字段展示代码、输出与失败信息；存在可访问 screenshot 时额外显示静态截图。Code 与 Output 各自默认折叠，点击标题或按 Enter / Space 独立展开，截图保持直接展示；错误信息仍直接可见。没有截图不会退回通用 JSON，图片读取失败也保留面板中的代码与输出。代码保留前 8000 字符，输出保留末尾 8000 字符，截断处有标记。只使用真实 URL 字段，不解析执行代码猜测浏览器位置。本次不制作实时画面、鼠标轨迹或动作回放，也不新增后端事件。

浏览器详情只展示 ComputerUse 面板，左上角三个装饰圆点使用红、黄、绿色。浏览器、搜索和抓取卡片均不附加 Request / Response 入口。通用 JSON 工具保持默认 Response。

### 截图读取的实际边界

现有会话图片预览接口只允许读取上传图片目录，无法读取浏览器截图所在的任务产物目录。为此增加 Electron `tool:read-screenshot` IPC，返回 PNG data URL：

- 只接受应用 `haish://app` 页面调用。
- 文件解析后的真实路径必须位于当前 runtime 的 `cache/workspaces/<workspace-hash>/tasks/<task-id>/artifacts/browser/screenshot-*.png`，且任务 ID 匹配。
- 校验 PNG 签名、文件类型、10 MiB 大小与 16 M 像素上限；目录外文件、跨任务引用、指向目录外的软链接均拒绝读取。
- 详情展开时才读取图片；关闭详情或切换任务后，过期读取结果不会挂载。
- 桌面端需要重新构建并重启以加载新的 preload / main。普通 Web 页面、旧版桌面桥接或已清理的截图显示不可用提示，并保留输出查看。

## Skill 提示

以已有 Skill 元数据和已知 Skill 根目录下的 SKILL.md 读取事件识别加载。读取引用脚本、普通文件、写入 SKILL.md 不重复视作 Skill 加载。名称与路径传递到最终时间线节点。

状态只表达加载中、已加载、加载失败、已取消，不将“读取指令成功”解释为“Skill 任务执行完成”。提示为不可展开的单行；后续工具仍按原有规则显示，已有子节点不得因隐藏 Skill 详情而丢失。

## 图片分析详情

`vision_analyze`、`visual_inspect`、`image_describe` 等现有视觉工具共用 VisionToolDetail，外层 ToolCall 仍默认折叠。详情采用与其他工具一致的单面板：顶部显示图片文件名，任务说明默认收起，分析结果直接展示；不使用左右对话气泡、等宽字体或 Request / Response 入口，也不添加悬停提示。长任务和结果在面板内滚动，复用统一的细滚动条。

VisionToolDetail 是项目内编写的专用详情组件，复用工具卡片的主题样式，并非 assistant-ui 上游现成的图片分析组件。

使用现有媒体路径、任务、data.text/answer、摘要及错误字段，不读取图片或增加后端接口。保留分析中、失败、取消、空结果和已有流式文本。

## 子 Agent 对话

按主会话的结构呈现嵌套对话，不接入 Subagent list 或另一套 Runtime。主 Agent 派发的任务使用用户消息的样式，身份标为 Main agent；下方为子 Agent 的流式输出和工具调用，继续复用 ChatAgentTimeline。任务、角色、系统提示和最终回答沿用现有数据与展示优先级，完成后仍展示最终回答，保留长回答的 View All / Collapse 交互。

删除旧灰色气泡的渲染结构，消息面板复用主会话 message-speech-body，正文字体、细滚动条、工具状态和独立折叠保持统一。会话与任务 ID 传入嵌套 Timeline，保持工具详情使用同一会话上下文；不增加悬停提示、进度百分比或 Request / Response 入口，不改后端。

## 接入方式与边界

沿用项目已有的 assistant-ui Elements 源码适配方式，保留 MIT 许可。将上游 ToolTimeline、ToolCall、WebSearch、ComputerUse 的结构移入共享 UI，使用已有 React、Lucide、Motion 和静态 CSS；主题、状态和详情插槽按本项目适配。

上游 ToolTimeline 没有逐步骤详情插槽；本地版本允许渲染现有 ToolCall，并使用稳定 ID。ToolCall 补全 pending/failed/cancelled/approval 状态。审批及浏览器安装提示保持在现有挂载位置，不被普通详情折叠遮挡。不会修改聊天 Runtime、后端协议或自动展开策略。

## 验证

- 模型回归：Skill 识别与去重、长读输出隐藏、搜索 URL/空结果/失败、浏览器截图与 JSON 清洗隔离。
- 交互回归：工具组和单卡独立折叠、连续同名调用、状态更新保持展开状态、Request/Response 切换、已有终端/Diff/审批/ask_user 挂载。
- 页面检查：正文同款字体、深色样式、长路径和窄宽度布局、键盘操作、减少动态效果设置。
- 完成后运行 `npm run check:web`，记录验证结果与实际限制。

### 已完成实现

| 位置 | 职责 |
| --- | --- |
| `app-web/src/shared/ui/agent-elements/ToolTimeline.jsx`、`ToolCall.jsx` | 工具组、单卡、状态和展开动效；复用已有 Motion / Lucide，未增加依赖 |
| 同目录 `WebSearch.jsx`、`ComputerUse.jsx` | 搜索/抓取共用详情与浏览器内容外框 |
| `app-web/src/features/chat/model/tool-presentation.js` | Skill 加载识别、安全 URL、搜索/抓取与浏览器数据映射 |
| `ChatTimelineNodes.jsx`、`BrowserToolDetail.jsx`、`VisionToolDetail.jsx` | 接入原有时间线、浏览器代码/输出、图片分析面板、JSON 标签页和延迟截图读取 |
| `app-web/styles/tool-elements.css` | 统一正文同款字体、颜色、间距、窄宽度布局 |
| `src/main/tool-screenshot.ts` | 受限 PNG 读取，main / preload / 类型声明同步接入 |

### 验证结果（2026-09-11）

- 一次性测试清理后保留工具卡片自动回归页；重试/压缩的运行、完成、失败、取消状态切换从手工操作补为自动断言，连同原有检查共 77 项。其余回归入口和依赖见 [测试说明](../app-web/tests/README.md)。
- 重试/压缩终态收尾修复：新增回归先复现 4 处失败，修复后相关 14 项测试全过；`npm run check:web` 通过（262 项自动测试），现有页面回归 73 项断言通过。真实时间线模型驱动的页面实测：运行时旋转和扫光开启，切换取消/完成/失败时两类动画均为 `none`。覆盖缺失结束事件、实时状态切换、历史重建、状态别名、缓存快照不变、已确认结果保留，以及任务继续运行时的压缩失败事件。

### 验证结果（2026-09-10）

- 自动压缩上下文提示换皮后，`npm run check:web` 通过（257 项自动测试），现有页面回归 73 项断言通过；实测运行态扫光、完成态静止、有摘要默认折叠且支持点击/Enter 收起、无摘要无展开入口、Markdown 与统计保留、长摘要内部滚动。状态间距桌面 8px、375px 窄屏 6px，无横向溢出。
- 模型重试提示换皮后，`npm run check:web` 通过（246 项自动测试），现有页面回归 73 项断言通过；实测重试/恢复/失败三态共用无边框工具行、正文字体、无悬停或展开入口，只有运行态扫光。状态间距桌面 8px、375px 窄屏 6px，文案无横向溢出，实时播报保留。
- 浏览器 Code / Output 默认折叠改动后，`npm run check:web` 通过（236 项自动测试），现有页面回归 73 项断言通过；实测两个区域默认关闭、点击独立展开，以及 Enter / Space 展开收起。错误信息仍直接展示。
- 子 Agent 换皮后 `npm run check:web` 通过（230 项自动测试），浏览器回归共 73 项断言通过。新增覆盖派发身份与主会话消息样式、Markdown 长回答展开/收起、流式输出、嵌套 Shell 详情和展开状态保持、无额外提示及统一字体；375px 下两个消息面板均保持在视口内。
- `npm run check:web` 通过：架构检查、230 项自动测试、ESLint、Vite 生产构建。
- `npm run typecheck` 通过：共享类型与 Electron main / preload。
- 浏览器回归页 `app-web/tests/fixtures/tool-cards.html` 自动执行 65 项断言通过，并检查默认桌面宽度和 375px 宽度布局。覆盖组与卡片折叠、同名调用独立状态、流式状态更新、Skill 无展开且子节点保留、Skill 与组标题对齐、运行中的外层组/内层工具/独立工具/Skill 扫光及完成后停止、读工具隐藏输出、JSON 默认标签/键盘操作/文本转义、搜索来源计数、截图失败回退、无截图调用使用 ComputerUse、浏览器代码/输出/错误直接展示、浏览器/搜索/抓取移除原始 JSON 入口、抓取来源去重、正文默认折叠且与链接跳转独立、抓取网址与状态、正文转义与截断、终端/Diff 组件保留、字体一致和横向溢出。另实测 Fetch 箭头支持 Enter 键展开/收起，窄屏展开后正文内部滚动，未引入悬停提示。
- 视觉工具补充覆盖：统一单面板、文件名、任务默认折叠及展开、分析正文纯文本和正文字体、长结果滚动、无悬停提示、流式分析、错误/取消/空结果，以及非视觉子 Agent 对话保留；实际后端 data.text 优先于摘要。
- 补充实测：Shell 命令、输出、退出标签和 Diff 各行的计算字体均与正文一致；工具组、单卡和 Skill 状态在桌面为 8px 间距，375px 宽度为 6px，卡片标题与详情没有残留的原生悬停提示。
- 截图读取测试覆盖正常 PNG、跨任务、目录外文件、软链接逃逸、伪 PNG、超大像素和文件大小；真实桌面 IPC 预览需在重启后的桌面会话中使用。
- 顺带补全已有 `ToolDetails` 和 `PortalTooltip` 的 `.tsx` 导入后缀，使架构检查能正确解析；没有改动这些组件的业务行为。

运行浏览器回归页：`npx vite --config vite.app-web.config.ts`，访问 `http://127.0.0.1:5173/tests/fixtures/tool-cards.html`。该页使用生产组件执行断言，不调用模型或写入会话。

## 官方参考

- [ToolTimeline](https://www.assistant-ui.com/elements/tool-timeline)
- [ToolCall](https://www.assistant-ui.com/elements/tool-call)
- [WebSearch](https://www.assistant-ui.com/elements/web-search)
- [ComputerUse](https://www.assistant-ui.com/elements/computer-use)
- [源码](https://github.com/assistant-ui/assistant-ui/tree/main/packages/ui/src/components/react/assistant-ui/elements)
