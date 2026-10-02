# 定时任务 UI 接入

## 交互
- `/schedule` 是输入框操作，与 skill 共用 slash 面板，使用 Clock 图标；选择后打开配置，不发消息、不立即执行。键盘、鼠标和发送按钮行为一致。
- 只配置「做什么、什么时候」：一次性本地日期时间、每 N 分钟、五字段 cron + IANA 时区。定时任务不保存模型快照，实际执行时读取绑定会话最新 provider/model、agent/workflow 和节点配置。
- 默认绑定当前会话，无会话选择器。空白页保存时复用草稿 materialize 流程，只建一次真实会话；API 失败保留该会话便于重试，不删除或另建替代会话。取消未保存表单不创建会话。
- 会话列表尾部常驻 Clock 提醒（含暂停/完成但未删除的任务）；独立于运行状态灯，不因 hover 隐藏。点击仅打开该会话任务管理，不切换会话。
- 管理支持修改指令/时间、暂停、恢复、确认删除、运行历史分页。错误直接展示，不兼容旧接口、不自动更换模型或放宽权限。
- 提示本机应用需要运行，关机期间不补跑；任务结果和审批沿用原会话。

## 非原生时间控件（2026-10-01）
- 时间类型复用 `shared/ui/settings-elements/ui/select.tsx` 的 Radix Select；不引入另一套下拉实现。弹层显式挂载到 body（Radix 保持嵌套模态焦点关系），避免落入隐藏设置页 portal，或受动画弹窗 transform 影响产生定位/ResizeObserver 循环。
- 工程没有现成 Calendar / DateTimePicker。新增 schedules 领域日期时间组件，复用现有 Radix Popover，使用月历 + 24 小时时/分数字输入（非原生 date/time 控件）。日历支持月份切换、方向键、Home/End、PageUp/PageDown、Enter/Space 选日，Escape 关闭弹层并返回触发按钮；保持分钟精度和本地时间语义。
- 创建和编辑共用控件；保留已有未来时间与 DST 缺失时间显式校验，不改 API 字段，不引入日期库或原生控件兜底。
- 验证包含无原生 select/date/time 输入、鼠标/键盘选项、日历跨月/闰年、时分修改、弹层层级/焦点及保存字段。

## 弹窗视觉优化
- 顶部说明精简为 `Runs in this conversation. Keep Haish open.`；调度规则不变。
- 定时弹窗、When / Date and time 标签、字段值、下拉菜单和日历均显式使用 `--conversation-font`（霞鹜文楷），避免 portal 继承 body 系统字体。
- 仅定时组件采用中性灰底色、边框、选中态与焦点环；保存按钮以浅灰强调，取消按钮保持低对比。增加说明到表单的间距，不改共享弹窗默认配色。全部表单字段（文本域、Cron、时区、间隔、时分、When 和日期时间触发器）聚焦时均保留普通细边框，不增加 outline、box-shadow 或高亮边框；日历日期和操作按钮的键盘焦点提示保留。

## 管理卡片布局（参考图优化）
- 管理弹窗恢复优化前的 400px 宽度（窄屏保留两侧 16px）、18px 标题、12px 说明与 13px 卡片正文；图标、行距、按钮同步收紧，不使用整体缩放。保持中性深灰背景、霞鹜文楷和简短说明；创建/编辑表单不改变配色、时间控件和无聚焦高亮规则。样式仅作用于定时弹窗。
- 每项任务使用独立圆角描边卡片：文档图标 + 两行截断的任务标题（完整内容保留在 title 与可访问文本中），右侧状态胶囊。自动名称不重复指令，自定义名称保留并显示指令。
- 下方以图标、标签和值分行展示 Schedule、Next run、Timezone，信息行之间有细分隔线；Cron 使用独立表达式标签，时区单列展示。Cron 的下一次时间按其 IANA 时区显示，其他规则按本地时区显示，避免时间与时区误配。
- 去掉 Model 整行，仅调整展示；执行时读取会话最新模型配置的契约不变。
- 底部四个带图标的等宽按钮：蓝色 Edit、中性 Pause/Resume 与 History、红色 Delete；状态 active 为绿色、paused 为黄色、completed 为灰色。窄屏按钮改为两列，长字段自动换行，底部 Close 独立分隔。
- 保留 busy/disabled、删除二次确认、历史分页、实时更新和错误展示；无接口变更、兼容或兜底。

## 分层与契约
- 新增 `features/schedules/{api,model,hooks,components}`。API 使用 shared apiFetch；纯时间/slash/事件规则放 model；Provider 管理快照与 dialog 生命周期，通过显式 context 供输入框和列表消费，不用可变全局注册表。
- REST `/api/schedules` CRUD，`/{id}/pause|resume`，`/{id}/runs?limit=50&offset=N`。创建始终传 conversation_id、message、schedule；编辑只改指令/时间，不接受 options。模型配置独立持久化到 GET/PUT `/api/conversations/{id}/run-config`：输入框先读取再同步模型/推理强度和 workflow 节点变化，串行写入，失败可见；空白页物化后及保存定时前等待最新同步完成。普通 chat 消息同步本轮选择；Bot 继续省略消息的全局模型参数，不反写覆盖 UI 的会话配置；定时事件使用会话/事件模式，不读 job.options。缺失/失效配置失败，不从旧快照、历史任务或默认模型回填，无迁移/兼容层。
- Electron main 复用 `/api/events/ws`，preload 暴露 onScheduleEvent；转发 schedule.event 及带 schedule_id 的 task.event/task.end，普通流保持原路由。重连发送 resync，重新读取任务快照与正在执行的会话状态。
- 定时 task.event 进入现有 runtime 事件处理器，明确指定 conversation owner，不调用普通消息发送入口，不改当前会话。定时入口不再自行拼装会话摘要缓存、任务恢复或列表镜像：与普通会话共用 ensureConversationRuntime、restoreLatestTaskRuntime 和 flushRuntimeTasksToWorkspace。只有摘要的 runtime 保持 shellSeeded，打开时走普通会话详情加载；运行中也合并历史正文但不覆盖实时任务/缓冲区。仅延迟读取旧任务事件日志，不能延迟或跳过已有回答正文。重连恢复沿用普通任务恢复并以事件版本防止旧响应覆盖实时流；不迁移/回填用户数据。
- AppShell 仅装配 Provider、草稿 materialize 和 runtime 事件回调，遵守 2000 行上限；样式放静态 schedules.css。

## 定时执行防休眠（2026-10-02）
- Electron main 将定时执行 run_id 独立计数，与普通任务流合并驱动现有 `prevent-app-suspension`，不依赖前端窗口/当前会话；queued 与未来计划不计数。运行期间屏幕仍可熄灭、锁屏，不承诺阻止手动睡眠/合盖，也不新增 OS 唤醒。
- 收到定时 task.event 或 run_updated/running 即持有；task.end、run_finished 或运行终态释放。重复事件幂等，多任务最后一笔结束才释放；暂停/删除定义不释放仍在执行的任务。
- 主进程启动即保持唯一实时连接，窗口关闭后仍监听。新增 `schedule.activity.snapshot` 命令返回服务内存中实际活跃的定时 run_id（含定义已删除的执行），连接建立与每 15 秒核对，弥补断线/队列丢事件。断线不取消后端任务，保留定时计数直到重连快照核对；快照请求期间发生的实时事件优先，避免旧响应覆盖新开始/结束。失败记录并重试，不以失败当作空快照。退出显式释放。
- 不修改用户任务、调度数据或模型配置；无旧接口兼容或默认兜底。

## 验证
- 定时防休眠：新增 8 项可执行回归覆盖真实 main 消息分流（无窗口订阅者）、幂等/并行/普通任务共用断言、终态释放、删除定义保留、快照失败与竞态。前端 `check:web` 777 项通过，架构 174 模块、lint、构建、typecheck、Electron 编译及两仓库 diff 检查通过；后端相关测试 150 项与 27 子测试通过（含 WS 活跃快照、owner 隔离、删除定义后的活跃执行），全量回归 2002 passed / 49 skipped / 359 subtests passed；编译后 activity/sleep 模块执行检查通过。未重启用户桌面进程，未做真实到点或整机休眠验收；需重启桌面开发进程加载 main 与后端。保留原有大分片警告。
- 统一会话加载/恢复：移除定时专用 seed/mirror 和重复任务恢复；新增 6 项跨模块回归（全部历史回答、运行中打开、普通运行中壳、恢复响应竞态、owner 错配、新手动任务占用）。`check:web` 769 项、架构 174 模块、构建、`typecheck` 与 diff 检查通过。只读使用实际问题会话记录重现选择/恢复路径，17/17 回答加载且逐条一致；未修改用户存储，未在真实桌面进程中刷新验证。保留已有构建大分片警告。
- 紧凑尺寸与去除 Model 行：恢复 400px 面板及原字号；`check:web`、`typecheck`、diff 检查通过，浏览器 fixture 60 项通过，390px 窄屏无卡片溢出。仅改展示，不改模型同步与执行。
- 参考图卡片优化：`check:web` 763 项通过、架构 174 模块通过、构建与 `typecheck` 通过；浏览器 fixture 58 项通过（图标信息行、状态、等宽操作、颜色、Cron 时区、长指令与完成态），390px 窄屏截图/布局检查通过，无卡片溢出且操作两列排列。保留已有大分片警告。
- 最新会话配置变更：`check:web` 763 项通过、架构检查与构建通过、`typecheck` 通过；定时浏览器 fixture 48 项通过（含创建后切换模型实际同步，定时 payload 无 options），workflow fixture 42 项通过；无真实模型调用。
- 视觉优化：浏览器 35 项通过，新增简短说明、标签/字段字体、portal 字体和中性灰配色的 computed-style 验证；字体资源加载与弹窗/月历截图检查通过。
- 非原生控件本轮：新增 4 项日历规则测试、1 项复用/禁止原生控件契约；浏览器 fixture 30 项全部通过（包含创建/编辑、焦点、Escape、跨月和时间保存），无运行时错误。不引入新依赖或原生控件兜底。
- 接入验证：`check:web` 750 项通过（含定时模块 10 项）、ESLint 与生产构建通过；`typecheck` 通过；浏览器 fixture 16 项通过。保留 Vite 大分片体积警告，不新增兼容路径。
- 未做真实模型/桌面到点执行演示，未修改用户会话或发布安装包；重新启动桌面开发进程使新的 main/preload 生效。
- 单测覆盖时间转换、slash 操作、请求字段、事件 owner 与删除提醒；浏览器 fixture 覆盖 slash / dialog / sidebar 图标与保存交互，不调用模型。
- `npm run check:web`、`npm run typecheck`、`git diff --check`。桌面本地 runtime 的到点执行依赖后端已完成的集成测试，不能把静态 fixture 当真实模型执行验收。
