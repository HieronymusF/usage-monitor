# HANDOFF — codex-usage-monitor

> 最后更新：2026-07-22（EdgeCapsule v30：Fluent SVG 主题图标 + refresh-error 短提示防溢出，385 测试全绿，视觉 QA 通过）
> 项目：`D:\TokenUsage\plugins\codex-usage-monitor`
> 分支：`main`
> HEAD：`e29a1cf`（未含工作区任何改动：server timeZone + milestone B/C/D-1/D-2 产出 + EdgeCapsule v7-v30 迭代 + D-2 收尾 + 文档统一均未 commit）

本文档只记**当前状态**和**下一步**。历史 milestone 压成一句话索引（§5）。
跨任务复用的 lessons 和契约在 `AGENT_LESSONS.md`；产品定义在 `docs/01-product-requirements.md`；
开发阶段 / Gate / 清理在 `DEVELOPMENT-PLAN.md`；UI 规则在 `DESIGN_SYSTEM.md`。

## 1. 权威顺序（冲突时按此裁决）

```
AGENTS.md                            安全 / 隐私 / 协作红线；UI 视觉源规则；代码纪律
  > HANDOFF.md（本文件）              当前进度 / 下一步 / 不要踩的坑
  > AGENT_LESSONS.md                  跨任务 lessons + Milestone A 复验 8 反模式
  > DEVELOPMENT-PLAN.md               产品范围 / 架构 / 阶段 Gate / 清理方案
  > docs/01-product-requirements.md   产品定义 / 四形态 / 状态矩阵 / 文案
  > docs/capability-matrix.md         Codex / ZCode 数据能力事实
  > docs/ui-designs/visual-spec.md + design-tokens.json   可测量视觉基线
  > docs/ui-designs/00-05*.png        构图 / 层级 / 材质 / 色彩方向
  > 旧 WPF 实现                       仅用于核对现有行为和回归
```

## 2. 开工必读（按顺序）

1. `AGENTS.md` —— 安全红线、DESIGN_SYSTEM 强制工作流、代码纪律 8 条。
2. 本文件。
3. `AGENT_LESSONS.md` —— L1-L13 跨任务 lessons + A-H Milestone A 复验反模式。
4. `DEVELOPMENT-PLAN.md` —— 阶段 Gate、目录结构、清理方案。
5. `docs/01-product-requirements.md` —— 产品意图、四形态、完整状态矩阵。
6. `docs/capability-matrix.md` —— Codex / ZCode 数据真实可用性。
7. `docs/ui-designs/visual-spec.md` + `design-tokens.json` —— 视觉基线。
8. `DESIGN_SYSTEM.md` —— UI 怎么做（token / Layout 原语 / 8 步工作流）。

## 3. 安全与协作红线

### 文件操作

- 禁止批量或递归删除。不得用 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
- 删除文件一次只能处理一个明确路径。目录清理由用户手动完成。

### 工作区

修改前看 `git status --short`，保留所有现有改动。禁止 `git reset --hard` / `git checkout --` / `git clean` / 回退不属于当前任务的改动。未跟踪文件不是垃圾。

### 产品与隐私

- 不伪造数据。ZCode 没有官方配额，永不显示剩余百分比或重置倒计时。
- Codex 配额缺失时显示「服务未提供」，不显示 0% / 100% / 估算值。
- 不读取或转发 credentials / cookie / token / API key / 对话正文 / 工具参数 / 文件正文。
- 不提供购买、消费、账户修改或历史删除等写操作。
- 不向第三方联网，不上传遥测。
- 不修改 Codex / ZCode / IDE 官方界面。

## 4. 当前状态

### 4.1 在做什么

工作区有大量未 commit 改动（已核实健康，`npm run check` 全绿 **385 测试** = 49 + 171 + 165）：
- server timeZone 对齐（bug 修复，§5 + §7 已补记）
- milestone B/C/D-1 产出（renderer/electron/shared/等）
- 文档精简 B 方案（HANDOFF 瘦身 + lessons 合并）
- **milestone D-2 Orb v6 完成**（Orb 82×136 真胶囊 + ring 62）
- **EdgeCapsule D-2 完成（v7→v30）**：视觉/结构迭代（v7-v25）+ 功能收尾与复验（v26-v30）。当前 **v30** 实际状态：
  - **尺寸** 720×180（8 处文档统一，§5 历史 v13 从 640×210 改）
  - **主卡片**完整圆角矩形 + 右侧弧形翼片 SVG 覆盖层，单一 GlassSurface surface="capsule" + mask
  - **RightControls** 统一容器（grid 58+24+92 = ActionRail+gap+EdgeWing）
  - **Grid 3 列** `repeat(3, minmax(0,1fr))`，2 条 DividerLine（120px，var(--c-tertiary) color-mix）
  - **信息结构**：CODEX·PLUS / 每周额度 / 64%+orb ring；重置 / 倒计时；今日 Token / 数值 / 更新于（**更新于只在今日区一次**，左侧重复已删）
  - **token 化**：颜色全用 `var(--c-ink/-secondary/-tertiary)`（删 inkColor/secondaryColor/tertiaryColor 函数）；字号用 typography token（displayS 34 / metricL 28 / labelL 16 / body 14 / caption 13）
  - **ActionRail** 复用 `IconButton size="rail"`(40×40)，3 按钮：切换客户端 / 刷新 / 主题三态循环。图标统一用 `@fluentui/react-icons` 官方 SVG（PersonSwap / ArrowClockwise / DarkTheme·WeatherSunny·WeatherMoon）
  - **收起控件** native `<button>`，`onClose` 调 `window.monitor.showSurface("orb")` → showOnly 切回 Orb（不退出应用）。showSurface IPC 有 `validateSurfaceKind` 运行时校验 + showOnly rejection 捕获
  - **主题三态** auto→light→dark→auto（`nextThemePreference` 纯函数）。**持久化延后 Milestone G**（未实现）
  - **refresh-error**：useUsageViewModel 读 `usageStore.error`（单一真相）；refresh 失败保留旧快照，第三列用短提示“刷新失败”替换更新时间，完整说明放 title，不侵入 ActionRail
  - **FIXED_NOW**：preview 模式用 fixture BASE_TIME 作 now，让 todayKey 命中 fixture bucket（修今日 token 显示 —）。生产 now 不变
  - **SWR 去重**：useUsageViewModel 透传 refresh，EdgeCapsule 单一订阅源
  - **测试**：EdgeCapsule 26 测试（含 3 外层真实接线）+ FluentIcon 2 + useUsageData 2 + refresh-error 集成 2 + validateSurfaceKind 3
  - **视觉 QA**：`design-qa.md` 已通过；v30 Auto/Dark 和真实 refresh-error 截图在 `C:\Users\Jerome\.codex\visualizations\2026\07\22\v30-fix`

用户决定**暂不 commit**。下一轮候选：
- D-3 自动模式 / 前台探测（详见 §8.1）
- 共享层玻璃材质整体优化（aurora wash 强度、内部高光、双层边缘、环境光晕）
- E-F 托盘/设置/开机自启

### 4.2 卡点

无。

### 4.3 运行环境

- Node `v24.15.0` / npm `11.14.1`
- Electron `43.1.1` / electron-vite `5.0.0` / React `19.2.7` / Vite `7.3.6`
- 当前没有 Electron 应用进程在运行。
- **注意：用户系统是 dark 主题**（`nativeTheme.shouldUseDarkColors=true`），dev/capture 都在 dark 下渲染。文字颜色对比度问题部分源于 dark 玻璃背景偏浅，需要后续玻璃材质优化。

### 4.4 最近一次验证

`npm run check` 全绿（**385 测试** = 49 + 171 + 165）；`npm audit --audit-level=high` 0 漏洞；Electron production build 通过；插件校验通过；`design-qa.md` final result = passed。

### 4.5 v28 最终修正（2026-07-22，5 项）+ 已知限制

v28 修复 v27 复验指出的 5 项缺陷：
- **refresh-error 数据链统一**：useUsageViewModel 从读 SWR `usage.error` 改为读 `usageStore.error`（单一真相）。refresh 失败时 useUsageData.refresh 调 store.setError → vm 读到 → dataState 进 refresh-error。集成测试验证端到端：refreshUsage reject → vm.dataState==="refresh-error" + client 保留。
- **Segoe Fluent Icons 真替换**：新建 FluentIcon 组件（`SegoeIcons.ttf` PUA codepoint，来自 Microsoft Learn 官方表）。EdgeCapsule ActionRail 3 按钮全用 FluentIcon。codepoint：SwitchUser e748 / Refresh e72c / **FillColor(auto) e791**（v29 修正：原 e97e HalfAlpha 是 IME 字母"A"）/ Brightness(light) e706 / LowerBrightness(dark) ec8a。**约束**：Segoe Fluent Icons 无 Moon 字形，dark 用 LowerBrightness（弱光太阳）；auto 用 FillColor（对比半圆，非 sun+moon）。每个 codepoint 用 fonttools 渲染 + 视觉确认后采纳。非 Windows fallback lucide。
- **showSurface IPC 运行时验证**：抽 `validateSurfaceKind` 纯函数（shared/desktop.ts），ipc.ts 用它校验 payload，非法 kind 忽略 + 记录。showOnly rejection 用 `.catch()` 捕获。3 测试覆盖合法/非法字符串/非字符串类型。
- **HANDOFF 清理**：§4.1/§7/§8 更新到 v28 实际状态，删 ArrowLeftRight/window.close/lucide-as-Fluent 等 v26 混写。L9-L11 移入 AGENT_LESSONS（HANDOFF §9 只留指针）。v26/v27 详细描述只留 §5 历史。
- **DPI 如实标注**：见下方限制。

**v29 P1 修复**：
- **Auto 图标字母 A bug**：v28 的 themeAuto 用 E97E（HalfAlpha），fonttools 提取轮廓确认是 IME 半角"字母 A"不是半圆。改 E791（FillColor），视觉确认是垂直半填充圆（对比/自动语义）。教训已写入 `AGENT_LESSONS.md` L12。
- **Orb 位置保持**：showOnly 加位置传递——读当前可见窗口 bounds → `screen.getDisplayMatching` 解析显示器 → 目标窗口 setPosition 到同显示器右下锚点（复用 WPF Set-OrbExpanded 算法：anchor 右下 + clamp workArea + 6px 边距）。修复副显示器收起跳主显示器的 P1。无 IPC 签名改动（main 自己读窗口）。
- **refresh-error 可见提示**：TodaySection row4 加 `dataStateHint`——refresh-error 渲染 `· footer.error`（var(--c-danger)），stale 渲染 `· footer.stale`（var(--c-warning)）。复用 Card CardFooter 模式 + 已有 i18n key。数据不替换（PRD §6.6：保留上次快照 + 一行短提示）。+1 测试。

**v30 最终复验修复**：
- **Fluent SVG 主题图标**：移除 Segoe PUA / 平台判断 / lucide fallback，改用 `@fluentui/react-icons` 官方 SVG。Auto=`DarkThemeRegular` 明暗半圆，Light=`WeatherSunnyRegular`，Dark=`WeatherMoonRegular`；新增 2 项组件测试并完成 Auto/Dark 实机截图。
- **refresh-error 防溢出**：异常时以 `footer.errorShort` 替换更新时间，完整 `footer.error` 放 title；状态节点固定 max-width + ellipsis。真实终止 companion bridge 后点击刷新，旧数据保留、短提示完整留在第三列。
- **多显示器真机验收完成**：EdgeCapsule 在副显示器收起后 Orb 保持相同右下锚点，不跳主屏。

**已知限制（未完成，留后续 milestone）**：
- **DPI 截图是 device emulation**：125/150/200 三图字节一致（capturePage 输出逻辑像素 720×180，deviceScaleFactor 只改渲染器观察的 device-pixel-ratio，不产生更高分辨率像素）。**真实 Windows DPI / 字体清晰度未验收**，留 D-3 真机。不能据此声称"高 DPI 已验证"。
- **主题持久化未实现**：themeStore 仍 in-memory（preference 不落盘），留 Milestone G。

已知并已修复的启动陷阱：sandbox preload 必须构建为 CommonJS（`out/preload/index.cjs`），`electron/windows/manager.ts` 加载 `../preload/index.cjs`，不要改回 `index.mjs`，否则 `window.monitor` 不注入。

## 5. Milestone 历史（一句话索引）

详细契约 / 已交付 / 验收数字见 `git log` 和对应代码 + 测试。下表只用来快速定位"做到哪了"。

| 日期 | Milestone | 一句话 |
|---|---|---|
| 2026-07-15 | Phase 0 | 旧 WPF release 基线冻结 + 数据层测试全绿 |
| 2026-07-16 | Phase 1-2 | Electron + React + shadcn/ui 骨架；companion bridge 接入；真实数据轮询 |
| 2026-07-18 | Milestone A | `UsageViewModel` + quota/data/health 分类 + token/countdown formatter（两轮复验，契约见 AGENT_LESSONS A-H） |
| 2026-07-18 | Milestone B | Foundations 组件库（GlassSurface/IconButton/MetricValue/StatusLabel/Divider/ProgressRing 6 层）+ Light/Dark/Auto 三主题 |
| 2026-07-18 | Design System Stage 1 | `DESIGN_SYSTEM.md` + `Stack/Inline/Grid` Layout 原语 + CodexCard/TokenTray 示范迁移（修不对称 padding / borderRadius / lineHeight 坑） |
| 2026-07-19 | Milestone C-1 | ZCodeCard 真实实现（Hero + SidePanel + 整卡，12 测试） |
| 2026-07-19 | Milestone C-2 | CodexCard quota 子组件测试补全（4 quotaState × 子组件矩阵，17 测试） |
| 2026-07-19 | Milestone C-3 | 客户端切换链路测试（usage-store 7 测试）+ 视觉验收工具（capture.mjs / diff.mjs / pixelmatch） |
| 2026-07-19 | Ring 简化-1 | WeeklyHeroRing 重写为简版 2 层 ring（删刻度 / 删渐变 / 删 halo，端点对称） |
| 2026-07-19 | Ring 简化-2 | WeeklySideRing 推广同款简版 ring（第 2 处，未抽 SimpleRing，等第 3 处） |
| 2026-07-19 | 缺口修 | tsx paths 缺口修（renderer 7 处 `@/` → 相对路径）+ 窗口尺寸随 client 切换（setResizable workaround，issue #49173） |
| 2026-07-19 | server timeZone 对齐 | 数据层 bug 修复：server daily bucket key 从 UTC 日（`toISOString().slice(0,10)`）改为本地自然日，与 renderer todayKey 对齐（修 UTC+8 凌晨"今日"显示成昨天）。新增 `server/time.ts`（`toLocalDateKey`/`todayKey`/`dateKeyDaysAgo`）+ `tests/time.test.js` + `tests/sessionLogReaderTimezone.test.js`。触碰 §6 红线，理由：数据层独立 bug（见 §7 契约） |
| 2026-07-20 | Milestone D-1 | Indicator Bar 完成（Codex 4 段 + ZCode 4 段 + 2 按钮 + 红线，8 测试） |
| 2026-07-20 | 文档精简（B 方案）| HANDOFF 62K→10K（§10.x 压成索引）；`docs/lessons-learned.md` 删除并入 AGENT_LESSONS（12K→21K）；6 处指针改 |
| 2026-07-20 | Milestone D-2 | Orb（82×136，ProgressRing size="orb" 62×62，真胶囊 radius 41）+ EdgeCapsule v7-v26（详见下行）+ App.tsx surface 路由扩展。Orb 15 测试。 |
| 2026-07-20 | EdgeCapsule v7→v17 | 用户反馈驱动 10+ 轮视觉/结构迭代。关键节点：**v11** 单一复合 SVG mask、**v12** 信息结构按原型图重组 + Grid 4 列 + 删 5H + 删左侧更新时间、**v13** H 210→180、**v14** 修 Grid 换行 bug、**v15** 主卡片右缘内凹 cubic（产生黑色缺口）、**v16** 两个 path 并集消除黑色缺口、**v17** 胶囊嵌入主卡片右侧内部 + 工具栏收窄 + 文字对比度修复。 |
| 2026-07-22 | EdgeCapsule v18→v25 | 视觉精修（v17 基础上）：**v18-v19** 文字对比度（显式颜色函数 inkColor/secondaryColor/tertiaryColor 绕过 capture 模式 var() 解析问题）、**v20** 完整重写（3 数据列等宽 + 信息结构 + 胶囊融合 + 删 overflow 截断）、**v21** 主卡片普通圆角矩形 + 右侧弧形翼片 SVG 覆盖层（删"双卡片拼接"）、**v22** 统一 RightControls 容器（58+24+92 grid，解决 ActionRail/EdgeWing 重叠）、**v23** 翼片弧线向左展开包裹圆环（wingIndentX -10）、**v24** 圆环/状态点右移 8px（calc(50%+8px)）、**v25** 三项优化（统一基线 grid-template-rows + 分隔线缩短 120px + 减弱阴影）。 |
| 2026-07-22 | EdgeCapsule v26（D-2 收尾）| 功能接入 + token 化 + 规范统一（详见 §4.1）。行为接入真实 store/bridge、ActionRail 复用 IconButton、收起控件改 native button、主题三态循环、删除硬编码 hex/字号、删重复「更新于」、capture 工具支持 theme/scale、行为测试、文档尺寸统一。23 测试（18 结构 + 5 行为）。 |
| 2026-07-22 | EdgeCapsule v27（D-2 最终验收）| 9 项最终验收修复（详见 §4.5 历史）。showSurface("orb") IPC（不再 window.close 退出）、FIXED_NOW 预览时钟（修今日 token 显示 —）、refresh-error + 保留旧快照、SWR 去重（vm 透传 refresh）、外层行为测试（showSurface/refresh/switchClient 真实接线）、图标 size 18、7 张截图、删 nul 文件。+5 测试。 |
| 2026-07-22 | EdgeCapsule v28（D-2 最终修正）| 5 项修正（详见 §4.5）。refresh-error 数据链统一（vm 读 store.error，集成测试验证 dataState）、Segoe Fluent Icons 真替换（FluentIcon 组件 PUA codepoint，非 Windows fallback lucide）、showSurface IPC 运行时校验（validateSurfaceKind + rejection 捕获）、HANDOFF 清理（v26/v27 只留历史）、DPI 如实标注。+5 测试（refresh-error 集成 2 + validateSurfaceKind 3）。 |
| 2026-07-22 | EdgeCapsule v29（P1 修复）| 3 个 P1：① Auto 图标字母 A bug（E97E HalfAlpha 是 IME 字母，改 E791 FillColor 对比半圆，fonttools+视觉确认）；② Orb 位置保持（showOnly 读旧窗口 bounds + screen.getDisplayMatching，setPosition 到同显示器右下锚点，复用 WPF 算法）；③ refresh-error 可见短提示（TodaySection row4 加 · footer.error/stale，复用 Card 模式）。+1 测试。 |
| 2026-07-22 | EdgeCapsule v30（最终复验）| 2 个 P1 清零：主题改用官方 Fluent SVG（Auto 明暗半圆 / Light 太阳 / Dark 月亮）；refresh-error 改为短提示替换更新时间并限制在第三列。+2 FluentIcon 测试，385 测试全绿，`design-qa.md` passed。 |

## 6. 不要修改的稳定层

除非测试证明数据层存在独立 bug，否则不要修改：

- `server/`
- companion bridge 路由和鉴权方式
- MCP 工具契约
- `companion/` 旧 WPF 实现
- 旧 release 回退文件

新 UI 出现显示问题时，优先修复 renderer domain adapter / formatter / view model / component / Electron 窗口或 IPC，不要通过改变数据核心迎合 UI。

## 7. 已确立的契约（不要推翻，改前先讨论）

下列契约已被代码 + 测试锁定，修改前在 issue / 对话里讨论，不要静默改动。详细叙述见 `git log` 和对应 milestone 的 commit / 测试。

- **Milestone A（领域模型）**：`UsageViewModel` 始终非 null；`QuotaWindowKind` 三态（five-hour/weekly/other，unknown 进 extraQuotaWindows 不丢）；ZCode 无条件清空配额；今日 Token 按本地自然日（`server/time.ts` 的 `toLocalDateKey`）；DataState 优先级 offline/loading > refresh-error > stale > partial > fresh；健康度 `>=50 sufficient / 20-49 low / <20 critical / null unavailable`；Token 格式化 M/B 1 位小数、K 0 位。详见 `docs/01-product-requirements.md §7` + `tests/renderer/usage-view-model.test.ts`。
- **timeZone 对齐（2026-07-19，server 稳定层改造）**：`server/time.ts` 是 dateKey 单一真相。`SessionLogReader` 三层（`localSessionReader` / `codexSessionLog` / `zcodeSessionLog`）+ renderer `usage-view-model.ts` 都通过相对路径 import 同一份 `toLocalDateKey` / `todayKey` / `dateKeyDaysAgo`，两端零分歧。bucket key = record 时间戳在指定 IANA 时区下的自然日（用 `Intl.DateTimeFormat("en-CA", …)`）；Invalid Date 返回空串；非法 timeZone 防御性回退 UTC 切片不抛。生产默认 `timeZone=undefined`（系统本地，跟随用户机器）；测试显式注入（如 `"Asia/Hong_Kong"`）保证确定性，不依赖 `process.env.TZ`。**修这个 bug 允许动 server 稳定层**（§6 的"测试证明数据层存在独立 bug"豁免），但属于应被记录的契约变更，不是静默修改。测试：`tests/time.test.js`（8 例覆盖边界 / Invalid Date / 非法 tz）+ `tests/sessionLogReaderTimezone.test.js`（Codex + ZCode bucket 复现）。
- **Milestone B（Foundations）**：Token 单一真相 = `docs/ui-designs/design-tokens.json`，`tokens.ts` 是镜像，`tokens.test.ts` 守护；颜色用 CSS variables（`globals.css` `:root`/`.light`/`.dark`），不进 TypeScript；ProgressRing 几何纯函数，0% 画起点珠无弧、null 虚线 rail 无珠；窗口不可拉伸（4 个 window spec 都 `resizable:false`）。
- **Milestone C（Card）**：ZCode 永不渲染配额（红线测试守护，查 visible text 不扫 innerHTML）；ZCodeHero 用 `displayXL`，SidePanel lifetime 用 `displayS`；Card 窗口尺寸跟随 `client.kind`（codex 576×404，zcode 576×333）；底部 tray ZCode 用 `[today,lifetime]`，不复用 TokenTray（字段不同）。
- **Ring 简化**：WeeklyHeroRing + WeeklySideRing 用内联简版 2 层 ring（rail + progress），不用 ProgressRing 共享组件、无刻度、无渐变、无 halo、`stroke-linecap=round` 两端对称、`rotate(-90)` 起 12 点。第 3 处真实简版 ring 出现时按 G3 抽 `SimpleRing`。
- **Renderer 不用 `@/` 别名**：全部相对路径（7 处已迁移）。`renderer/tsconfig.json` 的 paths 保留（vite build 用）但源码不依赖。被测组件必须显式 `import React from "react"`。
- **BrowserWindow.setSize 在 resizable:false 窗口上**：必须 `setResizable(true) → setSize → setResizable(false)` workaround（Electron issue #49173）。
- **surface 路由用 URL param**：单一 renderer bundle，App.tsx 读 `?surface=` 决定渲染（card / indicator-bar / orb / edge-capsule 四态 switch）。生产由自动模式 + 托盘菜单驱动。
- **Bar 用同 vm**：不抽 useIndicatorBarViewModel。Bar 用 `typography.bar` token（14/20）。
- **Milestone D-2（Orb + EdgeCapsule）**：
  - **Orb/Capsule 用 ProgressRing 共享组件**（不是简版 ring）。有意双轨：Hero/Side 简化、Orb/Capsule 保留渐变+珠。决策点 A 已拍板 2026-07-20。
  - **Orb 82×136**（**v6 visible=window**，doc.md 第二版：外/背景/描边/裁切层完全重合无多层裁切）。**radius.orb=41（=半宽 82/2，真竖向胶囊：上下半圆 + 中间垂直侧边，doc.md 第三条）**。布局明确 px 绝对定位：grip top=10 → ring top=23（中心 y=54 = 40% 中上）→ ring 底=85 → 状态点 top=101（距 ring 底 16px）→ 距胶囊底 31px。`overflow:hidden` 保证内容不溢出胶囊轮廓。
  - **Orb Ring 62×62**（**v6 从 66 改 -6%**，doc.md 第二版第五条；同步改 ringGeometry.orb + visual-spec §7 + design-tokens）。Ring 62 在 82 宽内占 76%，左右各留 10px。状态点 v6 8→7px。
  - **Orb 主数字 = 5h 优先**（v3 改，对齐设计稿 42% = dual fixture 5h remaining）。Codex Dual/FiveOnly 显示 5h N% + "5H"；WeeklyOnly fallback weekly + "周"；NoQuota "—"。ZCode 红线：不渲染 ring/百分比，大数字 = 今日 Token，标签 = 今日，底部灰点。
  - **Orb 字号层级**（v3）：主数字 20px / weight 500；标签 12px；gap 3px。Orb.tsx inline override，不改 token。
  - **Orb 边缘**（v4 新增）：GlassSurface 共享层 `border:1px solid` 在小尺寸 Orb 上给了"黑边感"。Orb 局部 `borderWidth:0 + borderStyle:none` inline override 覆盖，改用 `boxShadow: inset 0 1px 0 white 50% + inset 0 0 0 1px white 18%` 表达边缘。**只动 Orb inline，不动 GlassSurface 共享层**（surgical，Card/Bar/Capsule 仍用原 border）。
  - **EdgeCapsule v30（720×180）**：当前最新版本（D-2 完成）。视觉/结构历史见 §5（v7-v25），功能收尾与复验 v26-v30。
    - **尺寸**：720×180。**8 处文档已统一到 720×180**（520×150 / 640×210 已清零，companionUi.test.js 冻结层除外）。
    - **主卡片**：完整 720×180 圆角矩形（4 角圆角 20），单一 GlassSurface surface="capsule" + SVG mask。
    - **右侧结构**：主卡片普通圆角矩形 + 右侧**弧形翼片 SVG 覆盖层**（path `M 92 0 C -10 30, -10 150, 92 180 L 92 0 Z`，向左展开包裹圆环）。统一 **RightControls 容器**（绝对定位 right:0 width:174，内部 grid `58px 24px 92px` = ActionRail + gap + EdgeWing）。
    - **CSS Grid 3 列** `repeat(3, minmax(0, 1fr))`，功能栏移出 Grid 到 RightControls。**禁止 flex space-between**。
    - **分隔线**：独立 DividerLine 元素（绝对定位，120px 高，垂直居中），2 条（重置 + 今日左侧）。颜色 `color-mix(var(--c-tertiary) 22%, transparent)`。
    - **信息结构**：CODEX·PLUS / 每周额度 / 64% + 主 ring（orb 52）；重置 / X天后；今日 Token / 主数值 / 更新于 HH:mm（**更新于只在今日区一次**）。
    - **文字层级**：主% `var(--c-ink)` displayS 34/700；CODEX `var(--c-ink)` labelL 16/700；模块标题 `var(--c-secondary)` body 14/500；更新时间 `var(--c-tertiary)` caption 13/400；重置数值 metricL 28/600。
    - **功能栏**：ActionRail 容器 58×140 玻璃背景，3 个 `IconButton size="rail"`(40×40)。**图标用官方 Fluent SVG**：switchClient=PersonSwap / refresh=ArrowClockwise / 主题=DarkTheme(auto)·WeatherSunny(light)·WeatherMoon(dark)。自带 tooltip/hover/pressed/focus-visible/no-drag。
    - **收起控件**：EdgeWingContent 是 `<button type="button" aria-label=关闭>`，覆盖整翼片做点击收起区。`onClose` 调 `window.monitor.showSurface("orb")` → showOnly 切回 Orb（**不退出应用，位置保持同显示器** v29）。showSurface IPC 有 validateSurfaceKind 校验 + showOnly rejection .catch() + 位置传递（screen.getDisplayMatching + 右下锚点）。
    - **主题三态**：auto→light→dark→auto 单按钮循环（`nextThemePreference` 纯函数）。label 随 preference 变。**持久化延后 Milestone G**（未实现）。
    - **refresh-error**：useUsageViewModel 读 `usageStore.error`（单一真相）；refresh 失败保留旧快照，短提示替换更新时间并限制在第三列，完整说明放 title。
    - **FIXED_NOW**：preview 模式 now=BASE_TIME（让 todayKey 命中 fixture bucket）。生产 now 实时。
    - **i18n keys**：quota.* / tray.* / action.themeAuto/themeLight/themeDark。
    - **测试**：EdgeCapsule 26 测试（18 结构 + 5 行为 Inner + 3 外层真实接线）+ FluentIcon 2 + useUsageData 2 + refresh-error 集成 2 + validateSurfaceKind 3。
  - **不抽 useOrbViewModel / useEdgeCapsuleViewModel**（与"Bar 用同 vm"契约对齐，直接消费 UsageViewModel）。
  - **Hover 跨 surface 过渡不做**（决策点 B），留给自动模式任务。
  - **dev 启动方式**：`SURFACE=edge-capsule CARD_PREVIEW=dual npm run dev`（必须带 CARD_PREVIEW，否则 dev 模式下没有 fixture 数据，组件显示 loading 占位）。capture.mjs 自动注入。
  - **v3 未解决（用户明确放下一轮整体优化）**：① 外轮廓黑边/锯齿（GlassSurface 共享层 `border: 1px solid var(--c-border)`，可能要改 box-shadow + 半透明边）。② 圆环颜色过浓（ProgressRing 共享层 `--c-accent-start/end` + halo opacity 18%，要调更轻盈）。③ 玻璃材质扁平（GlassSurface 共享层 aurora wash 强度，要加内部高光 + 双层边缘 + 环境光晕）。这些是共享层变更，会同时影响 Card/Bar，用户说"Orb 第一版完成后整体再调"。

## 8. 下一步

**D-2 已完成**（Orb + EdgeCapsule v30，详见 §5 + §7）。**仍未实现的功能**（按 milestone 归类）：

### 8.1 D-3 自动模式 / 前台探测（推荐下一步）

让浮窗根据前台窗口进程自动切换 surface：
- **Per-Monitor DPI Awareness V2**：多显示器不同 DPI 下窗口位置/尺寸正确。
- **前台窗口进程白名单**：
  - Codex / ChatGPT 桌面端 → Card
  - VS Code / Cursor / Windsurf / ZCode → Bar
  - 其他 → Orb
- **hover 跨 surface 过渡**（visual-spec §8）：Orb hover 220ms → EdgeCapsule；离开 420ms → Orb；展开/收起 180ms cubic ease-out。依赖本任务的前台探测 + Electron 跨窗口切换 + setSize workaround（§7）+ 透明窗口 hit-test。
- **系统动画关闭时立即切换**（visual-spec §8）。
- **EdgeCapsule 收起切回 Orb**：v27 已实现 `showSurface("orb")` IPC（收起调 `showOnly`，隐藏 edge-capsule 显示 orb，不销毁）。**待 D-3**：hover 触发展开/收起过渡（当前只在用户点收起按钮时切换）。

### 8.2 Milestone E-F（备选）

托盘菜单 / 设置面板 / 开机自启 / 完整 i18n / 可访问性审查。

### 8.3 Milestone G-H（备选）

- **主题持久化**（Milestone G）：当前 `themeStore` 是 in-memory（preference 不落盘）。需写 `settings.json`（electron-store 或手写）+ IPC + ThemeProvider 启动时读取。
- **打包发布验证**：Electron portable（已有 `build:portable`）/ installer / 自动更新。

### 8.4 Card 剩余小事（不阻塞 D-3）

- Codex Card 像素验收（与 `01-card-states-light.png` / `05-card-states-dark.png` 并排对比）——`weekly-only` 已与原 ProgressRing 视觉不同，重建基线后再 diff。
- CardHeader 展示模式菜单的实际功能（`onSwitchMode` 是 stub）。

## 9. 哪些坑不要再踩

见 `AGENT_LESSONS.md`：

- **L1**：typography 对象禁止 spread 到 style；lineHeight 必须 px。
- **L2**：改 TSX 后确认无 parse error，再判断"改了没用"（HMR 静默回退缓存）。
- **L3**：固定尺寸浮窗必须锁 `html/body/#root` overflow:hidden。
- **L4**：红线断言查 visible text，不要扫 innerHTML（会误命中 `border-radius: 50%`）。
- **L5**：renderer 不用 `@/`，被测组件显式 `import React`。
- **L6**：JSX 属性值里的模板字符串 `${...}` 可能触发解析器歧义，改用 string 拼接变量。
- **L7**：resizable:false 窗口的 setSize 用 setResizable workaround。
- **A-H**：Milestone A 复验 8 反模式（派生 server 行为先读源码 / 状态可判别 / 红线无条件强制 / 分类集合文档化 / 期望值先行 / 纯函数五类输入 / 改动前评估影响 / 空骨架先行）。

### EdgeCapsule v7-v17 教训（2026-07-20，10+ 轮迭代）

- **L8（Grid 换行 bug，v14）**：CSS Grid 的 `<Divider />` 作为独立 Grid item 会算入总 item 数。4 数据 section + 3 Divider = 7 item > 4 列 → Grid 自动换行成 2 行。**修复**：分隔线改为 section 的 `borderLeft`，Grid 只有数据 item，精确匹配列模板。**症状**：用户看到"上下两行布局 + 功能栏在底部裁切"，但 DOM 测试通过（因为 jsdom 不渲染 Grid 布局）。**教训**：Grid item 数必须 = 列数（或用 `grid-column: span N` 显式控制）。
- **L9（SVG mask cubic 漏底，v15-v16）**：cubic bezier 控制点 `(eL, *)` 让曲线沿主卡片右缘 X=eL 下行时，曲线"切角"区域（`eL~capTopApex, 0~eT` 矩形大部分）会被切掉（alpha=0 + RGB 黑）。**修复**：用 SVG mask **两个 fill=white path 自动并集**（主卡片矩形 + 胶囊完整外轮廓），不依赖单 path 描述复合形状。**PIL 诊断**：`alpha[y, x] == 0 and rgb[y, x] == (0, 0, 0)` 就是漏底。
- **L10（capture vs dev 渲染差异，v13）**：`capture.mjs` 自动注入 `CARD_PREVIEW=dual` fixture，但 `npm run dev` 不注入，导致 dev 模式下组件显示 loading 占位（用户看到空白）。**修复**：dev 启动必须带 `SURFACE=edge-capsule CARD_PREVIEW=dual npm run dev`。
- **L11（dark 主题文字对比度，v17）**：dark 主题下 `var(--c-secondary)` = `#c7d2e3` 浅灰，在浅色玻璃背景上对比度不足（用户说"像禁用态"）。**修复**：caption 用 `color-mix(in srgb, var(--c-ink) 88%, transparent)`（dark 主题 c-ink = 白色，88% alpha 后渲染在浅玻璃上仍有可见对比度）+ weight 600 加重。**教训**：文字颜色不能只看 token 名（c-secondary），要在实际主题 + 玻璃背景下 PIL 测量 RGB 对比度。
- **L12（用户反馈驱动的迭代节奏）**：v7→v17 共 11 个版本，每轮用户给详细 doc.md（10+ 节反馈），AI 按节实现 + PIL 验证 + npm check + dev 截图。**教训**：每轮先 PIL 诊断当前问题（用 alpha/RGB 数据定位 bug），再动手；不要凭印象改。**用户重视的真实细节**：原型图分析（analyze_image）+ 像素级 PIL 验证 > AI 自评。

### EdgeCapsule v26-v28 教训（已并入 AGENT_LESSONS，此处只留指针）

- **L13（var() capture 解析误诊）**：详见 `AGENT_LESSONS.md`（v19 加显式颜色函数绕 var() capture 是误诊，根因是 ThemeProvider 时序）。
- **L14（DPI 截图工具限制）**：device emulation 改 device-pixel-ratio 但 capturePage 输出逻辑像素，不能验证字体清晰度。详见 `AGENT_LESSONS.md` + §4.5 已知限制。
- **L9（fixture 数据须配确定性时钟，原 L15）**：详见 `AGENT_LESSONS.md` L9。预览注入 fixture 须同时注入对应 now，否则 todayKey/倒计时失配。
- **L10（SWR mutate 不能注入 error，原 L16）**：详见 `AGENT_LESSONS.md` L10。error 走 store.setError，不经过 mutate。
- **L11（多窗口关单窗口用 surface 切换，原 L17）**：详见 `AGENT_LESSONS.md` L11。window.close() 触发 window-all-closed 退出，用 showSurface IPC。
