# 重构审计记录

审计范围：untangle-codebase 的「特殊案例」与四类关联问题，覆盖 `app-web/src` 全部源码。
结论按「已修 / 测试锁定的误解 / 故意不修 / 待办」分类留档，避免下次重新审一遍。

## 已修

| 位置 | 问题 |
| --- | --- |
| `core/run-status.js` | `terminalNoticeStatus` 自列第三份状态别名表；改读 `normalizeTaskStatus` + `isTerminalStatus` |
| `core/task-runtime.js` | 可见事件集合里带着 `final_answer`，而 `buildChatTimeline` 从不渲染它——空壳会因此不回滚 |
| `core/workflow-catalog/labels.js` | `WORKFLOW_FIELD_LABELS` 是恒等映射，25 行表等价于 `item.fieldId` |
| `core/workflow-catalog/nodes.js` | 默认输出映射/schema 与已有常量逐字重复，改引用 |
| `core/tool-view-shared.js` | `isToolFailure` 抄了 `tool-trace-status.js` 的失败判据；改为复用 |
| `core/tool-presentation.js` | 8000 / 1000 截断值手写 6 次，提成命名常量（输出文本不变） |
| `core/tool-presentation.js` + `core/runtime-events.js` | skill 根目录清单两套：事件流只认 `.skills(-src)`，真实安装根里的 skill 取不到名字；归一成 `skillNameFromPath` |
| `core/chat-timeline.js` | toolItem 构造在「事件流」与「toolCalls 兜底」两条路径各写约 40 行；抽成 `buildToolItem` |
| `shared/lib/local-image-path.js` | 图片扩展名写了两遍（正则 + 拼进大正则的片段）；由同一个源生成 |
| `shared/api/base.js` | 模块顶层硬读 `window.HAISH_API_BASE`，让纯数据投影链在 Node 里整体加载失败；改为容错 |
| `shared/lib/conversation-load-perf.js` | 自述 `TEMPORARY` 的启动探针仍在生产链路（改写每个会话响应、挂 subtree MutationObserver）；删除 |
| `features/workflow/model/node-reasoning-options.js` | 一行包装，声明 `model_id` 却从不读；调用点直接用 `REASONING_EFFORT_OPTIONS` |
| `features/conversations/hooks/createConversationRuntime.js` | 四个字段 setter 逐字复制同一骨架，合成 `runtimeFieldWriter` |
| `features/conversations/model/workspace-state.js` | 任务映射参数默认恒等，漏传会静默产出 summary 形状；改为必需，并补上 `createDeployHandlers` 那处漏传 |
| `features/app/AppShell.jsx` → `conversations/model` | 「本地拷贝 + 目录拷贝」合并抽成 `conversationSettledTaskIds`，接线从此可测 |
| `shared/lib/toast.js` | 跨层提示的事件名与 payload 形状原先分散硬写；收成 `notifyToast` / `onToast`，并补行为测试 |
| `features/app/hooks/useLocalFileLinks.js` | 解析根在 effect 里写，Markdown 首帧读到空根、相对链接晚一帧才成立；改为渲染期幂等写入 |

## 测试锁定的误解

- **`task-runtime.js` 的 `serverFinished` 只认 `done` / `failed` / `cancelled`，不是漏洞。**
  `tests/features/tasks/task-runtime-paging.test.js` 明确要求它不认 `completed` 等历史别名：
  合并后的列表会拿本地拷贝覆写目录写下的落地标记，认了别名就检测不出「拷贝停在半路」。
- **`node-attempts.js` 的 `goalJudgeInput` 特判 Goal 工作流不是「通用投影里的意外特判」**——
  函数名就是它的职责边界。

## 故意不修

| 位置 | 理由 |
| --- | --- |
| `useConversationRunConfig.ensureSaved` 与 `attempt-run-config.waitForAttemptRunConfig` | 看着同构，但前者要查挂载状态、会话归属、保存阻塞原因；合并等于把 React 生命周期塞进通用函数 |
| 「从事件里取文本」的回落链（`message-text` / `stream-events` / `progress-text`） | 字段优先级不同是有意的：子 agent 事件用 `message` 承载叙述，增量流用 `delta`。统一会改显示文本 |
| `provider-brand.js` 与 `runtime-events.normalizeProviderKey` | 前者「model id → 图标品牌」，后者「provider 字段 → 协议标签」，词表重叠但语义与默认值不同 |
| `workflow-catalog/layout.js` 与 `runtime-workflow-layout.js` | 两套自动排版（列数、回环规则不同），统一会改变用户看到的图 |
| `tool-presentation.js` 改用 `compactToolText` | 两者截断后的尾部标记不同，统一会改用户可见输出 |
| `contracts/*` 里的 JSX 结构断言 | 仓库没有 JSX 测试基建（无 SSR/jsdom 先例）；先抽可测函数，再逐批替换 |
| `AppShell.jsx` 881 行 | 组合根，30+ state 全向下分发；逻辑已在 `useShellHandlers` / `useShellRuntimeWiring` |

## 待办

1. `shared/lib/settings-sync.js` —— 「写入方先应用响应、被跳过的读再恢复」的顺序契约压在一个
   `setTimeout(…, 0)` 里。改它要么动保存时序、要么让 `finishSettingsRequest` 返回可 await 的收尾，
   两种都会碰到并发保存的边界。
2. `core/pet-state.js` —— 为了算一个表情把整棵 chat timeline 构建一遍。轻量化等于重写活动推断，
   会改变宠物动画的触发时机（用户可见）。
3. `shared/ui/ImagePreviewOverlay.jsx` —— 复制图片的失败只 `console.error`，界面无反馈。
   现在有 `notifyToast` 可以接，但这是新增用户可见提示，属于产品决策。
4. `features/conversations/model/task-runtime-requests.js` —— 通用合并器里混进调用方词汇
   （`joinBatch` 只为 404 后的独立重取服务）。改动会变请求合并键，需要先确认合并语义。

这四项都不是「代码级清理」，而是要么触到用户可见行为，要么要先定产品语义。

## 第四批：special cases 系统审计（分类扫全量）

按 skill 的五类（单值 if / 单调用者参数 / 吞异常 / retry-sleep 魔法数字 / 禁用测试）扫
`app-web/src` 全量，61 组约 93 个站点，判定「真该改」23 组。禁用测试确认为 0，销项。

已修：
- **工具名特判补进登记表**：`ask_user` 四份副本、`write_stdin`/`todo_write` 在 chat-timeline 各两份、
  `list_checkpoints` 两处、`write_file` 进行时 label、`copy_file` 产物字段、`exec_command` 审批文案。
  chat-timeline 的两处只有谓词一致、动作体不同（`tool_call_started` 只置 running 并登记 callId，
  回填循环要 `mergeTerminalResult` 且总是标 seen），所以只收谓词、两份体各自保留。
- **设置记录 id 簇** 13 个站点收敛成 `RECORD_KINDS` 表；测试把改前实现逐字留作 legacy 基准，
  24 组输入深比较，并做变异校验证明对拍不是空转。
- **设置加载退避**两处共用 `retryWithBackoff`，数值各自保留（见架构文档）。
- **供应商能力** 8 处 `=== 'custom'` / `=== 'ollama'` 收敛成 `PROVIDER_CAPABILITIES` 三列。
  多出的一列 `exposesModelOptions` 是按行为倒推的：custom 没有预设模型，但它发现到的
  `model_options` 必须继续可用，两点不能合成一列。
- **活动词表翻译** 原先靠 `ChatTimelineNodes` 一行三元把 composing/working 对调缝合，
  现在只在 `ActivityOrb` 的库边界发生。
- **CSS.highlights** 收进 `shared/lib/css-highlights.js`，按特性分组清理。
- **上下文表盘分母**从模块级 `let` 改成签名可见的 `contextWindowTokens`。没做全量线程化：
  读这个值的源码调用点有 11 处、散在四个文件，而「当前窗口」只在 AppShell 的 agent-catalog
  回调里出现；漏掉任何一条通道都会让分母变 0、比例与超限判定静默变化。只做到签名可见 +
  单一注入点，并补了基线测试供后续对拍。

### 测试覆盖不到的地方（人工守）

`ChatComposer` 未受控时应该订阅草稿 store 的**读写两侧**。曾经有一版只把 store 的 `draft`
拿来当值、却继续往组件内 `localDraft` 里写：屏幕上能回显文字，store 永远是空串，切会话再切回来
草稿就没了——而全部 1604 条测试仍然全绿，因为没有任何测试渲染 `ChatComposer` 的这条接线
（`per-conversation-draft.test.js` 只驱动 hook 本身）。这类「组件内部接线」在现有测试栈里测不到，
只能靠 review 和 Electron 冒烟；改草稿相关代码时请显式检查读与写是否来自同一处。

### 明知的重复，不动

- `ProviderIcon` 的品牌映射与 `normalizeProviderKey` 的协议标签：一个是图标品牌，一个是协议名。
- `resolveAgentActivity` 能产出的词与 thinking-orbs 库的词：已用冻结表翻译，但两套词表仍并存
  （库还有 connecting/weaving/breathing/shaping 等应用不产出的状态）。
- `settings-payload.js` 里 `RECORD_KINDS.defaultAuthMode` 与 `LLM_PROVIDER_OPTIONS[].defaultAuth`
  取值相同：前者是能力表一列，后者是设置目录一列，合并要动目录形状。

## 第五批：接线可测化 + 特判收尾

### 草稿接线从「组件内部」提到可测的 hook

`useComposerDraft`（`features/chat/hooks/useComposerDraft.js`）只返回成对的
`{ draft, onDraftChange }`：受控走 props，未受控走外置 store。读写分叉在结构上不再可能。
`composer-draft-wiring.test.js` 六条覆盖两种模式、切会话、空串受控、多订阅者共享。
变异校验：把写入改回不落 store，4 条立刻红——证明这组测试真的守着那条断链。

原来这条接线在 `ChatComposer` 里是两个三元表达式，没有任何测试渲染它；上一轮那次
「屏幕能回显、store 永远空」的断链就是从这个盲区漏过去的。

### 工具名特判全部收干净

上一批遗留 6 处 + 1 处同类（`tool-grouping.js` 里 ask_user 不进分组），现在源码里
不再有 `=== 'ask_user'` / `=== 'write_stdin'` / `=== 'exec_command'` 这类字面量判断。
两处需要独立的窄集合而不是复用终端全集：

- `TOOL_TERMINAL_COMMAND_NAMES`（只有 exec_command）：`write_stdin` 虽共用终端卡，
  但它的标题必须走 `Sent input` / `Interrupted process`，用宽集合会把它变成 `Shell yes\n`。
- `tool-view/agent.js:276` 的结果合并反过来要用终端全集，因为那里问的是「这张卡是不是终端卡」。

对拍 136 行逐字一致，唯一差异是带空格的 `' ask_user '`：以前判 false，现在判 true。
这是与其余四处同类判据（本来就走 `normalizeToolName`）对齐的结果，属修正而非回归。

### 批注跳转高亮的归属错位：查清了，决定不动

`jump()` 在 effect 之外设 `annotation-focus`，而同组 effect 的 cleanup 会整组清掉它。
把时序摊开后的实际情况是：常见路径（目标行已在窗口内）ChatPanel 不重渲染，高亮能停住；
只有在下一次批注记账时悄悄**降级**成普通批注底色（同色相，alpha 46% → 21%），
不是每次跳转都闪一下消失。

不修的理由：高亮该活多久从没定义过（全仓没有计时器、没有测试、没有文档），
改成「保持到下次跳转」是产品决定，不该混进纯重构。已在 `jump()` 处留注释写明归属。

### 待办里剩下的

- 源码文本断言 1531 条（`tests/contracts/` 占大头）。
- `context-usage` 的 11 个调用点仍靠默认参数兜底。
- 两处 50ms 忙等循环整段复制（`waitForAttemptRunConfig` vs `ensureSaved`）。
- `ApprovalOverlay 714` / `createDeployHandlers 694` 未拆。

## 第六批：修准源码断言的度量，合并忙等循环

### 健康度检查器原来在骗人

`check-test-health.mjs` 有两个口径缺陷，合起来让「基线只许降」形同虚设：

1. **同名变量重复累加**。同一测试文件里常见 `const source = readFileSync(...)` 每个用例读一次，
   收集变量时没去重，于是 `source` 在数组里出现 5 次，它的每条断言被算 5 遍。
   `error-surface-unification.test.js` 实际 25 条，基线记的是 **110**。
2. **`assert.ok(src.includes('...'))` 完全不计**。这同样是「源码文本变了就红」，
   却整类开了免检通道；`browser-runtime-layout`（27 条）、`compact-providers`（11 条）、
   `image-providers`（3 条）在基线里干脆是 0。

两处都修掉后重锁基线：**1531 → 1432**。其中去重修正 −174，口径补全 +75。
虚高的基线比没有基线更糟：它让新增断言只要没顶破那个假数字就静默通过。

教训：度量工具本身也需要一次对拍——拿一个已知条数的文件比一下。

### 50ms 忙等循环合并

`shared/lib/poll-until.js` 收走了「deadline + `min(50, 剩余)` 休眠 + 超时抛错」这段骨架，
`waitForAttemptRunConfig` 与 `ensureSaved` 各自只保留「怎么算落定」的检查函数。
关键细节照旧：间隔是 `min(50, 剩余时间)`（收尾会出现 20ms 那拍），deadline 判定在 check **之后**。
超时文案此前两处各写一遍字面量，现在只有 `attempt-run-config.js` 一处定义。
对拍用假时钟记录每拍休眠毫秒数，9 + 6 个场景的序列与错误文案逐字节相同。

### 一处行为回退

上一批给「发送时配置预检失败」加的 toast 撤掉了。查证后发现两件事：切 Agent 失败本来就会
toast（`useConversationRunConfig.js:92`），再加一条是重复；而 `persist` 失败时会把选择回滚，
配置其实已经干净，真正卡住发送的是残留的 `error` 状态（`ensureSaved` 见它非空就直接抛）。
所以那不是「缺提示」，是「回滚后没清错误」。改动已回退，缺口记在待办里，等定了方案再动。
