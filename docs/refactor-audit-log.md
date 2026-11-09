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

## 早期待办（第十三批复核）

1. `shared/lib/settings-sync.js` —— 仍保留。「写入方先应用响应、被跳过的读再恢复」的顺序契约
   压在一个 `setTimeout(…, 0)` 里；改成 await 会动到并发保存时序，不属纯重构。
2. `core/pet-state.js` —— 复核后不改。`buildChatTimeline` 读的是 `attemptTask` 裁过的
   单节点事件，不是整段会话；再写一套轻量活动推断会改变宠物动画的触发时机。
3. `shared/ui/ImagePreviewOverlay.jsx` —— 仍保留。复制图片失败只 `console.error`，
   补 toast 是新增用户可见提示，属于产品决策。
4. `features/conversations/model/task-runtime-requests.js` —— **已处理**：去掉 `joinBatch`，
   只留 `requestKind`（`batch` / `single` / `single-confirmation`），合并键与 404 兜底语义不变。

前两项要么触到用户可见行为，要么要先定产品语义；不是「代码级清理」。

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

### 切换失败后仍然能发送

产品约定是「切换失败 → 回退到原选择 + toast 提示失败」。回退之后配置等于服务端存着的
那一份，是可用的，所以下一次发送必须照常进行。但 `persist` 的 catch 会把失败文案同时写进
`owner.error` 与 `setError`，而 `ensureSaved` 的轮询里「error 非空就直接抛」——于是
「切换失败 → 已回滚 → 按发送」变成点了没反应，草稿还留在输入框里。这是基线 `b76c4b8`
就有的行为，不是某次重构引入的。

修法：回滚成功（有 `before` 且仍挂在当前 owner 上）时不保留错误状态，失败只由 toast 通知；
没能回滚时才保留错误，因为那种情况下配置确实不可用。测试模拟了 restore 写回 React 状态，
变异校验确认：把错误状态改回一直保留，该用例立刻红。

## 第八批：未受控草稿的真实交互验证

上一批的 hook 测试验证了读写成对，但没有渲染组件；既有 message-history 夹具又由外部传入受控草稿，不能验证 AppShell 使用的默认路径。新增离线 Electron 夹具，实际输入 A、切换 B 输入、再切回两次验证各自的草稿，通过 `npm run check:composer-draft` 单独运行。该测试不含在 `check:web`，需要图形环境；它覆盖的是 ChatPanel 到输入框的接线，不等于覆盖完整 AppShell 或所有草稿路径。

开发环境里的 Electron 路径可能指向忽略脚本参数的 Haish Dev 启动器，进程可无输出退出 0；运行器优先使用原版 Electron，并要求成功标记和零退出码，避免假绿。

本批没有改变产品行为。`context-usage` 模块默认值、接线静态检查的并集盲区和测试源码断言债仍待单独评估，不因本项测试通过而视为完成。

## 第九批：按装配点检查 ctx

原 `ctx-wiring` 将同名工厂的所有装配键取并集，因此一处传了 `b` 能掩盖另一处漏传 `b`。现在按每个可判定的装配点独立检查；已知外层 `...ctx` 使用所有外层装配点的共同键，未知展开和循环按未知处理，但不再掩盖其他可判定的装配点。输出增加已核对和无法判定的装配点数。检查器仍按名字匹配且不是完整 JS 解析器，传值是否正确、间接装配等仍不受保证。

`contracts/ctx-wiring-rule.test.js` 覆盖不同装配点、嵌套展开、未知展开、循环及函数体边界。新增用例在旧实现下失败、新实现下通过；全仓检查结果未发现新的可判定漏参。

`context-usage` 默认值未在本批删除：当前 setTotalTokens 同时更新 tracker 实例和模块级默认值，而激活、恢复、轮询和事件转换调用仍依赖该默认值。要消除隐式依赖须将上下文窗口的读取能力贯穿这些生产调用并测试配置更新、后台会话和异步恢复，单纯去掉默认值会改变行为；留待下一批处理。

## 第十批：显式零窗口不再借用全局值

`createEmptyContextUsage(id, 0)` 虽然接到显式窗口，内部调用 `normalizeContextUsage` 时却漏传第三个参数；模块级默认值非零时，归一化把零当作空值回退到那个默认值。现在把窗口继续传入，任务、会话详情、估算、空任务列表和空存储的空读数也因此尊重显式零。测试先确认旧实现返回 200000 而失败，修复后通过。此改动仅影响显式指定零窗口且全局窗口非零的情况；不改变调用方省略窗口时的旧默认行为，也没有消除模块级默认值。

## 第十一批：窗口归 tracker 实例所有

删除模块级窗口与全局配置入口。`createContextUsageTracker` 持有当前分母；AppShell 在 agent catalog 更新时设置它，激活、分页恢复通过绑定 tracker 的读数转换器在使用时取值，后台轮询与实时流也显式取得当前值。设置更新后已装配的处理器和后台流仍读取新值，不捕获过期数字；两个 tracker 的窗口互不影响。生产调用不传窗口时纯函数默认零；流和轮询的测试夹具可省略窗口读取器，默认为零，不能因此认为接线错误一定会被静态检查发现。

覆盖包括实例隔离、显式零、读取缓存重算、激活后更改窗口、后台流事件省略分母以及既有压缩/恢复/仲裁测试。未执行全量真实应用交互测试，不能以单元测试替代所有用户路径验收。

剩余决策（其中任务请求合并已在第十三批处理）：设置同步的 timer 涉及并发保存时序；图片复制失败提示及批注高亮寿命属于用户可见产品决定，仍不擅改。

## 第十二批：工作流分支合法值唯一来源

工作流边的读入与 payload 保存过去各自维护六个合法分支，两处必须同步。现在共用 `isWorkflowEdgeBranch`，但读入仍保留大小写、空白和 `default → false` 归一化，保存仍只接受原样合法值；没有把两种输入语义合并。新增行为测试覆盖六个值、别名、大小写、无效值及保存结果，对应重复数组白名单已删除。

## 第七批：三条接线静态规则、两个大文件第一批、纯逻辑抽 model

### 接线规则（新增 `scripts/architecture-rules/`）

测试栈没有 DOM，「读一处、写另一处」这类错误测不出来。三条静态规则补洞，全部纯检查：

- `render-ref-mirrors`：盘点 29 处 render 期 ref 镜写，其中 4 处有第二处承载、4 处进白名单。
- `duplicate-string-arrays`：88 个字符串数组 → 4 组跨文件重复。
- `ctx-wiring`：24 个工厂，21 个可静态核对，0 个「无法判定」。这条能拦住本仓真实发生过的事故
  ——`createDraftConversationHandlers` 少递两个键，整条「向上翻页加载更早步骤」挂在
  `applyContextUsage(latestContextUsageFromTasks(...))` 上，当时 1604 条测试全绿。

白名单每条带中文理由，条目失效时会提示删掉。变异校验：临时从 `createSettingsHandlers` 的装配点
删掉 `API_BASE`，检查器准确报出「解构出但没有任何装配点递进去」，还原后通过。

### 两个大文件

- `ApprovalOverlay` 714 → 605：展示规则进 `model/approval-presentation.js`，决策分发进 api。
  `selectRuntimeRequest` 此前零行为测试、只有 7 条源码断言；`RISK_TEXT` / `runtimeSummary`
  此前没有任何断言，现在按全表覆盖。
- `createDeployHandlers` 694 → 633：抽活动任务选择、停止回滚快照、部署请求构造、上传包装到
  `tasks/model/`。三件套 `handleStop` / `startDeploy` / `handleDeploy` 保持同文件——三者共用
  `stopPromise` / `stopError` 竞速协议。13 条源码断言一条都没改。

两处都做了大规模对拍（1302 组 / 338 组），并坚持「构造期不读 ctx」，所以 `node-runtime-config`
只传 4 个键、`deploy-target` 只传 9 个键的测试照旧通过。

### 纯逻辑抽 model 换行为断言

`WorkflowFlowNode.jsx` 的节点端口、边外观、节点展示三类纯函数进 `workflow/model/`，
16 条源码断言换成行为断言（端口矩阵、角色表 deepEqual、paintState 的 1008 组对拍）。
基线 1398 → 1383。

### 一条纪律：不留 re-export 转发

两批 worker 都想用「组件文件里 `export { ... }`」保住旧 import 路径，都被改掉了——
消费方改为直接从 `model/` 取。转发会让「这段规则归谁」重新变成要看两处。

## 第十三批：跨文件重复词表清零

`duplicate-string-arrays` 从 3 组降到 **0 组**，白名单里对应的三条一并删除。

- **工作流可执行节点类型**：运行态详情、重试入口、待处理请求落点三处合到
  `core/workflow-defaults.js` 的 `isWorkflowExecutableNode`。它们本来就要求同一集合，
  新增节点类型只改一处。
- **页签键盘导航**：键表与目标计算抽到 `shared/lib/tab-navigation.js`，消息里的
  Request/Response 与运行态详情的 Config/Result 共用。现有两处都只有两个页签，
  Home/End 与左右循环的结果和旧实现逐字等价；单测另外锁定了「3 个以上页签逐格移动」
  的语义，避免以后新增页签时退回「总是跳到第一个非当前项」。
- **LLM provider 分区**：`isLlmProviderSection` 收进 `settings-navigation.js`，
  覆盖导航计数、测试按钮、Add provider 文案、删除与保存路由共 8 处。

`fetchCoalescedTaskRuntimeBatch` 去掉 `joinBatch`，只保留 `requestKind`：
`single-confirmation` 表示批请求 404 后的独立确认 GET，能否并入批租约由种类推出。
合并键与旧实现完全相同（`single-confirmation` 后缀）；确认 GET 仍可并入普通 single、
不并入 batch。`task-runtime-single-batch` 11 条全部通过。
这是参数收敛，不改变 404 兜底语义。

对拍核对（旧实现在 `requestKind: 'single'` + `joinBatch: false` 下算作 confirmation）：
两个并发确认在旧实现下同样是 1 次传输，合并键逐字相同，因此不是行为变化。

`runtime-workflow-layout.test.js` 删掉的两条源码断言原本钉的是字面量词表；
换成 `isWorkflowExecutableNode` 后无法再用字面量匹配。该函数本身由 `workflow-attention`
的行为测试锁定，但「运行态详情页确实调用它」没有 JSX 测试基座，目前只能靠代码审查。

`pet-state` 复核后不改：`buildChatTimeline` 读的是 `attemptTask` 裁过的单节点事件，
不是整段会话；再写一套轻量活动推断会改变宠物动画的触发时机。
`settings-sync` 的 0ms 收尾仍保留：它保证写入方先应用响应，再让被跳过的读恢复；
改成 await 会碰到并发保存的顺序。图片复制失败提示、批注高亮寿命仍需产品决定。

## 第十四批：设置保存后的读恢复不再藏在裸 setTimeout 里

`finishSettingsRequest` 里的 `setTimeout(() => invalidateSettings(...), 0)` 是一条没有名字、也没有测试的
顺序契约：写入在 `response.json()` 的 `finally` 里收尾，调用方之后才把 payload 写进 React 状态，
所以恢复被跳过的读必须跨一个宏任务。

本批没有改时序（去掉边界需要改 8 个写入方的状态应用时机，不属于纯重构），改的是它不再隐式：

- 抽成唯一入口 `scheduleSettingsRecovery(resources)`，注释写明为什么必须是宏任务、为什么不能换
  `queueMicrotask` / `Promise.then`。
- 计时器登记在 `recoveryTimers` 里；`resetSettingsSync()` 一并取消。此前它只清 `entries`，上一个用例
  排着的恢复会在下一个用例里凭空 bump epoch——测试之间因此有隐性耦合。
- 新增三条用例：写入方先应用、恢复随后且只一次；写期间的读被推迟、写完后恢复可读；reset 取消
  待触发恢复。前两条分别用变异验证过（把恢复改成同步、把 reset 的清理删掉都会立刻红）。

剩下的风险写在明处：这条顺序靠宏任务边界保证，不是类型或结构强制；若将来某个写入方在响应之后
再 `await` 一次才应用状态，边界仍可能被绕过。要彻底消除得把「应用响应」变成显式的
`applySettingsResponse(payload)` 并让每个写入方调用，那会新增 8 个必须记得的调用点，本批不做。

## 第十五批：阈值以下的重复词表与测试基座耦合

前几轮只看到检查器报出来的重复（成员 ≥3 的数组）。这次按「这两处必须一起改吗」重扫，
找出四组阈值以下、一直绿着的隐藏链接：

- **工具进行中状态** `pending|running` 散在 10 处（`core/tool-grouping`、`core/chat-timeline`、
  `tool-view/{checkpoint,file,terminal,search}`、`tool-view.js`、`approval-placement`、
  `pending-user-input`、`approval-presentation`）。新增 `core/tool-status.js` 的
  `isToolInFlight`，全部改读它；刻意不做大小写归一，保持各调用点原先的严格比较。
  `tool-view/agent.js` 的 vision 特例保留——它问的是另一个问题（空状态在 vision 下算 pending）。
- **任务存活状态** `running|queued` 在 `core/run-status.js` 与 `core/chat-timeline` 各写一份。
  拆出 `isLiveTaskStatus(status)`（只判状态、不看落地标记），`isTaskLive` 与时间线缓存共用；
  `isTaskLive` 仍先做小写归一，时间线仍按原样比较，两处语义不变。
- **执行模式校验** `['chat','bot']` 在 `workspace-state.js` 四处、`useConversationBootstrap`
  一处。加 `EXECUTION_MODES` / `isExecutionMode`，五处改读；渲染分支里的 `mode === 'bot'`
  不动，那是行为差异不是词表。
- **工作流事件节点 id** `eventNodeId` 在 `core/node-attempts.js` 与 `WorkflowRuntimePage.jsx`
  各一份（探测脚本按函数体比对出来的唯一一组跨文件重复）。改成 core 导出、运行页 import。

顺带清掉三个只在本文件内使用的导出（`postApprovalDecision`、`postBrowserRuntimeDecision`、
`RECORD_KINDS`），减少死的对外接口。

**测试基座**：`tests/features/schedules/hook-harness.js` 原来把源文件的 import 全剥掉，要求每个
用例手写沙箱绑定——hook 多一个 import 就 `ReferenceError`（本批加 `isLiveTaskStatus` 时当场炸）。
现在基座自己 `require` 同名模块补具名绑定，调用方的 stub 优先；以后给 hook 加 import 不用连带改测试。

验证：`check:web` 全绿（1662 测试通过、334 源码模块、跨文件重复数组 0 组、lint 零警告、构建通过），
`git diff --check` 干净。改动都是同一布尔判断的等价替换，未触碰用户可见行为。

剩余的系统性问题不在「词表抄了几份」这一层：`AppShell.jsx` 仍是 884 行组合根，`contracts/*`
里约 542 条源码结构断言缺 JSX 测试基座，图片复制失败提示与批注高亮寿命需要产品决定。
