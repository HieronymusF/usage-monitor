# Codex Usage Monitor — Electron 重构开发主计划

版本：1.0  
日期：2026-07-18  
状态：当前唯一有效的重构执行方案

## 1. 文档权威顺序

发生冲突时，按以下顺序裁决：

1. `AGENTS.md`：安全、隐私和协作红线。
2. 本文件：产品范围、技术架构、开发阶段、验收门槛和清理策略。
3. `docs/01-product-requirements.md`：旧 release 的产品功能基线。
4. `docs/ui-designs/visual-spec.md` 与 `docs/ui-designs/design-tokens.json`：可测量的视觉基线。
5. `docs/ui-designs/00-05*.png`：构图、信息层级、材质与视觉方向。
6. 旧 WPF 实现：仅用于核对现有行为和回归。

已确认的冲突处理：

- 以 handoff 的新方向为准：生产 UI 使用 Electron + React + shadcn/ui。
- Figma-first 门禁已经取消；Figma 文件、插件、生成脚本和节点 ID 不再参与开发验收。
- `docs/ui-designs` 中涉及 Figma 的文字只作为历史制作说明，不具有流程约束力。
- 视觉稿仍是必须遵守的视觉目标，但验证方式改为“参考 PNG + 固定 viewport 截图对比”。
- 不因技术迁移删减旧 release 功能；新 Electron 版达到完整功能对等后，旧 WPF 才能退役。

## 2. 产品目标

产品是一个 Windows 常驻、只读、不抢焦点的用量监测悬浮应用，同时保留 Codex MCP 插件能力。

用户必须能在三秒内回答：

1. 当前看的是 Codex 还是 ZCode。
2. 最重要的配额或 Token 指标是什么。
3. 数据是否可信、何时更新、何时重置。

必须保留：

- Codex 官方 5 小时 / 每周配额、剩余比例和重置时间。
- Codex 当前任务、今日、本机累计 Token。
- ZCode 今日、本机累计和按模型 Token；永不虚构 ZCode 配额。
- Card、Indicator Bar、Collapsed Orb、Expanded Edge Capsule 四种形态。
- Auto / Card / Bar / Orb 展示模式。
- Light / Dark / Auto 主题。
- 前台应用识别、自动形态切换、IDE 窗口贴附、DPI 与多显示器处理。
- 拖动、贴边、悬停展开、点击、键盘操作、托盘菜单、开机启动。
- 用户偏好持久化。
- MCP 只读工具和现有数据核心。

新增：

- 完整中英文国际化。
- 可复用的 React 组件、设计 token 和视觉回归测试。
- 明确的数据状态模型、错误恢复和发布门槛。

## 3. 不可逾越的边界

- 不伪造数据。缺失配额显示“服务未提供”，不显示 0%、100% 或估算值。
- ZCode 没有官方配额，不显示剩余百分比和重置倒计时。
- 不读取或转发 credentials、cookie、token、API key、对话正文、工具参数或文件正文。
- 不提供购买、消费、修改账户或删除历史等写操作。
- 不修改 Codex、ZCode 或 IDE 官方界面。
- 除 Codex app-server 外不向第三方联网，不上传遥测。
- `server/` 的领域语义和 companion bridge HTTP 契约保持兼容。
- Electron renderer 必须保持 sandbox、`contextIsolation: true`、`nodeIntegration: false`。
- bridge key 只存在于主进程，不暴露给 renderer。
- IPC 只暴露经过校验的窄接口，不提供任意 URL、文件或命令执行能力。

## 4. 视觉方向

设计方向固定为 `docs/ui-designs` 中的 **Polar Aurora Glass / 极光冰层**。

### 4.1 共同语言

- 冷白或深海军蓝玻璃底层。
- 蓝、薄荷、紫三组低透明极光叠层。
- 1px 外描边、1px 内高光和克制阴影。
- 蓝到青只用于数据进度；绿、黄、红只表达语义状态。
- 大数字建立第一层级，标签和辅助信息保持克制。
- 不使用通用 Dashboard 卡片堆叠，不使用纯白平面或单一蓝紫线性渐变。

### 4.2 字体

- 正文：Segoe UI Variable Text、Microsoft YaHei UI、Segoe UI。
- 大数字：Segoe UI Variable Display、Segoe UI。
- 图标：同一套 Fluent 线性图标。
- 数字使用 Tabular + Lining numerals。
- 可见文字不小于 13 DIP。
- 品牌固定为 `CODEX · PLUS`、`ZCODE · LOCAL`，不得人工插入字符间空格。

### 4.3 关键尺寸

| 组件 | 窗口尺寸 |
| --- | --- |
| Codex Card | 576 × 404 DIP |
| ZCode Card | 576 × 333 DIP |
| Indicator Bar | 最大 600 × 40 DIP |
| Collapsed Orb | 窗口 84 × 120，可见 72 × 108 DIP |
| Expanded Edge Capsule | 720 × 180 DIP |
| Card 操作按钮 | 36 × 36 DIP |
| Bar 操作按钮 | 30 × 30 DIP |

精确颜色、字号、行高、圆角、进度环几何和动效以
`docs/ui-designs/design-tokens.json` 与 `docs/ui-designs/visual-spec.md` 为准。

### 4.4 标题栏操作

Card 右上角固定三个按钮：

1. 主题切换。
2. 展示模式切换。
3. 关闭应用。

不得放语言按钮、连接状态灯或无实际功能的装饰按钮。语言切换放入托盘或设置菜单。

## 5. 四种显示形态

### 5.1 Card

用途：完整查看。

- Codex Dual：左侧 5h Hero；右侧 Weekly Ring；底部当前任务 / 今日 / 累计。
- Codex WeeklyOnly：周额度提升为 Hero；右侧重置 / 今日 Token；底部当前任务 / 累计。
- Codex FiveOnly：5h Hero；周额度显示“服务未提供”，不画 0% 圆环。
- Codex NoQuota：显示“配额 — 服务未提供”；仍展示可用 Token。
- ZCode：今日 Token Hero；本机累计与模型为次级信息；无配额区域。

### 5.2 Indicator Bar

用途：IDE 前台时低干扰显示。

- 整条保持 14 / 20 的统一文字基线。
- Codex 优先保留配额，再保留今日 Token。
- ZCode 展示今日、累计、模型和“本机估算”。
- 空间不足时：缩短重置文案 → 隐藏今日 Token → 保留配额。
- 右侧只保留“切换到 Card”和“关闭”。

### 5.3 Collapsed Orb

用途：非编码场景的低干扰入口。

- 顶部三个拖动圆点。
- Codex 显示当前最重要配额的圆环和值，标签只写 `5h` 或 `周`。
- ZCode 显示今日 Token 与 `今日`。
- 底部状态点必须同时有 tooltip / accessible name，不单靠颜色。

### 5.4 Expanded Edge Capsule

用途：从 Orb 快速查看中等密度信息。

- 固定 720 × 180 DIP。
- 右侧把手与主体是同一个连续表面和命中区。
- Codex 展示配额、重置、今日 Token。
- ZCode 展示今日、累计、模型。
- 操作轨提供 Card、Bar、Theme。
- 220ms hover 后展开，离开整体 420ms 后收起，过渡 180ms ease-out。

## 6. 领域状态模型

Renderer 不直接解释原始 `MultiClientSnapshot`。新增纯函数领域适配层，把数据转换为稳定的 `UsageViewModel`。

```text
MultiClientSnapshot
  → client selector
  → quota classifier
  → freshness classifier
  → formatter
  → surface-specific view model
  → React component
```

需要显式建模：

- `client`: codex / zcode。
- `surface`: card / indicator-bar / orb / edge-capsule。
- `displayPreference`: auto / card / indicator-bar / orb。
- `themePreference`: auto / light / dark。
- `resolvedTheme`: light / dark。
- `quotaState`: dual / weekly-only / five-only / unavailable。
- `dataState`: loading / fresh / stale / partial / refresh-error / offline。
- `health`: sufficient / low / critical / unavailable。
- `dataQuality`: official / derived / local-estimate / unavailable。

规则：

- 健康度按剩余比例分类：`>= 50` 充足，`20–49` 偏低，`< 20` 紧张。
- Stale 保留上次有效数据并增加过期提示。
- 刷新失败不清空最后快照。
- 倒计时由 renderer 本地更新，不每秒访问 bridge。
- 所有数字、时间和文案通过统一 formatter 与 i18n key 生成。

## 7. 目标架构

```text
Electron Main
  ├─ lifecycle / single-instance
  ├─ bridge process supervisor
  ├─ window manager
  ├─ foreground-window adapter
  ├─ screen / DPI / placement
  ├─ tray / auto-launch
  ├─ settings repository
  └─ narrow validated IPC
          ↓
Sandboxed Preload
          ↓
React Renderer
  ├─ domain adapters and formatters
  ├─ SWR data lifecycle
  ├─ Zustand UI state
  ├─ surface components
  ├─ shadcn/ui primitives
  ├─ design tokens
  └─ react-i18next
          ↓
Existing companionBridge
          ↓
Existing server data core
```

### 7.1 主进程职责

- 单实例、启动和有界退出。
- 启动、监控、停止 companion bridge。
- 保存 bridge 端口和 key。
- 创建与切换四种窗口。
- 监听系统主题、前台窗口、显示器和 DPI 变化。
- 托盘菜单、开机启动和偏好持久化。
- 校验每个 IPC 请求的 sender、参数和返回值。

### 7.2 Renderer 职责

- 渲染 UI，不访问 Node、文件系统或任意网络。
- 通过 `window.monitor` 获取上下文和用量。
- 将快照转换为 view model。
- 管理轮询、倒计时、动画和可见状态。
- 共享同一套 Card / Bar / Orb / Capsule 组件。

### 7.3 窗口模型

保留一个 renderer 入口，通过 surface 参数渲染不同根组件。主进程按需创建并缓存窗口：

- 同一时间只显示目标形态。
- 切换形态时保留数据 store，避免重新加载和闪白。
- Card 高度随 Codex/ZCode 在两个固定规格之间切换。
- Bar 跟随目标 IDE 工作区边缘，并避开系统按钮。
- Orb/Capsule 保存每个显示器的边缘与相对位置。
- 任何窗口都不激活、不抢焦点；需要交互时只接收自身命中区事件。

### 7.4 原生能力边界

先定义 `ForegroundWindowAdapter`、`WindowPlacementAdapter` 接口和测试替身，再做 Windows 实现。

Windows 实现必须提供：

- 前台 HWND、进程名、窗口矩形。
- Per-Monitor DPI 和目标显示器工作区。
- 前台变更事件或低频有界轮询。
- IDE 边缘定位和多显示器坐标转换。

原生方案在单独技术验证中选择，标准是：Electron 当前版本可构建、无凭据访问、可打包、空闲资源可控、Windows 10/11 可用。不得把不稳定原生依赖直接耦合到 UI。

## 8. 推荐目录结构

```text
codex-usage-monitor/
├─ electron/
│  ├─ main.ts
│  ├─ preload.ts
│  ├─ ipc/
│  ├─ bridge/
│  ├─ settings/
│  ├─ tray/
│  ├─ native/
│  └─ windows/
├─ renderer/
│  ├─ src/
│  │  ├─ app/
│  │  ├─ components/
│  │  │  ├─ ui/
│  │  │  ├─ surfaces/
│  │  │  └─ usage/
│  │  ├─ domain/
│  │  ├─ hooks/
│  │  ├─ i18n/
│  │  ├─ stores/
│  │  └─ styles/
│  └─ index.html
├─ shared/
│  ├─ desktop.ts
│  ├─ ipc-contract.ts
│  └─ settings.ts
├─ server/                 # 保留现有数据核心
├─ tests/
│  ├─ server/
│  ├─ renderer/
│  ├─ electron/
│  ├─ e2e/
│  └─ visual/
├─ docs/
│  ├─ 01-product-requirements.md
│  ├─ capability-matrix.md
│  └─ ui-designs/
├─ AGENTS.md
├─ HANDOFF.md
├─ DEVELOPMENT-PLAN.md
└─ README.md
```

## 9. 组件实现顺序

### 9.1 Foundations

- 从 `design-tokens.json` 生成 TypeScript token 和 CSS variables。
- 建立 Light / Dark 两个 theme class；Auto 只做解析。
- 接入 Fluent 图标；不使用 Unicode 或近似软盘图标。
- 建立 GlassSurface、IconButton、MetricValue、StatusLabel、Divider。

### 9.2 ProgressRing

用可测试的 SVG 几何实现：

1. OuterHalo。
2. OuterBorder。
3. Rail。
4. 左侧 Ticks。
5. InnerDisc。
6. ProgressArc + StartKnob。

必须覆盖 Hero / Side / Orb / Mini / Handle 五种尺寸，以及
0 / 19 / 20 / 49 / 50 / 100 / unavailable 边界状态。

### 9.3 Surface components

顺序固定：

1. Card：覆盖最多的数据与状态，先建立完整领域适配。
2. Indicator Bar：复用 formatter 与状态组件。
3. Orb：复用 ring 和健康度。
4. Edge Capsule：复用指标与操作按钮，并完成展开状态机。

## 10. 设置、托盘与国际化

设置文件：`app.getPath("userData")/settings.json`（Electron 惯例；Win 上即 `%APPDATA%\codex-usage-monitor\settings.json`）。

只保存：

- display preference。
- theme preference。
- active client。
- language。
- 各形态位置、吸附边和显示器标识。
- auto-launch preference。

要求：

- schema 校验、默认值和版本迁移。
- 原子写入；损坏时回退默认值，不阻止应用启动。
- 不保存 bridge key、配额数据、Token 快照或凭据。

托盘菜单至少包含：

- 打开 Card。
- 展示模式：Auto / Card / Bar / Orb。
- 客户端：Codex / ZCode。
- 主题：Auto / Light / Dark。
- 语言：简体中文 / English。
- 刷新。
- 开机启动。
- 退出。

i18n 要求：

- 默认跟随系统语言（优先 `app.getPreferredSystemLanguages()[0]`，回退 `app.getLocale()`）；无法识别（非 `zh*`）时回退 English。
- 用户选择后持久化。
- UI 不拼接中文句子；时间、数字和复数通过 formatter。
- 中英文在相同窗口尺寸下验证截断和基线。

## 11. 数据刷新与恢复

- 启动后立即读取。
- 可见窗口每 60s 刷新；隐藏或收起状态每 300s。
- 5s 内并发请求合并。
- 手动刷新立即执行，但复用进行中的请求。
- 最多 3 次有界重试，避免无限快速重试。
- 刷新失败保留最后有效快照。
- 单客户端失败不影响另一个客户端。
- bridge 启动失败时 UI 显示离线状态并提供重试，不显示空白透明窗口。

## 12. 交互与可访问性

- 所有按钮有 tooltip、accessible name、键盘焦点和可见 focus ring。
- 不只用颜色表达状态。
- 正文对比度至少 4.5:1；图标、边框和轨道至少 3:1。
- Card/Bar 可通过键盘完成主题、形态、客户端切换和退出。
- 拖动阈值为 6 DIP，拖动不得误触开展开。
- 系统关闭动画时禁用展开/收起动画。
- 动效不得造成布局跳动，按钮状态不得改变尺寸。

## 13. 测试体系

### 13.1 保留的回归测试

- 现有 `server/` 黑盒测试全部继续通过。
- bridge 路由、Bearer 鉴权、故障隔离和数据规范化保持兼容。
- 新 UI 测试不得通过修改数据核心来“修”显示问题。

### 13.2 新增测试

- Domain unit：quota 分类、freshness、health、formatter、缺失字段。
- Component：四形态、主题、客户端、数据态和交互态。
- Electron integration：sandbox、preload、IPC sender 校验、单实例、bridge 生命周期。
- Settings：默认值、损坏恢复、版本迁移、原子写入。
- E2E：启动、切换客户端、切换形态、主题、刷新、托盘、退出。
- Native Windows：前台切换、DPI、多屏、吸附、IDE 贴附。
- Accessibility：键盘路径、focus、名称、对比度。
- Visual regression：固定 viewport 与 DPR 的参考截图对比。

### 13.3 视觉验收方法

不再依赖 Figma：

1. 使用 `docs/ui-designs/01-05*.png` 和 `visual-spec.md` 作为设计源。
2. 为每个关键状态生成固定尺寸应用截图。
3. 与参考图并排检查，并做 50% 透明叠加。
4. 差异分级：
   - P0：结构、尺寸、错误图标、缺失状态、圆环裁切。
   - P1：字体、基线、间距、颜色、材质、圆环层级。
   - P2：阴影、光晕和 1–2px 光学校准。
5. P0/P1 必须清零；P2 有记录并获接受后才能进入 RC。

## 14. 性能和兼容目标

- Windows 10 1809+、Windows 11。
- 100 / 125 / 150 / 200% DPI。
- 单屏、双屏、多屏与负坐标显示器。
- 冷启动目标小于 3s。
- 空闲 CPU 目标小于 1%。
- 空闲内存目标小于 150MB；100MB 作为优化目标，不作为 Electron 初版阻塞门槛。
- 动画目标 60 FPS，最低不低于 30 FPS。
- 不因透明窗口持续全速重绘。

## 15. 开发阶段与强制验收门槛

阶段不按“窗口能打开”判定完成，只按验收项判定。

### Phase 0 — 基线冻结

- 记录旧 release 的功能清单、设置行为和四形态截图。
- 保留一个可运行的旧 release 回退包。
- 现有数据层测试全绿。

Gate：功能对照矩阵建立，旧版可随时启动。

### Phase 1 — 架构基座

- Electron / React / Tailwind / shadcn/ui / i18n。
- 安全 preload、窄 IPC、bridge 生命周期、四窗口规格。
- 透明窗口失败时必须显示错误面板而不是空白。

当前状态：基础骨架已完成，错误兜底、测试和目录收敛仍需补齐。

Gate：开发窗口稳定启动，bridge 可用/不可用两种状态都可见，安全测试通过。

### Phase 2 — 领域模型与真实数据

- `UsageViewModel`、quota/data/health 分类。
- formatter、倒计时、轮询、stale 与最后快照。
- Codex/ZCode 所有数据边界。

当前状态：真实数据已接入，但仍直接显示基础状态，领域适配未完成。

Gate：以 fixture 覆盖全部数据矩阵，不出现虚构值。

### Phase 3 — Card 完整实现

- Foundations、GlassSurface、ProgressRing、Codex/ZCode Card。
- 标题操作、客户端切换、主题和刷新。
- Light/Dark 与关键数据态。

Gate：Card 功能与旧 release 对等；参考图 P0/P1 清零。

### Phase 4 — Bar 完整实现

- 单行基线、压缩策略、IDE 贴附和操作区。

Gate：600px 与 Compact 宽度无换行、无重叠；前台 IDE 切换稳定。

### Phase 5 — Orb / Edge Capsule

- 收起、展开、悬停延迟、拖动阈值、贴边、多显示器。

Gate：四形态均使用真实数据；连续操作无闪白、误触或位置跳变。

### Phase 6 — Windows 系统集成

- 前台进程识别、自动模式、DPI、系统主题、托盘、开机启动。

Gate：Windows 10/11、四档 DPI、至少双屏完成真实验证。

### Phase 7 — 设置、i18n、可访问性

- 设置迁移、中文/英文、键盘与 focus、对比度和 reduced motion。

Gate：重启后偏好和位置恢复；中英文核心流程完整。

### Phase 8 — 打包、回归和发布

- 生产构建、portable 包和安装方式。
- E2E、视觉回归、性能、安全和升级/回退验证。
- README 与发布说明。

Gate：完整功能对照矩阵全部通过后才能称为 Beta；全部发布门槛通过后才能替代旧 release。

## 16. 功能对等矩阵

每项必须有代码、测试和人工验证证据：

| 能力 | 旧版 | 当前 Electron | 发布要求 |
| --- | --- | --- | --- |
| 数据桥接 | 完整 | 已接入 | 保持兼容 |
| Codex/ZCode | 完整 | 原始数据可用 | 所有状态正确渲染 |
| Card | 完整 | 骨架 | 视觉与功能对等 |
| Indicator Bar | 完整 | 仅窗口规格 | 完整 |
| Orb | 完整 | 仅窗口规格 | 完整 |
| Edge Capsule | 完整 | 仅窗口规格 | 完整 |
| Light/Dark/Auto | 完整 | 仅系统主题上下文 | 完整 |
| 自动前台切换 | 完整 | D-3 完成（真机验收通过） | 完整 |
| DPI/IDE 贴附 | 完整 | 部分（多屏/混合 DPI 真机待验） | 完整 |
| 拖动/贴边/展开 | 完整 | D-3 完成（真机验收通过） | 完整 |
| 托盘 | 完整 | E-F 完成（真机手测待用户） | 完整 |
| 开机启动 | 完整 | 未实现（留 Milestone H 打包时做） | Electron 原生链路 |
| 设置持久化 | 完整 | E-F/G 完成（theme/client/language/displayPreference 落盘，真机手测待用户） | 含迁移 |
| i18n | 无 | E-F 完成（中英文切换 + 持久化，真机手测待用户） | 中英文完整 |
| 打包发布 | WPF portable | 未实现（Milestone H） | Electron portable/installer |

## 17. Definition of Done

只有以下条件全部满足，Electron 重构才算完成：

- 四种形态、两种客户端、三种主题全部可用。
- Codex 四种 quota state 与所有 data state 正确。
- ZCode 没有任何虚构配额。
- 自动模式、前台识别、IDE 贴附、DPI、多屏、拖动和贴边通过。
- 托盘、开机启动、设置迁移、中英文通过。
- bridge、server 和 MCP 回归测试全部通过。
- Renderer、Electron、E2E、视觉、安全和性能测试通过。
- 图稿对比 P0/P1 清零。
- 能打包、安装、升级、卸载并回退。
- README、HANDOFF、开发方案和发布说明一致。
- 用户确认 Electron 版可以替代旧 release。

## 18. 仓库清理方案

本节只描述候选项，不授权自动删除。依据项目安全规则，目录或批量文件必须由用户手动删除；单文件也应逐个确认。

### 18.1 可随时重新生成的缓存和构建产物

这些不属于源代码，可以清理，但清理后需要重新构建或安装：

| 路径 | 当前约占用 | 恢复方式 |
| --- | ---: | --- |
| `node_modules/` | 512 MB | `npm ci` |
| `out/` | 0.8 MB | `npm run build:desktop` |
| `dist/` | 0.2 MB | `npm run build:server` |
| `bundle/` | 78 MB | 旧 portable 构建脚本重新生成 |
| `figma-plugin/node_modules/` | 包含在下项 | 已不需要 |
| `figma-plugin/dist/` | 包含在下项 | 已不需要 |

开发仍在进行时建议保留根 `node_modules/`，否则每次继续开发都要重新安装。

### 18.2 现在即可删除的 Figma 工具链

新方案已经吸收了仍有价值的 token、组件结构和视觉规则，以下内容不再参与开发：

- 整个 `figma-plugin/`。
- `scripts/delete-figma-program.ps1`
- `scripts/figma-api-component-creator.js`
- `scripts/figma-api-create.js`
- `scripts/figma-api-generate.js`
- `scripts/figma-automated-create.cjs`
- `scripts/figma-browser-console-script.js`
- `scripts/figma-desktop-fixer.ps1`
- `scripts/figma-diagnose-import-issue.ps1`
- `scripts/figma-direct-create.bat`
- `scripts/figma-fix-simple.ps1`
- `scripts/figma-fresh-install.ps1`
- `scripts/figma-manual-create.ps1`
- `scripts/figma-offline-test.ps1`
- `scripts/figma-reinstall-guide.ps1`
- `scripts/figma-simple-diagnose.ps1`
- `scripts/force-delete-figma.ps1`

### 18.3 现在即可删除或合并的旧流程文档

以下内容由本文件和 `docs/ui-designs` 取代：

- `elegant-skipping-parnas.md`
- `design-qa.md`
- `docs/00-development-workflow.md`
- `docs/02-design-specification.md`
- `docs/03-technical-constraints.md`
- `docs/AGENTS-GUIDE.md`
- `docs/figma-build-guide.md`
- `docs/figma-build-summary.md`
- `docs/figma-card-specs.md`
- `docs/figma-direct-instructions.md`
- `docs/figma-edge-capsule-specs.md`
- `docs/figma-indicator-bar-specs.md`
- `docs/figma-manual-create-guide.md`
- `docs/figma-menu-navigation.md`
- `docs/figma-orb-specs.md`
- `docs/figma-plugin-run-guide.md`
- `docs/figma-quick-start-guide.md`
- `docs/typography-color-standard.md`
- `docs/ui-development-workflow.md`
- `docs/ui-deviations.md`
- `docs/ui-implementation-map.md`
- `docs/ui-ux-visual-spec.md`

`docs/README.md` 应重写成简短索引，而不是继续保留旧流程入口。

### 18.4 `docs/ui-designs` 内的清理

必须保留：

- `00-ui-design-package-overview.png`
- `01-card-states-light.png`
- `02-indicator-bar-states.png`
- `03-orb-edge-capsule-states.png`
- `04-visual-system-typography.png`
- `05-card-states-dark.png`
- `design-tokens.json`
- `visual-spec.md`
- `README.md`

可以删除：

- `figma-build-state.json`
- `figma-component-blueprint.md`
- `figma-components-report.md`
- `prompts.md`
- 空目录 `figma-inspection/`

### 18.5 Electron 完整替代旧 release 后才能删除

以下是当前唯一完整功能基线与回退链路，现在不能删：

- `companion/CodexUsageMonitor.ps1`
- `companion/UsageMonitor.xaml`
- `scripts/build-portable.ps1`
- `scripts/install-floating-window.ps1`
- `scripts/manage-startup.ps1`
- `start-floating-window.cmd`
- `start-floating-window.vbs`
- `portable.iss`
- `usage-monitor-portable.exe`

退役条件：

1. Phase 8 Gate 通过。
2. Electron 安装、开机启动、托盘和退出行为验证完成。
3. 用户确认新 release 可替代旧版。
4. 至少保留一个带版本号的旧 release 包在仓库外或发布页作为回退。

### 18.6 永久保留

- `.codex-plugin/`
- `.mcp.json`
- `server/`
- `tests/` 中的数据层测试与 fixtures。
- `skills/`
- `LICENSE`
- `package.json`、`package-lock.json`
- Electron / renderer / shared 源码和构建配置。
- `docs/01-product-requirements.md`
- `docs/capability-matrix.md`
- 本文件、`AGENTS.md`、更新后的 `HANDOFF.md` 与 `README.md`。

## 19. 每阶段工作纪律

每个开发阶段都执行：

1. 先选定一组明确状态和目标形态。
2. 更新或补齐 view model fixture。
3. 实现组件与交互。
4. 跑类型检查、lint、format、单元测试和现有数据回归。
5. 启动真实应用验证。
6. 生成固定 viewport 截图，与参考图对比。
7. 更新功能对等矩阵和 handoff。

### 19.1 强制纪律（来自 Milestone A 复验教训）

下列 8 条纪律来自 `AGENT_LESSONS.md`（反模式 A-H），**每条都对应一个真实的 P1 bug**。每个阶段交付前必须对照自检：

| # | 纪律 | 自检问题 |
|---|---|---|
| A | 派生 server 行为先读源码 | 我读了对口 server 源码吗？注释引用了行号吗？ |
| B | 状态必须可判别 | 返回值能区分所有状态吗？没用 null 折叠？ |
| C | 红线无条件强制 | ZCode/配额缺失/今日匹配在 domain 层强制了吗？有畸形输入测试？ |
| D | 分类集合文档化 | 每个分类成员都注释了吗？没混语义？ |
| E | 期望值先行 | 测试断言来自规格（不是我的实现）？ |
| F | 纯函数五类输入 | null/空/非法/边界都测了？ |
| G | 改动前评估影响 | 我改的配置/共享类型，下游受影响点列过了？ |
| H | 空骨架先行 | 新加代码类别前，最小骨架先跑通 `npm run check`？ |

任一项答"否"或"不确定"，停下来补完再继续。详细反模式、案例和修复参考见 `AGENT_LESSONS.md`（A-H 节）。

禁止：

- 用占位首页冒充已完成应用。
- 因为新技术栈难实现就删减旧功能。
- 在 UI 组件里直接散落原始快照解析逻辑。
- 在 renderer 中暴露 bridge key 或 Node 能力。
- 未验证就删除旧 WPF 回退。
- 未达到 Gate 就把阶段标记完成。
- 实现完成后反向修改测试期望值（违反纪律 E）。
- 把语义不同的 code 塞进同一个分类集合（违反纪律 D）。

## 20. 下一开发动作

按以下顺序继续：

1. 冻结旧 release 截图和功能基线。
2. 建立 `UsageViewModel`、fixture 和状态分类测试。
3. 从 `design-tokens.json` 生成 CSS variables。
4. 实现 GlassSurface、Fluent IconButton 和 ProgressRing。
5. 完成 Codex/ZCode Card 的全部状态。
6. 通过 Card 的视觉对比 Gate 后，再进入 Bar、Orb 和 Edge Capsule。
