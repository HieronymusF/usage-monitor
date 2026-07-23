# HANDOFF — codex-usage-monitor

> 最后更新：2026-07-23（D-3 并发状态修复轮 3：**showOnly 返回可判别结果 `{window, applied}`**——被更新 generation 抢占时 applied=false（非异常），AutoSurfaceWatcher 仅 applied=true 才更新 lastResolved，被抢占时保持旧值下轮重试，修复"card 被抢占→lastResolved 错误锁死"）；**468 测试全绿（0 失败）**；**真机手测待用户执行**）
> 项目：`D:\TokenUsage\plugins\codex-usage-monitor`
> 分支：`main`
> HEAD：`92cce8d`（**工作区有大量未提交改动**——D-3 切片 1/2/3 + 多轮性能/并发/交互/协议/状态修复，共约 33 文件，全部未 commit。用户明确要求不 commit/push。`git status --short` 可见改动清单。）

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

**D-3 全部完成并经用户真机验收通过（2026-07-23）**。三个切片 + 多轮性能/并发/交互/协议/状态修复全部落地，**468 测试全绿（0 失败）**，npm run check + git diff --check 全过。**未 commit**（用户要求）。

D-3 三切片（代码 + 契约详见 §5 历史 + §7）：
- **切片 1 前台检测 + 自动切换**：`resolveSurfaceFromProcessName` + `ForegroundWindowAdapter`/`Fake`/`Null` + 长驻 `ProbeDaemon` + `AutoSurfaceWatcher`（300ms 轮询，await showOnly 后看 applied 才更新 lastResolved）。
- **切片 2 hover 展开 Orb→EdgeCapsule**：命中区几何纯函数（`shared/hover-geometry.ts`）+ 长驻 daemon hover 命令 + `OrbHoverController`（80ms probe，220ms 展开/420ms 收起，cancel token 取消 pending 展开）。
- **切片 3 click + 拖动 + 贴边**：`shouldStartDrag`/`snapOrbToEdge` 纯函数 + orb-only 拖动 IPC（sender 校验）+ `useOrbDrag`（pointer 状态机，bounds 未就绪不移动，pointerup 实测位移判定，最终坐标先 moveOrb 再 dragOrbEnd）。

**多轮修复（经多轮真机验收迭代，关键设计）**：
- **探针性能**：每次 spawn PS + Add-Type = 368-528ms（不满足轮询）→ 长驻 `probe-daemon.ps1`（启动编译一次，循环 stdin/stdout）+ `ProbeDaemon`（真串行 + requestId + 代际防护 + 超时重启）。单探针降到 ~5-15ms。
- **P0 协议不通**（曾导致 451 绿但真机全超时）：ps1 所有响应（fg/hover/unknown/异常）必须回传请求的数值 id（ts 端按 id 匹配）。**进程级集成测试**（`probe-daemon-integration.test.ts`）填补"绿但协议不通"盲区。
- **可判别探针结果**（P2-2）：`ForegroundProbeResult = {kind:"ok",processName} | {kind:"error"}`，watcher 见 error 保持当前 surface（不误切 orb）。ps1 侧 fg 区分 null（无前台）vs error（API 异常）。
- **showOnly 可判别结果**（P1）：`{window, applied: boolean}`，被 generation 抢占时 applied=false（非异常），watcher 仅 applied=true 更新 lastResolved（修复"被抢占→错误锁死"）。
- **hover/drag 互斥**：pointerdown `suspendHover`（cancel token + 主动 showOnly(orb) 抢占 pending 展开）；resume 后必须等 probe not-over 才允许展开。pointerup 用实测位移判定（不依赖被合并的 pointermove）。
- **过期倒计时夹具**：ViewModel 加 `now: () => Date`，EdgeCapsule 倒计时用 `vm.now`（修复 D-2 遗留测试）。

**测试体系**（tests/electron bucket 44 测试 + tests/renderer bucket 375 测试 = 468 总）：
- `probe-daemon-integration.test.ts`（7）：spawn 真实 powershell，验证 id 回传/连续无串线/性能。
- `probe-daemon-class.test.ts`（4）：注入 fake spawner，验证 timeout→restart→late exit→next 成功 + 不错配。
- `probe-daemon-parse.test.ts`（11）：parseProcessName/parseGeometry 五类输入。
- `orb-hover-controller.test.ts`（12）：状态机 + cancel token 竞态 + click 同步 + 实测计时。
- `auto-surface-watcher.test.ts`（9）：切换/去抖/error 保持/applied 判定/不锁死。
- `resolve-surface`/`hover-geometry`/`orb-drag`（30）：纯函数五类输入。
- `use-orb-drag.test.tsx`（10）：pointer 状态机 + 竞态 + cancel + 最终坐标。

**已知限制**：① 拖动用 JS setPosition 节流（不如 OS drag 丝滑）。② PerMonitorV2 是 Electron 43 默认（无需代码），混合 DPI 怪癖只能真机验。③ 多显示器/混合 DPI 真机验收待用户在双屏环境做（逻辑已对齐 WPF）。④ reduced-motion 检测留接口（`#isReducedMotion()` 返 false）。⑤ Electron 应用无打包路径（portable.iss 打的是旧 WPF），留 Milestone H。

**D-2 EdgeCapsule v30 状态**（已完成，详见 §5/§7）。

**D-3 已完成真机验收。下一步候选**：见 §8（commit D-3 / Milestone E-F 托盘设置 / Milestone G 主题持久化 / Milestone H 打包 / 共享层玻璃材质优化）。

### 4.2 卡点

无。**之前 D-2 遗留的 EdgeCapsule 倒计时测试失败已在本轮修复**（ViewModel 加 now 字段，倒计时用注入时钟而非实时 Date）。

### 4.3 运行环境

- Node `v24.15.0` / npm `11.14.1`
- Electron `43.1.1` / electron-vite `5.0.0` / React `19.2.7` / Vite `7.3.6`
- 当前没有 Electron 应用进程在运行。
- **注意：用户系统是 dark 主题**（`nativeTheme.shouldUseDarkColors=true`），dev/capture 都在 dark 下渲染。文字颜色对比度问题部分源于 dark 玻璃背景偏浅，需要后续玻璃材质优化。
- **工作方式调整**：AI 不再主动 `npm start` 启动浮窗做真机验证（用户反馈浮窗碍眼）。真机手测由用户用 `start-electron.cmd` 自行启动。AI 验证用自动化测试 + capture 静态截图。

### 4.4 最近一次验证

`npm run check`：typecheck ✓（含 tests/electron tsconfig）/ lint ✓ / format ✓ / **test = 468 通过 + 0 失败**（49 + 201 + 174 + 44，tests/electron bucket 44 测试含 7 真实进程级集成 + 4 类级）/ build ✓ / validate:plugin ✓ / `git diff --check` exit 0。探针性能：旧 spawn 368-528ms/次 → 新 daemon 单探针 ~5-15ms（真实进程级集成测试验证）。
**D-3 真机验收已通过**（2026-07-23，用户确认）：hover 220ms 展开/420ms 收起、慢拖/快速拖不误展开、快速拖动到松手位置、click 展开、自动识别 Codex/Code/Explorer 切换、连续运行无 probe timeout、拖动误展开修复、并发 showOnly 不锁死。用户报告的 P0 协议不通 + 多轮并发/竞态问题均已修复并验收。

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
| 2026-07-22 | **D-3 切片 1（前台检测 + 自动切换）** | 前台进程名→SurfaceKind 纯函数 resolver（shared/desktop.ts）+ ForegroundWindowAdapter 接口/Fake/Null（electron/windows/foreground.ts）+ PowerShell P/Invoke 实现（poll-foreground-window.ps1 + foreground-powershell.ts，execFile 10s 超时降级 null）+ AutoSurfaceWatcher 300ms 轮询去抖→showOnly（auto-surface-watcher.ts）+ main.ts 接线（dev/capture 跳过）。7 文件（2 改+5 新建），+6 测试。**纯主进程闭环，未碰 renderer/preload/IPC**。映射对齐 WPF：codex/chatgpt→card、code/cursor/windsurf/zcode→bar、powershell/pwsh→unchanged、其他→orb。真机手测通过。 |
| 2026-07-22 | **D-3 切片 2（hover 展开 Orb→EdgeCapsule）** | 命中区几何纯函数（shared/hover-geometry.ts：Orb 82×136 真胶囊 r=41 / Capsule 720×180 排除左 28px 圆角，+13 测试）+ PowerShell probe（hover-probe.ps1 输出 raw 几何 cursor/bounds/dpi，UTF-8 BOM）+ HoverProbe（execFile 调纯函数，2s 超时降级 false）+ OrbHoverController（80ms probe 状态机，220ms 展开 / 420ms 收起 → showOnly）+ manager.ts getVisibleSurface/getVisibleWindow + main.ts 接线。7 文件（2 改+5 新建），**未碰 renderer/preload/IPC/watcher**。不用 mouseenter/mouseleave（Electron #49982/#33281）。watcher 协调靠 lastResolved 不变式。真机 hover 手测待用户方便时执行（浮窗碍眼）。 |
| 2026-07-22 | **D-3 切片 3（click 展开 + 拖动 + 贴边）** | 拖动判定+贴边纯函数（shared/orb-drag.ts：shouldStartDrag 6 DIP 逐轴 / snapOrbToEdge Y clamp+左/右贴，移植 WPF，+11 测试）+ manager.ts moveVisibleWindow/snapVisibleWindowToEdge/getVisibleWindowBounds + IPC 全链（orb:move/drag-end/get-bounds，channels+desktop.ts+preload+ipc）+ useOrbDrag hook（pointer 状态机，rAF 16ms 节流，click 展开 vs drag 贴边）+ Orb.tsx no-drag（覆盖 App.tsx drag）+ i18n orb 组。10 文件（7 改+3 新建）。Orb 改 no-drag 因 OS drag 抑制 renderer 指针事件。**D-3 三切片代码全部完成**，仅剩真机手测。 |
| 2026-07-23 | **D-3 修复轮（性能 + 竞态 + 夹具）** | ① 探针改长驻 `probe-daemon.ps1` + `ProbeDaemon` 客户端（fg/hover 复用单例，368→~3ms）+ foreground-powershell/hover-probe 改委托 daemon。② OrbHoverController + AutoSurfaceWatcher 加可注入 now()+scheduler，dwell 用 `now-start>=delay` 实测计时（修 probeMs 累加漂移）。③ useOrbDrag 竞态修复：startBounds 初始 null + 未就绪不 moveOrb + dragId token + pointercancel/lostpointercapture/effect 清理。④ ViewModel 加 `now` 字段 + EdgeCapsule 倒计时用 vm.now（修过期夹具 + 修复 D-2 遗留测试）。**新增 tests/electron bucket（23 测试）+ useOrbDrag 5 测试**。443 测试全绿（0 失败）。 |

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

**D-2 + D-3 全部完成并真机验收通过**（2026-07-23）。下一步候选（按 milestone 归类）：

### 8.1 D-3 自动模式（✅ 全部完成 + 真机验收通过）

**切片 1/2/3 + 多轮修复全部 ✅ 完成 + 真机验收通过**（2026-07-23 用户确认）。前台检测+自动切换、hover 展开、click+拖动+贴边、探针性能/协议/并发/竞态/状态修复均已落地并验收。详见 §4.1 + §5 历史 + §7 契约。

**D-3 遗留真机验收 checklist（需用户硬件，非代码，不阻塞）**：
- **多显示器**：副显示器上 Orb 展开/收起/拖动/贴边不跳主屏（showOnly v29 anchor + snapOrbWindowToEdge 用 getDisplayMatching，逻辑已对，待双屏验）。
- **混合 DPI**（如主 100% / 副 150%）：跨显示器拖动 Orb，hover probe 的 DPI scale 转换（shared/hover-geometry.ts）正确，setPosition 坐标不错位（Electron #10862/#1625 风险点，只能真机验）。
- **PerMonitorV2**：Electron 43 默认已开，无需代码；验证非主屏不模糊（#8533）。

### 8.2 下一步主要工作

1. **提交 D-3 全部改动**（约 33 文件，用户此前要求暂不 commit；确认后可一次性 commit）。
2. **Milestone E-F**：托盘菜单 / 设置面板 / 开机自启 / 完整 i18n / 可访问性审查。
3. **Milestone G**：主题持久化（themeStore in-memory → settings.json + IPC + ThemeProvider 启动读取）；displayMode 持久化。
4. **Milestone H**：Electron 打包（portable/installer；当前 portable.iss 打的是旧 WPF，Electron 无打包路径；需 extraResources 把 ps1 解出 asar）。
5. **共享层玻璃材质整体优化**（aurora wash 强度、内部高光、双层边缘、环境光晕）—— Orb v3 遗留的 3 项（§7 末）。
6. **Card 剩余小事**（§8.4）：Codex Card 像素验收、CardHeader 展示模式菜单实际功能。
- 真机验收通过后回填此处 + DEVELOPMENT-PLAN §15 Phase 6 Gate。

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

### D-3 切片 1 教训（2026-07-22）

- **L15（PowerShell 脚本含非 ASCII 必须 UTF-8 BOM）**：`electron/poll-foreground-window.ps1` 含中文注释，首次以 UTF-8（无 BOM）写入后 `powershell.exe -File` 报 `表达式或语句中包含意外的标记"}"`。根因：**Windows PowerShell 5.1 读无 BOM 的 .ps1 时按系统 ANSI（中文系统=GBK）解码**，中文注释被错码，here-string 结束符 `'@` 的字节序列被破坏 → 解析器在 C# `{` 处崩。**修复**：脚本必须存为 **UTF-8 with BOM**（`EF BB BF`，与 WPF `companion/CodexUsageMonitor.ps1` 一致）。验证：`[System.IO.File]::ReadAllBytes` 前三字节。**教训**：本项目所有 .ps1 都带 BOM；AI 工具默认写 UTF-8 无 BOM，对 .ps1 要显式补 BOM。纯英文脚本可免，但含任何非 ASCII（注释/字符串）就必须 BOM。
- **L16（Electron 应用无打包路径）**：`scripts/build-portable.ps1` 打的是**旧 WPF**（companion/ + Inno Setup），**不含 Electron**。Electron 目前只通过 `npm start` / `electron-vite preview` 从项目根跑。D-3 切片 1 的 ps1 用 `app.getAppPath()` 相对解析，asar 暂不涉及（无 electron-builder 配置）。**留 Milestone H**：真正的 Electron portable/installer 打包 + asar 内 .ps1 访问（需 `extraResources` 把 ps1 解出 asar）。

### D-3 切片 2 教训（2026-07-22）

- **L17（透明 overlay 的 hover 必须用 probe，不能用 renderer mouseenter/mouseleave）**：Electron `setIgnoreMouseEvents(movable, {forward:true})` 是做"透明区 click-through + 可见区接收事件"的标准手段，但有两个致命 bug：① toggle ignore 状态会**合成** mouseenter/mouseleave 事件（[electron#49982](https://github.com/electron/electron/issues/49982)）→ 在 hover 边界来回 toggle 会死循环；② `forward:true` **在其他 app 抢焦点时失效**（[electron#33281](https://github.com/electron/electron/issues/33281)）——而 alwaysOnTop overlay 的正常态就是别的 app 在前台。**结论**：照搬 WPF 的 probe 方案（`GetCursorPos` + `DwmGetWindowAttribute` 取窗口 DWM bounds + 几何判断），80ms 轮询，不依赖 DOM 事件。renderer mouseenter/mouseleave 只能做"快速提示"，不能做真相源。
- **L18（ps1 只输出 raw 数据，业务逻辑全放 ts 纯函数）**：D-3 切片 1 的 `poll-foreground-window.ps1` 已经输出进程名（含 `Get-Process` 调用）。切片 2 的 `hover-probe.ps1` 进一步：**只输出坐标/bounds/DPI 的 raw JSON，几何判断（胶囊圆弧 + 矩形）全在 `shared/hover-geometry.ts` 纯函数**。好处：几何逻辑 100% CI 可测（13 测试覆盖五类输入），ps1 零业务逻辑、极简、好维护。**教训**：PowerShell 脚本当"数据采集器"，判断逻辑放可测的 ts 纯函数；不要把业务判断塞进 ps1（难测 + 难改）。
- **L19（跨窗口 hover 协调靠不变式，不靠新 IPC）**：OrbHoverController 展开时**不改** AutoSurfaceWatcher 的 `lastResolved`。因 watcher 的 debounce 逻辑（`resolution === lastResolved` 就跳过），前台不变时 watcher 永远不打断 hover；前台变了（Alt-Tab）时 watcher 正常切（合理打断）。**无需新 IPC 或 setter**——靠"hover 是 orb 的子态，lastResolved 语义是'前台进程解析的 surface'而非'当前可见 surface'"这个不变式自然协调。**教训**：协调两个状态机时，先看能否用语义不变式而非加耦合通道。

### D-3 切片 3 教训（2026-07-22）

- **L20（Electron 自定义拖动阈值必须放弃 OS drag region，改 JS setPosition）**：`-webkit-app-region: drag` 让 OS 拥有拖动并**抑制 renderer 指针事件**——pointermove/pointerup 不触发，无法在 JS 层做 6 DIP 阈值或 click/drag 区分（PRD §6.5 要求）。**必须**把目标元素设 `WebkitAppRegion:"no-drag"` + 自己处理 pointerdown/move/up + IPC `BrowserWindow.setPosition`。代价：每帧 IPC（需 rAF 节流），不如 OS drag 丝滑。WPF 原版也是自管（`OrbCollapsed.Add_MouseLeftButtonDown/Move/Up` + `window.Left/Top`）。
- **L21（ESLint no-unused-vars 不认单参数 `_event` 前缀）**：tseslint 默认 `no-unused-vars` 对**唯一参数**的 `_` 前缀仍报错（`_event` is defined but never used）；但对多参数里的 `_event`（如 `ipcMain.on((_event, kind) => ...)` 后面有 kind 被使用）放行。**修复**：要么真的用该参数（如 `releasePointerCapture(event.pointerId)`），要么彻底删参数。本项目 ipc.ts 的 `_event` 能过是因为后面有 kind 被使用。
- **L22（PerMonitorV2 是 Electron 默认，无需 manifest）**：调研证实 Electron 43 在 Win10 1703+ 默认声明 PerMonitorV2，无需 `app.manifest` / electron-builder `dpiAwareness`（后者根本不存在该字段，是社区误传）。`screen.getDisplayMatching(bounds).workArea` 已是 DIP（scaleFactor 析出），`getBounds()`/`setPosition` 都 DIP，hover-probe 的 raw 物理像素需 `/scale` 还原。混合 DPI 怪癖（#10862/#1625）只能真机验。

### D-3 修复轮教训（2026-07-23）

- **L23（每探针 spawn PowerShell 不可行，必须长驻守护进程）**：`powershell.exe -File` + `Add-Type` 编译 P/Invoke 实测 368-528ms/次，无法满足 80ms hover / 300ms foreground 轮询。修复：单一长驻 `probe-daemon.ps1`（启动编译一次，循环读 stdin JSON 命令写 stdout JSON），主进程 `ProbeDaemon` 客户端管理生命周期 + 串行请求 + lazy restart。单探针降到 ~1-5ms stdin/stdout 往返。**教训**：任何需要高频调 PowerShell 的场景，用长驻进程 + 线协议，不要每请求 spawn。foreground 和 hover 复用同一 daemon 单例。
- **L24（轮询 dwell 计时必须用实测经过时间，不能累加固定 probeMs）**：OrbHoverController 原用 `#dwellMs += probeMs`，但 probe 是异步的（daemon 往返 + jsdom 假定时器），实际耗时 ≠ probeMs → 展开/收起延迟漂移。修复：记 `dwellStartedAt` 时间戳，每次 probe 用 `now() - dwellStartedAt >= delay`。now() + scheduler 可注入，测试确定性。**教训**：任何"累计固定步长当时间"的逻辑都漂移；用时间戳测实测差。AutoSurfaceWatcher 用 debounce（不依赖时间）所以无此问题。
- **L25（异步 bounds 未就绪时不能用占位坐标驱动窗口移动）**：useOrbDrag 原 startBounds 初始 `{x:0,y:0}`，getOrbBounds IPC 未返回时用户快速移动 → 基于零坐标 moveOrb → 窗口跳屏幕原点（严重 UX bug）。修复：startBounds 初始 null + flushMove 见 null 跳过 + dragId token 防过期异步结果 + pointercancel/onLostPointerCapture/effect 清理。**教训**：异步 IPC 结果驱动副作用时，未就绪前要显式禁用副作用，不能用"看起来安全"的默认值占位。
- **L26（fixture 含固定时间戳的测试必须让被测代码用注入时钟，不能 new Date()）**：EdgeCapsule 倒计时用 `new Date()`（实时），fixture 重置时间 2026-07-22 在 07-23 已过期 → computeCountdownParts 返 null → 测试 fail。这是 AGENT_LESSONS L9（"注入 fixture 须同时注入 now"）的再体现。修复：ViewModel 加 `now: () => Date` 字段透传，EdgeCapsule 倒计时用 `vm.now`。**教训**：vm 已有 now 注入（toUsageViewModel.now），但组件若绕过用 new Date() 就破坏确定性——任何时间派生都走 vm.now。

### D-3 并发与交互修复轮教训（2026-07-23）

- **L27（拖动与 hover 必须显式互斥，不能靠"各自正确"碰巧不冲突）**：OrbHoverController 80ms probe 持续跑，拖动时鼠标在 Orb 上 → probe over=true → 220ms 后独立 showOnly(edge-capsule) 与拖动打架。修复：pointerdown 立即 `suspendHover`（清 dwell + 标记），pointerup `resumeHover`，且 resume 后**必须等 probe 首次 not-over**（确认鼠标离开 Orb）才重新允许展开——否则拖动结束鼠标仍在 Orb 上会立即 hover。**教训**：两个独立状态机（drag 在 renderer、hover 在 main）共享同一交互对象时，必须有显式互斥协议，不能假设时序。
- **L28（pointerup 不能只读 pointermove 设的标志，必须用最终坐标重算位移）**：浏览器可能合并/遗漏最后一次 pointermove，导致 state.dragging 未置 true 但实际 down→up 位移超阈值 → 误判 click 展开。修复：pointerup 时 `wasDragging = state.dragging || shouldStartDrag(upDx, upDy)`，用最终 screenX/Y 重算。**教训**：pointer 事件不保证逐个送达，判定拖动用起止绝对位移，不依赖中间事件标志。
- **L29（拖动 IPC 必须绑定具体窗口 + 校验来源，不能操作"当前可见窗口"）**：moveVisibleWindow/snapVisibleWindowToEdge 操作"当前可见窗口"，拖动期间若 hover/watcher 切了 surface，延迟到达的 moveOrb 会移动 EdgeCapsule/Card/Bar。修复：改 orb-specific 方法（moveOrbWindow/snapOrbWindowToEdge/getOrbWindowBounds 只碰 orb BrowserWindow）+ ipc 校验 `event.sender` 对应 surface === "orb" + orb 已隐藏/销毁时丢弃。**教训**：异步 IPC 的副作用必须绑定明确目标 + 校验来源 + 校验目标仍可用，"当前可见"是会变的隐式状态。
- **L30（并发 showOnly 必须 generation token，后发覆盖先发）**：showOnly 首次创建窗口含异步 loadURL/loadFile，较早发出的切换可能较晚完成覆盖更新的决策。修复：每次 showOnly 自增 `#showOnlyGeneration`，await getOrCreate 后检查 `myGeneration !== current` 则放弃显隐。**教训**：异步"显示 X 隐藏其他"操作必须防乱序完成——generation/epoch token 是标准手段。AutoSurfaceWatcher 同步 await showOnly 后再发下一轮。
- **L31（探针失败和无前台窗口不能折叠成同一个 null）**：ProbeDaemon 失败返 processName:null，resolver 把 null 当 orb → 探针故障时误切 orb。修复：ForegroundProbeResult 改可判别 union（`{kind:"ok",processName}` / `{kind:"error"}`），watcher 见 error 保持当前 surface。**教训**：这是反模式 B（多语义折叠单值）——"检测到无前台窗口"和"检测失败"是两种语义，必须可判别。
- **L32（守护进程请求必须真串行 + requestId，不能 FIFO 匹配）**：ProbeDaemon 原用 pending FIFO 匹配响应，某请求超时后迟到响应错配给下一请求 → 连续错位。修复：真串行（一次一个 inFlight，`#request` 等完成再发下一条）+ 响应按 requestId 匹配（双保险）+ 超时 kill daemon 下次 lazy restart（新进程无残留响应）。**教训**：行协议流一旦失同步（超时/乱序）就不可恢复，要么串行（不可能乱序）要么 ID 匹配，不能假设 FIFO。

### D-3 真机验收修复轮教训（2026-07-23）

- **L33（P0：线协议两端必须实现同一契约，"测试全绿"≠"协议通"）**：probe-daemon.ts 发带 id 的请求 + `#dispatchLine` 只接受相同 id，但 probe-daemon.ps1 的响应**完全没回传 id** → 所有响应被丢弃 → 所有请求超时。`npm run check` 451 全绿因为：parse 单测用合成 JSON（带 id）、controller/watcher 用 fake probe、**没有任何测试 spawn 真实 powershell 验证端到端**。**根因**：协议契约分散在两文件，无集成测试覆盖真实进程。**修复**：ps1 所有响应（fg/hover/unknown/异常）原样回传数值 id；新增 `probe-daemon-integration.test.ts`（7 测试，spawn 真实 powershell 验证 id 回传 + 连续无串线 + 性能）。**教训**：跨进程/跨语言协议必须有**进程级集成测试**（不只测各自的解析函数），否则两端契约漂移不会被静态测试发现。"452 项绿"可以完全掩盖协议根本不通。
- **L34（P1：null 不能折叠"成功无数据"和"执行失败"，即使在 PowerShell 侧）**：Get-ForegroundProcessName 的 catch 返回 null，主进程把 null 当"无前台窗口→orb"。但 API/PInvoke/Get-Process 异常也是 null → 探针故障时误切 orb。**修复**：ps1 返可判别 `@{ok=$true;name=$null}`（成功无窗口）/ `@{ok=$false}`（异常），主循环据此发 processName 或 error。**教训**：L31（探针失败和无前台窗口不能折叠）的同一反模式在 PowerShell 侧又出现一次——可判别结果必须贯穿全链路，不能在一层修了在另一层又折叠。
- **L35（P1：异步副作用取消必须有显式代次/generation，不能靠"后面不发了"）**：hover 展开是 `showOnly(edge-capsule)` 异步（EdgeCapsule 首次创建/load 慢），pending 时用户开始拖动 → suspend 只设标志，但 pending showOnly 完成后仍会隐藏 Orb 显示 capsule。**修复**：`#expandGeneration` 代次，suspend 自增使 pending 展开失效，其 `.then` 检测代次变了 + suspended → 立即 showOnly("orb") 回滚。**教训**：已发出但未完成的异步副作用，"取消"不能只靠标志位阻止未来的新调用，必须让正在途中的调用完成后检查是否已被取消（代次 token）并回滚。
- **L36（P1：子进程 kill 后的迟到事件必须验证身份/代次，不能无条件 reject）**：probe-daemon.ts 的 child exit/error handler 原无条件 `#rejectInFlight`。旧 child 被 kill（超时重启）后其迟到 exit 触发 → reject 新 child 的在途请求。**修复**：`#generation` 代次，每次 #start 自增，handler 捕获后代次，只处理当前代 child 的事件（过时 child 的 exit/error/data 全忽略）。**教训**：kill 不等于事件立即停止——exit/error/data 可能迟到，handler 必须验证 `this.#child === child` 或代次匹配，否则会污染新一代的状态。
