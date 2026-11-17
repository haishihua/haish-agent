# 生产 Haish Workflow UI 验收问题汇总

> 当前提交说明（2026-11-17）：下文是历史验证记录，不代表最新构建已完成 UI 验收。后续节点主题/紧凑控件、共享 Select、AlertDialog、启停接口与 toast、草稿丢弃、四边端点、连接方向保留、有效连接预览、线上删除入口及 End 箭头调整已实现并构建；新增交互仍待 Haish Dev 实测。提交前定向测试 18/18 通过。端点契约已同步为 6px 无常态光晕、透明扩展命中区，取代旧 9px/11px 放大发光断言。

## 范围与结论

环境：已安装 `/Applications/Haish.app`；通过真实 UI 操作，不以开发源码推断生产行为。未修改产品代码、Goal Loop 或其他用户流程，未运行模型或工具任务。

验收未全量通过。八类节点均已查看；编辑和部分连线有实操证据。最小 Start → End 已成功保存并重新打开。含 Agent、Condition 的流程存在保存阻塞；完整审批/循环分支连线、运行语义和所有样式状态未完成验证，不能记为通过。

## 已确认问题

### WF-01 高：新增 Agent 后保存失败

复现：新建 Workflow → 命名 → 添加默认 Agent → Save。
实际：`node 'agent_1' references unknown workflow node 'agent'`。
切换 Task Assistant 为 Simple Agent 后再次保存，错误相同。未添加自定义参数时已经复现，排除“添加输入参数才引发”的早期猜测。
期望：新增默认节点可保存，或给出可定位、可修复的配置提示。
边界：引用来源尚未确定；不能仅据此归因于某个字段。

### WF-02 高：Condition 即使改为常量也存在未知节点引用

复现：打开成功保存的 Start → End 最小测试流程 → 添加 Condition → Expression 改为 `true` → Save。
实际：`node 'condition_1' references unknown workflow node 'agent'`。
随后创建了 Condition → End 的 False 分支，保存仍然同样失败。
期望：常量条件不应依赖不存在的 agent；内部默认配置应保持一致。
补充：无 Agent 时新增 Condition，初始表达式仍为 `{{nodes.agent_1.success}} == true`。

### WF-03 高：End 输出字段重名会合并字段并覆盖数据源

复现：End → Structured JSON → 已有 answer（User message）→ Add Field 得到 field_2 → 将 field_2 改名为 answer。
实际：两行变为一行 answer，数据源从 User message 变为 select data...；没有观察到重名提示。
期望：拒绝重名并保留原值，或明确提示冲突，不应静默丢失映射。
证据：操作前后 AX 字段数量变化与实际截图均已核查。尚未验证重名数据的保存结果，保存先被 WF-01 阻断。

### WF-04 中：返回列表会丢弃未保存的新建流程，无确认

复现：新建并编辑测试流程（含多个节点、变量、文本，保存报错）→ Back。
实际：直接返回列表，测试流程消失，计数从 2 回到 1，仅余 Goal Loop；未出现保存/放弃/取消确认。
期望：有未保存修改时提示，尤其保存失败后应避免无保护丢失。
说明：此前锁屏导致的窗口连接异常不作为产品缺陷；本项以恢复连接后的明确 Back 操作为证据。

### WF-05 中：暗色面板混入白底原生下拉框

复现：查看 Approval/Condition 的 use data from；End 的输出类型与数据源。
实际：白底黑字下拉框与周围深色输入框、暗色自定义选择器不一致。截图直接可见。
期望：统一暗色主题、边框、字号和交互样式。

### WF-06 中：保存错误缺乏可操作定位

复现：触发 WF-01 或 WF-02。
实际：提示包含内部 Workflow ID、节点 ID 和 unknown reference；当前面板未显示对应引用字段，也未观察到自动定位或高亮。
期望：显示节点名称、问题字段及修复入口，而非只抛内部校验文本。

## 待确认问题

- Tool 默认选择 read_file，但默认 Arguments JSON 为 `{"query":"{{input.message}}"}`，疑似与工具参数契约不一致。未执行，不能宣称运行必然失败。
- 连线端口可视方向与实际生成方向需要进一步核查：一次拖拽产生 Tool → LLM，不能把操作者的目标方向当作产品反向连线证据。
- 多节点 Fit View 会将节点缩得很小；放大按钮有效。可作为易用性观察，不单独判为缺陷。

## 覆盖结果

| 项目 | 已验证 | 限制 |
|---|---|---|
| Start | 面板查看、最小流程保存重开 | 自定义输入边界未穷尽 |
| Agent | 默认新增、身份切换、输入参数操作、输出契约查看、保存失败 | 完整持久化被 WF-01 阻断 |
| LLM | Prompt 编辑后切回保留；JSON object 选项选择；新增 arg1 并选择上游 Tool.Text，类型变 string | 未运行；新增变量后 Prompt 未自动替换，本次不据此判错 |
| Tool | 默认配置查看；JSON 改为 path 后切回保留；创建 Tool → LLM 边 | 未执行工具 |
| Condition | 表达式编辑后切回保留；常量 true 保存失败；False 分支边出现并带标签 | True 分支尝试未得到成功证据 |
| Approval | 中文标题和 Review content 编辑，切回保留；变量选择器查看 | Approved/Rejected 完整连线与运行未验证 |
| Loop | Limited/Unlimited 切换；无限模式移除次数框；0 输入回显 1 | Retry/Exhausted 完整连线与运行未验证 |
| End | Structured JSON、新增字段、重名覆盖复现、数据源查看 | 各类型边界未穷尽 |
| 连线 | Tool → LLM；选择边出现 Delete connection；连接后 LLM 变量菜单出现 Tool 输出；Condition False → End | 删除动作未执行；完整闭环未确认 |
| 保存重开 | QA Minimal Persistence Audit 成功保存，重开名称及 Start → End 边保留 | 不代表所有节点持久化通过 |
| 视觉 | Agent、Approval、Condition、End 与整体画布截图核查；发现白底下拉 | 所有节点所有状态的完整视觉覆盖未完成 |

## 最终状态

成功保存过 `QA Minimal Persistence Audit`（保存版本仅 Start → End，默认启用）。随后在该测试流程编辑器中新增 Condition、Approval、Loop 的修改未保存成功；编辑器停留于该测试流程。此前 `QA Workflow Interaction Audit` 在 Back 后未保留。

建议修复顺序：默认节点引用一致性 → 输出重名防覆盖 → 未保存离开保护 → 校验定位 → 表单主题统一 → 全分支/循环/持久化回归。

## Dev 修复后追加验证（2026-11-16）

- 保存失败改走统一 `onToast('error', message)`；移除 Workflow 画布常驻错误条、追加的泛化修复建议及其专用网格样式。仍保留错误节点自动定位。
- 实际 Haish Dev 刷新后，在隔离草稿 `QA Toast E2E` 新增 Condition、Approval；选中 Approval 保存，出现独立 toast 错误，详情自动切回 Condition；画布没有常驻错误条。toast 仍使用后端原始错误（包含内部 ID）。
- Approval 标题修改为 `QA Approval retained`，切至 Condition 再切回后仍保留。此项仅证明内存草稿字段保留，不是保存重开。
- Loop 的 Maximum reruns 输入 0 后实际回显 1；此前 Unlimited 模式移除次数框并显示手动停止说明。
- Condition 暗色数据插入按钮及展开菜单已截图确认。
- 本轮 ESLint、完整构建通过；两份 Workflow 回归测试共 14 项通过。
- 后续突破：通过 DevTools 只读端口几何及单次鼠标命中日志确认原生拖拽确实命中 Start 输出；失败原因是未连接节点的输入/输出方向随布局变化（Condition 未连接时输入在顶部，左侧为 True 输出）。未直接修改流程数据。
- 在 `QA Toast E2E` 通过真实鼠标拖拽建立七条边：Start → Condition；Condition True → Approval、False → End；Approval Approved → Loop、Rejected → End；Loop Retry → Approval、Exhausted → End。AX 树确认每条新增边，显示 `Approved`、`Need retry`、`Max retries` 标签。
- 点击 Save 返回列表并显示 `custom workflow saved`；随后执行 Dev 页面刷新，重新进入设置并打开 `QA Toast E2E`，七条边全部恢复。复杂审批/循环图保存及刷新重开持久化已验证，不包含运行执行语义。
- 可用性观察：端口方向随拓扑变化，输入端口没有独立可访问名称，未连线时仅靠圆点难以辨识方向；此前坐标失败不能认定为连接功能缺陷。
- 追加真实 UI 验证：新增 Agent → LLM → Tool → End，并将 Approval Rejected 从 End 改接 Agent；原 Rejected → End 消失，新边出现。八类节点共十条边保存成功（`custom workflow saved`），返回列表重开后十条边全部恢复。本次十边验证为保存重开，前述七边另有页面刷新证据。
- LLM 提示词改为 `QA LLM persisted prompt — do not execute.`，响应格式从 Text 切至 JSON object；Save 成功返回列表，重开并选中 LLM 后两项均恢复。
- 保存重开后选中 Agent，指令仍为 `QA persisted instructions — do not execute.`；选中 Tool，工具仍为 `read_file`，Arguments JSON 仍为 `{"path":"README.md"}`。未执行模型或工具。
- 全量测试最新结果：1693 项，1687 通过、6 失败（`/tmp/workflow-full-current.log`）。失败分布为 `agent-catalog.test.js` 两项欢迎区/引用评论契约，以及 `composer-selection-boundary.test.js` 四项（动态提取函数报 `Unexpected token '>'`）；不宣称全套通过，也未扩大范围修改聊天模块。
- 追加审批字段 E2E：保存重开仍显示 `QA Approval retained`；从数据菜单选择 Condition.Summary，Review content 变为 `{{nodes.condition_1.summary}}`，保存成功，再次重开 Approval 后映射保留。
- 追加 End 边界 E2E：将 `answer` 改为纯空白并 Tab，显示非空/唯一校验，名称回到 `answer`，`Condition.Summary` 映射未丢失；重新输入合法名称后提示消失。Add Field 生成 `field_2`；Back 出现未保存确认，Cancel 后两行和映射均保留。随后将 `field_2` 映射 User message 并保存成功；返回列表重开 End 后，`answer → Condition.Summary`、`field_2 → User message` 两行均恢复。
- 边操作已通过真实坐标选中 Tool → End，出现 Delete connection；尚未执行独立删除/恢复，不能报该项通过。原生 AX 边元素多次失效，坐标选择可用，不据此认定产品缺陷。
- 新发现并修复（待 Dev UI 复验）：End 的 Structured JSON → Text → Structured JSON 往返会从两个字段缩减为 `answer` 一行。`OutputNodeFields.jsx` 现按节点缓存当前编辑会话的结构化映射，合法字段编辑同步缓存，切回恢复；不宣称跨卸载/保存 Text 后恢复。定向测试 14/14、ESLint、build 通过（`/tmp/workflow-next-tests.log`、`/tmp/workflow-next-build.log`）。复现后的单行草稿未保存，已保存 QA 仍为两行。
- 撤回此前审批菜单“视觉通过”结论：只检查暗色和可读性不足以验收，用户指出灰色菜单与紫色节点不一致。已改为复用 `workflow-agent-details.css` 的节点 accent/tint/border 和面板背景配方，并在 Radix portal 打开时传递所属节点主题；限制菜单高度，避免长列表占满面板。ESLint、build、现有审计回归测试通过；新样式尚待 Dev 截图复验，不报通过。仍待完成：独立边删除/恢复、其余字段边界及下拉视觉检查。未运行模型/工具，未改 Goal Loop。
