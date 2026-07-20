# Bot 主界面（World）重设计

> 状态：v0.2 技术方案冻结（Phaser 最小原型实施中）
>
> 目标客户端：`/Users/zhanruitao/front-end-project/haish-agent`
>
> 后端：`haish-agent-core` **本期不改**
>
> 相关文档：
>
> | 文档 | 用途 |
> | --- | --- |
> | [`frontend-architecture-and-conventions.md`](./frontend-architecture-and-conventions.md) | 前端架构与编码规范 |
> | [`local-agent-runtime-architecture.md`](./local-agent-runtime-architecture.md) | 本地 runtime 架构 |
> | `docs/agent-workflow-graph-design.md`（core 仓） | workflow 运行时能力边界 |

## 0. v0.2 实施基线（2026-07-18）

> 本节覆盖 v0.1 中与“静态立绘、CSS 平移、百分比路径点”有关的实现决策；后续章节继续保留产品背景、workflow 语义和历史验收口径。若有冲突，以本节为准。

### 0.1 技术结论

现有 World 把游戏场景作为 DOM 页面实现：角色依靠 `left/top transition` 位移，路径是手写锚点，动作由定时器切换。该方式无法稳定表达可行走区域、障碍、交互朝向、占位、动画完成、前后景遮挡，因此会反复出现穿模、走上桌子、瞬移、动作错切和逐帧大小变化。

v0.2 将中间地图升级为真正的 **2.5D 游戏场景**：

- React / Electron 继续负责会话、workflow、任务输入、时间线和应用壳层。
- Phaser 4 只接管地图内部的渲染、游戏循环、角色、路径、碰撞、动画和深度。
- 现有冬景地图继续作为视觉背景，不要求重绘为瓦片地图。
- Tiled 只用于给背景图标注不可见的地图语义；首个原型可先用同结构 JSON，验证后再接入 Tiled 导出文件。
- 首轮只实现 Product 企鹅的咖啡闭环；QA 滑冰、Development 篮球和圆桌工作流在该闭环验收后迁移。

### 0.2 组件选型

| 组件 | 职责 | 决策 |
| --- | --- | --- |
| Phaser 4 | 游戏循环、精灵、动画事件、碰撞、深度、摄像机 | 采用 |
| Tiled Map Editor | 可行走面、障碍、遮挡和交互锚点编辑 | 采用，原型后接入 |
| `navmesh` | 不规则可行走区域寻路 | 兼容性 POC 后决定是否接入 |
| XState | 复杂状态机 | 暂不引入；先用显式状态枚举和事件转移 |
| Three.js / Babylon.js | 真 3D 场景 | 不采用；当前资产与产品目标是 2.5D |
| Framer Motion / GSAP | DOM 补间动画 | 不用于地图角色运动 |

### 0.3 地图语义模型

地图必须从“一张背景图”升级为“背景图 + 不可见语义层”：

```text
background          冬景公园背景
walkable            企鹅脚底允许到达的多边形
blockers            吧台、圆桌、石凳、树、篮架、湖岸等障碍
interactionPoints   咖啡凳、工作席、篮筐等交互锚点
foreground          吧台前沿、桌沿等需要遮住角色的前景图层
```

角色的位置统一表示为**脚底锚点**。渲染深度按脚底 `y` 排序；桌面、吧台前沿等使用独立前景层，而不是通过任意放大 `z-index` 修补。

### 0.4 交互对象契约

角色不能直接把物体坐标当作移动终点。每个可交互对象必须声明完整的接近、使用和退出约束：

```ts
type InteractionPoint = {
  id: string;
  type: 'coffee_seat' | 'roundtable' | 'hoop';
  approach: { x: number; y: number };
  use: { x: number; y: number };
  exit: { x: number; y: number };
  facing: 'front' | 'back' | 'left' | 'right';
  occupiedBy: string | null;
};
```

- `approach` 必须位于可行走面上。
- `use` 只允许通过交互状态进入，寻路系统不得直接走入。
- 座位需要占用/释放，避免两只企鹅重叠。
- 咖啡区没有可进入的吧台内场。企鹅只能沿外侧地面走到咖啡凳的 `approach`，跳到 `use` 后立即切换坐姿完成咖啡交互；不能走上吧台或在地面播放坐姿咖啡动作。

### 0.5 咖啡闭环状态机（首个原型）

```text
leisure_idle
  → path_to_seat_approach
  → jump_to_seat
  → seated_drinking
  → jump_from_seat
  → path_from_seat
  → leisure_idle / path_to_next_activity
```

状态转移只能由以下事件驱动：

- `path_complete`
- `facing_aligned`
- `animation_complete`
- `interaction_acquired` / `interaction_released`
- workflow 场景命令

禁止用固定 `setTimeout` 猜测角色是否到达或动作是否完成。跳上凳子后由同一动画完成事件立即切坐姿；跳下落地后直接进入空闲/行走，不再补一次跳跃，也不得在地面误播打咖啡动作。

### 0.6 移动、碰撞与动画规则

1. 使用 Phaser 游戏循环按 `delta time` 推进位置，不再使用 CSS `left/top transition`。
2. 寻路目标必须在 `walkable` 内，路径不得穿过 `blockers`。
3. 碰撞体只包住企鹅脚部，视觉身体可以被前景遮挡。
4. 行走方向由当前速度向量决定，不能出现位置向左但角色仍朝右。
5. 行走帧由累计移动距离或稳定帧率推进，停止时立即落到站立帧。
6. 所有动作使用统一画布、统一脚底 pivot、统一视觉身高；运行时禁止逐帧修改人物缩放。
7. `prefers-reduced-motion` 下保留路径和状态语义，降低跳跃高度、动画帧率和装饰运动，不允许瞬移穿越障碍。

### 0.7 React 与 Phaser 边界

```text
React / Electron
  workflow、task、SSE、timeline、输入、窗口与鉴权
              │ scene commands / scene events
              ▼
Phaser BotWorldScene
  actor state、movement、collision、animation、depth、interaction
```

- React 只向场景发送 `cast_changed`、`node_started`、`node_finished`、`workflow_finished` 等命令。
- Phaser 向 React 返回 `actor_arrived`、`interaction_started`、`report_ready` 等粗粒度事件。
- 高频坐标和动画帧不得写入 React state，避免每帧重渲染 DOM。

### 0.8 分阶段实施与验收

#### Milestone A — 咖啡原型

- [x] Phaser Canvas 嵌入现有地图区域，现有 UI 壳层不变。
- [x] 背景图按 contain/cover 规则完整铺设，逻辑坐标与背景一致。
- [x] 标注咖啡区外侧可行走面、吧台障碍和至少一个咖啡凳交互点。
- [x] Product 企鹅完整执行“外侧走近凳子 → 跳上 → 立即坐姿咖啡交互 → 跳下 → 沿地面离开”。
- [ ] 企鹅不能走上吧台、桌面或穿过凳子；动作切换不依赖定时器。
- [x] 开发模式可切换导航面、障碍、路径、脚底点和交互锚点调试层。
- [x] 通过 Haish（dev）实际运行截图/录屏验收。

#### Milestone B — 三类娱乐行为

- [ ] QA 仅在湖面可行走多边形内滑冰，朝向与速度一致。
- [x] 湖面具备独立微光、冰痕和冰屑反馈；装饰层只在 QA 滑冰时增强，不改变可行走边界。
- [x] Development 运球、投篮、进网反馈、篮圈反弹、落球和拾球形成闭环。
- [x] 咖啡机与篮架从背景图中抽成透明动态主体，可独立播放出液、蒸汽、进网和篮圈震动。
- [ ] 三只企鹅各动作的脚底锚点、视觉身高和缩放保持一致。

#### Milestone C — workflow 圆桌循环

- [ ] workflow 节点数决定企鹅数量。
- [ ] 当前节点企鹅从娱乐区自然寻路到圆桌工作位。
- [ ] 完成后离席，下一个节点进场；严格串行且不瞬移。
- [ ] 最后节点完成后全员到圆桌汇报，之后回娱乐区。

### 0.9 动态环境主体

冬景地图继续作为静态底图，但会参与角色交互的物件必须单独渲染，不能把动画画死在角色序列帧中：

| 动态主体 | 常驻表现 | 角色触发 | 结果反馈 |
| --- | --- | --- | --- |
| 咖啡机 | 独立透明贴图、工作灯、局部阴影 | Product 到达咖啡交互点 | 杯子出现 → 咖啡出液 → 蒸汽上升 → 杯子交付 |
| 篮架 / 篮网 | 独立透明贴图、前后遮挡网层 | Development 投篮事件 | 命中时球穿网并拉伸篮网；未命中时篮圈震动、球偏转落地 |
| 湖面 | 静态底图 + 低透明微光层 | QA 在湖面滑行 | 曲线冰痕、末端冰屑/闪光，短时淡出且不越出湖岸 |

实现约束：

- 环境主体、球和特效属于 Phaser 场景层；React 只传 `balls`、`skateActive` 等低频语义状态。
- 篮球从现有企鹅素材中裁取，保持手持球与飞行球外观一致，不再使用 CSS 圆形假球。
- 进球/打铁由同一次投篮事件确定，飞行轨迹结束后才进入落球/拾球阶段。
- 环境装饰遵循 `prefers-reduced-motion`，降低频率和位移，但保留交互结果。
- 透明物件贴图统一放在 `app-web/assets/world/props/`，以底部中心为落地锚点。

### 0.10 首轮明确不做

- 不引入骨骼动画、3D 模型、复杂 ECS 或通用关卡编辑器。
- 不为了原型建立一套抽象插件框架。
- 不修改 `haish-agent-core`、Chat 模式和 workflow 协议。

### 0.11 回退与并存策略

Phaser 原型通过独立 `BotWorldGame` 组件接入；旧 `BotWorld` 在 Milestone A 验收前保留为可回退实现。原型失败时只移除新入口，不影响任务流和应用壳层。咖啡闭环通过验收后，再删除旧 DOM 运动实现，避免两套状态机长期并存。

---

## 1. 背景与目标

### 1.1 现状问题

当前 Bot 模式（`viewMode=world` / `execution_mode=bot`）已经接上 workflow 执行链路，但场景叙事仍绑定旧办公室地图与固定 8 角色 NPC：

- 角色固定：`guts / gojo / okabe / kurisu / lelouch / levi / itachi / mikey`
- 位置固定：`STATIONS` + 走廊 `NAV_POINTS` + 会面 `MEET_POINTS`
- 事件驱动仍按“工具分发 / provider rail / 角色工位”叙事
- 与“选 workflow → 按节点执行”的产品语义不完全一致

用户已提供新素材，并明确新叙事：

> 选中 workflow 后，按节点数量生成企鹅；当前节点企鹅到圆桌工作；完成后离开娱乐；循环至最后一节点；全体回圆桌汇报；再散开娱乐。

### 1.2 本期目标

1. **保留** Chat / Bot 双模式，交互边界与现在一致。
2. **只改前端** `haish-agent`；后端 API / SSE / workflow runner 不动。
3. **重做 Bot 地图演出层**：新地图 + 动态企鹅 + 圆桌轮转 + 娱乐区。
4. **保留** 右侧节点时间线、任务输入、停止/重试、最终答案可回看。
5. **保留** Workflow 编辑器在 Settings 页。
6. **Chat 模式冻结**（除非共享壳层被迫最小改动）。

### 1.3 非目标

- 不改 `haish-agent-core` 的 workflow 节点类型、事件协议、执行语义。
- 不重做 Chat 模式 UI。
- 不把 workflow 编辑器并入主界面。
- 第一期不做完整四向走路帧 / 复杂骨骼动画。
- 第一期不恢复旧 calibration（地图校准）与旧 provider rail 演出。

---

## 2. 已确认产品决策

| 项 | 决策 |
| --- | --- |
| 模式 | 保留 Chat / Bot 双模式 |
| 后端 | 零改动 |
| 主界面骨架 | 保持：左会话 / 中地图 / 右时间线 / 底部任务输入 |
| 角色体系 | **废弃**旧 NPC 映射，改为 workflow 节点驱动的企鹅 |
| 地图 | 使用新冬景公园地图 |
| 进度展示 | 保留节点时间线 |
| 最终答案 | 仍由人物演出触发/呈现，并写入任务记录可回看 |
| Workflow 编辑器 | 仍在设置页 |
| 第一期动画 | 立绘/静态姿态 + 平滑走位 + 状态气泡，不做完整帧动画 |
| 交付节奏 | **A. 可玩主路径**优先 |

### 2.1 默认拍板（本设计采用）

1. **1 个业务节点 = 1 只企鹅**；形象在 4 只企鹅素材中循环复用。
2. 出场节点类型：**`agent` / `llm` / `tool`**。
3. `start` 不占企鹅；`output` 不单独占企鹅，只触发**全员汇报**。
4. `condition` 第一期**不出场**（仅在时间线显示分支结果）。
5. 圆桌进出：**严格串行**（上一只离席完成后，下一只才进场）。
6. 最终答案：全员到齐后，**可点击企鹅展开全文**；同时任务记录可回看。
7. 失败/取消：当前工作企鹅做“报错收束”，其余企鹅回娱乐区。
8. 娱乐区：空闲企鹅**随机**分配到咖啡 / 滑冰 / 篮球点。
9. 无任务空闲会话：地图**不显示企鹅**（避免残留上次 run 的角色）。
10. 旧 calibration、旧 NPC 路由、provider rail：**可删**。
11. 右栏以**节点时间线**为主；旧 LiveFeed 事件流与时间线**合并/弱化**。
12. 文档上传 / 停止 / 重试：**P0 保留**。

---

## 3. 用户体验总览

### 3.1 主界面信息架构（保持不变）

```text
┌──────────────┬──────────────────────────────┬─────────────────┐
│ Conversations│         Map Viewport         │ Node Timeline   │
│  (bot only)  │  新地图 + 企鹅演出            │  当前任务节点流  │
│              │                              │                 │
│              │     [ TaskDelegation 输入条 ] │                 │
└──────────────┴──────────────────────────────┴─────────────────┘
```

- 左：Bot 会话树（`execution_mode=bot` 过滤）
- 中：新 World 地图演出
- 右：节点时间线（当前任务 workflow run）
- 底/浮层：workflow 选择 + 任务输入 + 停止/重试

### 3.2 主路径故事线

```text
用户选择 workflow
  → 解析可演出节点列表
  → 生成 N 只企鹅，初始全部在娱乐区

用户发送任务
  → 任务开始
  → 第 1 个节点企鹅：娱乐区 → 圆桌「思考执行」
  → 节点完成：圆桌「任务完成 / 交接」→ 回娱乐区
  → 第 2 个节点企鹅进场
  → …循环…
  → 最后业务节点完成
  → 全体企鹅回到圆桌「任务总结 / 汇报」
  → 用户可点击企鹅查看最终答案
  → 汇报结束，全体回娱乐区
```

### 3.3 工作态 / 娱乐态

| 类别 | 状态 | 地图表现（第一期） |
| --- | --- | --- |
| 工作 | 思考执行 | 圆桌位 + think 气泡/高亮 |
| 工作 | 任务完成 | 圆桌位 + done 标记 |
| 工作 | 任务交接 | 离席走位 + handoff 气泡 |
| 工作 | 任务总结 | 全员圆桌 + report 姿态/气泡 |
| 娱乐 | 喝咖啡 | 咖啡点静态位 |
| 娱乐 | 湖面滑冰 | 滑冰点静态位 |
| 娱乐 | 打篮球 | 球场点静态位 |

> 第一期不要求真实“滑冰帧/投篮帧”，点位正确 + 状态文案/图标即可。

---

## 4. 场景模型（替代旧 NPC 体系）

### 4.1 核心概念

| 概念 | 说明 |
| --- | --- |
| `PenguinActor` | 一只可演出企鹅，绑定某个 workflow 节点 |
| `SceneSpot` | 地图点位：圆桌席 / 娱乐点 / 路径锚点 |
| `ActorRuntimeState` | 单只企鹅当前状态机 |
| `RoundtableQueue` | 严格串行的圆桌进出队列 |
| `WorkflowCast` | 当前选中 workflow 生成的演员表 |

### 4.2 哪些节点变成企鹅

从 workflow definition 生成 cast：

```text
nodes
  .filter(type in {agent, llm, tool})
  .sort(by graph execution order / stable node order)
  .map((node, index) => PenguinActor)
```

规则：

| 节点类型 | 是否出场 | 说明 |
| --- | --- | --- |
| `start` | 否 | 仅时间线可显示“开始” |
| `agent` | 是 | 1 节点 1 企鹅 |
| `llm` | 是 | 1 节点 1 企鹅 |
| `tool` | 是 | 1 节点 1 企鹅 |
| `condition` | 否（P1 可再议） | 时间线显示分支即可 |
| `output` | 否 | 触发全员汇报阶段 |

> 若同一 workflow 节点数 > 形象数，形象按 `index % penguinSpriteCount` 循环。

### 4.3 演员字段（建议）

```ts
type PenguinActor = {
  actorId: string;          // 稳定 id，如 `wfnode:${nodeId}`
  nodeId: string;
  nodeType: 'agent' | 'llm' | 'tool';
  label: string;            // 节点名，用于气泡/时间线对齐
  spriteKey: string;        // penguin_a / penguin_b / ...
  seatIndex: number;        // 圆桌席位 index
  leisureSpotId: string;    // 当前娱乐点
};
```

### 4.4 演员状态机

```text
hidden
  └─(cast created / task started)→ leisure
      └─(node_started & is current)→ walking_to_table
          └─(arrived)→ working
              ├─(node_finished ok)→ handing_over → walking_to_leisure → leisure
              └─(failed/cancelled)→ error_pose → walking_to_leisure → leisure

全员汇报阶段：
leisure/working → walking_to_table → reporting
  └─(user dismiss / timeout)→ walking_to_leisure → leisure
```

状态枚举建议：

```ts
type ActorPhase =
  | 'hidden'
  | 'leisure'
  | 'walking_to_table'
  | 'working'
  | 'handing_over'
  | 'walking_to_leisure'
  | 'reporting'
  | 'error';
```

---

## 5. 地图与点位设计

### 5.1 素材清单（用户提供）

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `ChatGPT Image 2026年7月16日 20_56_30.png` | 1536×1024 | **主地图** |
| `ChatGPT Image 2026年7月16日 21_09_22 (1).png` | 948×1659 | 企鹅形象 A |
| `ChatGPT Image 2026年7月16日 21_09_22 (2).png` | 948×1659 | 企鹅形象 B |
| `ChatGPT Image 2026年7月16日 21_09_22 (3).png` | 948×1659 | 企鹅形象 C |
| `ChatGPT Image 2026年7月16日 21_09_22 (4).png` | 948×1659 | 企鹅形象 D |
| `ChatGPT Image 2026年7月16日 21_09_32.png` | 1536×1024 | **待确认**（暂不接入主路径；可能是备用地图/合影） |

建议入库路径（实现时）：

```text
app-web/assets/world/
  map-winter-park.png          # 原始地图存档
  map-winter-park-clean.png    # 去除静态咖啡机与篮架的运行时底图
  penguins/
    penguin_a.png
    penguin_b.png
    penguin_c.png
    penguin_d.png
```

### 5.2 逻辑地图尺寸

继续使用百分比坐标（与现网一致，便于缩放）：

- 设计参考像素：`1536 x 1024`（素材原生）
- 运行时逻辑尺寸：可沿用 `MAP_W/MAP_H` 或改为 `1536/1024`；**对外统一用 0~1 百分比点位**
- 角色渲染：立绘按脚底锚点落位（不是中心锚点）

### 5.3 点位分区（需在实现前做一次标定）

> 下列坐标为**设计占位**，落地前应用标定工具/手工微调到新地图真实像素。

#### A. 圆桌工作区（Table Zone）

- `table_center`：圆桌中心（仅参考，不站人）
- `table_seat_0..N`：环绕圆桌的工作席
  - 第一期建议预置 **最多 8 席**
  - 实际占用前 `cast.length` 席
  - 席位分配：按 cast 顺序稳定映射，避免每次重排跳动

#### B. 娱乐区（Leisure Zone）

| spotId | 语义 |
| --- | --- |
| `leisure_coffee_1` / `leisure_coffee_2` | 喝咖啡 |
| `leisure_skate_1` / `leisure_skate_2` | 湖面滑冰 |
| `leisure_basket_1` / `leisure_basket_2` | 打篮球 |

规则：

- 空闲企鹅随机选一个空闲 leisure spot
- 若点位满了，允许“同点轻微抖动偏移”（避免完全重叠）

#### C. 路径锚点（Path Anchors）

最少需要：

- `path_table_entry`：进圆桌前的汇合点
- `path_leisure_hub`：娱乐区总岔口（可选）

第一期路径策略：

```text
leisureSpot → path_table_entry → table_seat_i
table_seat_i → path_table_entry → leisureSpot
```

不恢复旧办公室复杂多段走廊路由。

### 5.4 圆桌容量与溢出

| cast 数量 | 表现 |
| --- | --- |
| 1–8 | 一席一企鹅 |
| >8 | 仍创建演员，但圆桌只显示前 8 席；其余在旁观点 `table_overflow_*` 等待；时间线仍完整 |

> 第一期也可直接硬限制“可演出节点最多 8 个”，超出仅时间线展示。推荐：**可创建 >8，但圆桌显示截断并在 UI 提示**。

---

## 6. 事件驱动契约（后端不改）

### 6.1 继续消费的 API

| API | 用途 |
| --- | --- |
| `POST /api/conversations` + `execution_mode:'bot'` | 建 Bot 会话 |
| `POST /api/conversations/{id}/tasks/stream` | 发任务并收 SSE |
| workflow settings / catalog | 选可执行 workflow |
| conversation/task 恢复接口 | 恢复 `workflow_id` / run 快照 |

Bot 请求关键字段保持：

```js
options: {
  workflow_id,
  execution_mode: 'bot',
  provider,
  model_id,
  reasoning_effort,
  use_history: true,
  // agent_id 在 bot 下为 null
}
```

### 6.2 SSE → 场景动作映射

| SSE 事件 | 场景动作 |
| --- | --- |
| 选中 workflow / 打开 bot 会话且已知 workflow | 生成 cast；无任务时 `hidden` 或不生成 |
| `workflow_started` | cast 全部进入 `leisure` |
| `workflow_node_started` | 对应企鹅排队进圆桌 → `working` |
| `workflow_node_finished` | 对应企鹅 `handing_over` → 回娱乐 |
| `workflow_edge_selected` | 仅时间线高亮（地图可忽略） |
| `workflow_finished` | 进入全员 `reporting` 流程 |
| `workflow_failed` / `run_error` / `run_cancelled` | 当前企鹅 `error`，其余回娱乐；时间线标记失败 |
| `llm_*` / `tool_*` / `agent_progress_delta` | 优先喂时间线；地图只保留粗粒度节点态 |

### 6.3 与旧映射的切割

删除/停用：

- `WORLD_ROLE_TO_ACTOR`
- `WORKFLOW_NODE_ACTOR_BY_TYPE`（guts/gojo…）
- `PROVIDER_ACTOR_MAP` 驱动的地图演出
- `STATIONS` 旧 8 工位
- 旧 `ROUTES` / `MEET_POINTS` 办公室路径
- calibration 流程

保留：

- `execution_mode` 会话隔离
- task stream 与 runtime store
- workflow catalog / executable 过滤
- 节点时间线数据源（`workflowRun` / node events）

---

## 7. 最终答案与时间线

### 7.1 最终答案

1. `workflow_finished` 后进入汇报阶段。
2. 全体可演出企鹅走到圆桌席位，进入 `reporting`。
3. 地图上出现“任务完成，点击查看结果”类提示。
4. 用户点击任一汇报中的企鹅（或统一结果气泡）→ 展开最终答案全文。
5. 最终答案同时写入任务记录，右侧/任务历史可回看，不依赖地图点击。

> 若用户不点击，任务完成后答案仍可在时间线/任务详情看到，避免“只有点角色才找得到结果”。

### 7.2 节点时间线（P0）

右栏继续展示当前任务：

- 节点名 / 类型
- 状态：pending / running / succeeded / failed / skipped
- 起止时间或顺序
- 当前高亮节点

时间线与地图通过 `nodeId` 对齐：

- 地图当前 `working` 的企鹅 ↔ 时间线 running 节点
- 点击时间线节点（P1）可高亮对应企鹅

### 7.3 LiveFeed

- 旧“逐条世界事件旁白”弱化
- 与节点时间线合并为同一右栏信息
- 不再强依赖旧角色名旁白

---

## 8. 前端改造边界

### 8.1 改动范围

仅 `front-end-project/haish-agent`：

| 区域 | 动作 |
| --- | --- |
| `app-web/assets/world/**` | 新地图与企鹅素材入库 |
| `app-web/src/World.jsx`（或拆分后的 world 模块） | 新点位 / 新渲染 |
| `app-web/src/Sprites.jsx` | 立绘渲染适配（可新增 PenguinSprite） |
| `app-web/src/lib/world-runtime.js` | 新 cast / 点位 / 常量 |
| `app-web/src/lib/world-events.js` | workflow 事件 → 场景意图 |
| `app-web/src/features/app/AppShell.jsx` | 替换场景编排，删除旧 NPC 演出耦合 |
| 右栏 timeline 相关 panel | 保留并接到新 cast 高亮 |
| Settings workflow editor | **不动业务**，仅确保 catalog 字段继续可用 |

### 8.2 建议新增模块（避免继续堆 AppShell）

```text
app-web/src/lib/bot-scene/
  cast.js            # workflow → PenguinActor[]
  spots.js           # 点位表
  state-machine.js   # actor phase 转移
  event-mapper.js    # SSE → scene commands
  pathing.js         # leisure ↔ table 路径

app-web/src/panels/world/
  MapViewport.jsx    # 已有可迁
  PenguinActor.jsx
  RoundtableLayer.jsx
```

> 规范要求避免 `AppShell` 继续膨胀；场景状态机应可单测/可抽离。

### 8.3 明确不改

- `haish-agent-core` workflow runner / API
- Chat 模式主路径
- Settings 中 React Flow 编辑器交互
- 会话树 / project / 鉴权 / runtime host

---

## 9. 分阶段交付

### Phase 0 — 设计冻结（本文档 review）

- [ ] 产品确认默认拍板无异议
- [ ] 确认第 5 张图 `21_09_32.png` 是否使用
- [ ] 确认圆桌最多席位数（默认 8）

### Phase 1 — 可玩主路径（推荐首发）

1. 新地图替换与基础缩放/落位
2. workflow → cast 生成
3. 企鹅 leisure / table 走位（平滑平移）
4. 严格串行节点演出
5. 全员汇报 + 点击查看最终答案
6. 右栏节点时间线对齐
7. 停止 / 重试 / 失败收束
8. 删除旧 NPC 主路径依赖

**验收标准（Phase 1）：**

- 选择 `software-development` 或自定义可执行 workflow，地图企鹅数 = 业务节点数（agent/llm/tool）
- 发任务后，仅一只有工作企鹅在圆桌，其余娱乐
- 节点切换严格串行，不出现两只同时“正式工作”
- 完成后全员汇报，点击可看最终答案；任务记录也能看到
- Chat 模式不受影响
- 后端无改动即可跑通

### Phase 2 — 演出增强

- 更细交接/总结姿态
- 娱乐点轮换动画
- 时间线点击反查企鹅
- condition 节点是否可视化再议
- 多任务并行时的场景策略优化

### Phase 3 — 素材增强（可选）

- 补走路帧 / 滑冰 / 投篮等动作
- 头像体系与角色命名产品化
- 地图点位可视化编辑器（替代旧 calibration）

---

## 10. 风险与约束

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 素材是整图立绘，不是 sprite atlas | 无法直接复用旧 WalkingSprite 帧动画 | 第一期静态立绘 + 平移；锚点用脚底 |
| 节点数过多 | 圆桌拥挤 | 预置 8 席 + overflow 策略 |
| AppShell 耦合深 | 改场景易回归 | 先抽 bot-scene 状态机，再换渲染 |
| 旧事件映射残留 | 错误派出旧角色 | 明确删除旧 actor map，加 bot-only 场景入口 |
| 最终答案只藏在角色点击里 | 用户找不到结果 | 任务记录/时间线双通道必达 |
| 点位未标定 | 企鹅站墙里/湖里 | Phase 1 先做点位表常量，允许快速微调 |

---

## 11. 待 review 清单（请你拍板/纠偏）

以下为默认值，可直接改：

1. `21_09_32.png`：**暂不使用**
2. 出场节点：仅 `agent/llm/tool`
3. 圆桌最大正式席位：**8**
4. 无任务时：**不显示企鹅**
5. 最终答案：汇报演出 + 点击展开 + 任务记录可回看
6. 第一期不做帧动画
7. 旧 calibration / provider rail / 旧 NPC：**删除主路径**

---

## 12. 一句话结论

Bot 主 UI 重设计 = **在不改后端契约的前提下，把“固定 8 人办公室 NPC 剧场”替换为“按 workflow 节点动态生成的企鹅圆桌剧场”**；壳层、时间线、任务流、Settings 编辑器保持，场景状态机与素材体系重做，第一期先交付可玩主路径。
