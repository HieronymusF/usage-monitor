# HANDOFF — codex-usage-monitor

> 最后更新：2026-07-24（Asia/Hong_Kong，**Milestone H 切片 3 核心 Orb 交互已获用户真机确认；系统级场景继续待验**）：Orb 已采用独立控制器 + `peek / revealed / floating / expanded` 四态。hover 只露出完整 Orb，移开 1 秒重新半隐藏；拖动碰到左右边缘时恢复 revealed 贴边语义并进入同一回藏流程，未碰边时才保持自由悬浮；Capsule 离开 1 秒或外部点击时收起，并恢复展开前的自由 Orb 或边缘半隐藏态。`npm run check` exit 0，**601 绿/0 失败**；标准 portable 已重建并核验包内拖放分流代码与资源。AI 未启动 UI、未写入真实开机启动项。开机自启重登录、重启恢复、多屏/混合 DPI 等系统级场景仍待验。详见 §4.1.5、§4.1.6、§8.2。
> 项目：`D:\TokenUsage\plugins\codex-usage-monitor`
> 发布目标：`main`。本轮发布范围统一包含三组关联改动：① Milestone H 打包骨架 + 切片 2 开机自启/正式图标 + 切片 3 位置持久化；② ZCode GLM-5.2 适配；③ portable Codex session 配额降级 + 动态套餐标题 + current/lifetime 语义修复。具体分支、提交与工作区状态必须以现场 Git 结果为准；不得回退任一组。

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
3. `AGENT_LESSONS.md` —— L1-L17 跨任务 lessons + A-H Milestone A 复验反模式。
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

**Milestone E-F + G 合并已完成（2026-07-24），真机手测已通过（用户确认 2026-07-24）**。范围：托盘菜单 + 设置持久化（theme/client/language/displayPreference 落盘）+ i18n 切换 UI + a11y 核心可达。已 commit `760cf2a`（注：§5/§8.1b 旧版写的 `d4e8dce` 是 amend 前的 dangling hash，origin/main 实际是 amend 后的 `760cf2a`）于 `feat/milestone-e-f-g` 分支 ff 合并至 main。**该 milestone 合并时验证为 547 绿 / 0 失败**（`npm test` 498 + `test:server` 49；最新总数见 §4.4）。

**架构核心：主进程为偏好单一真相源**。`SettingsRepository`（`electron/settings/repository.ts`）是唯一权威，托盘菜单和 renderer 都经它读写。

- `shared/settings.ts`：schema v3（Settings: version/themePreference/displayPreference/activeClient/language/autoLaunch/windowPlacements）+ v1/v2→v3 加法迁移 + `validateSettings`（纯函数，单个损坏 placement 只回退该 surface）+ `normalizePreference`（仅校验 renderer 可改的字符串/布尔偏好，拒绝 windowPlacements）+ `resolveLanguageFromLocale`（locale→Language 纯函数）+ `DEFAULT_SETTINGS`。
- `electron/settings/repository.ts`：`load()`（文件缺失/损坏/校验失败回退默认，不阻塞启动）+ `get()` + `update(key,value)`（**严格串行写盘队列**：链式 Promise + 每次唯一计数 tmp.N，写完即删）+ `flush()`（await 队列尾，保证磁盘最新完整）。路径 `app.getPath("userData")/settings.json`。**initialDefaults 注入**：首次文件缺失时 language 用 locale 解析；用户已保存走文件分支不受影响。
- **settingsRepo 在 app.whenReady() 后创建**（验收轮 2 修复）：不在模块初始化阶段调 `app.getLocale`/`getPreferredSystemLanguages`（whenReady 前不可靠）。`readSystemLanguage()` 优先 `app.getPreferredSystemLanguages()[0]`，回退 `app.getLocale()`，再回退 ""。
- **偏好 IPC**（`channels.ts` + `shared/desktop.ts` + `ipc.ts` + `preload.ts` 四点扩展）：`getPreferences`(invoke)/`setPreference`(send)/`preferenceChanged`(广播)。`ipc.ts` 导出 `broadcastPreferences(Settings)`，托盘和 setPreference handler 都用它（单一广播入口）。
- **托盘菜单**（`electron/tray/menu-builder.ts` + `tray/index.ts`）：
  - `buildTrayMenuTemplate(settings, callbacks)` 纯函数：打开Card / 展示模式(Auto|Card|Bar|Orb) / 客户端(Codex|ZCode) / 主题(Auto|Light|Dark) / 语言(简体中文|English) / 刷新 / **开机启动** / 退出。radio 与 checkbox 选中状态都来自 settings，文案主进程内嵌中英文字典（`TRAY_STRINGS`，不经过 react-i18next）。
  - `createTray({repo, callbacks, iconPath})`：从正式 `resources/usage-monitor.ico` 创建 Tray；资源缺失/损坏时才回退 16x16 内嵌 PNG 并记录错误。`rebuild()` 在 preference 变化时重建菜单刷新 ✓；`destroy()` 退出清理。
- **main.ts 接线**：启动 `settingsRepo.load()` → 应用主题和开机自启期望态 → `registerDesktopIpc(..., settingsRepo)` → `createTray`（capture 模式跳过）。`commitPreference(key,value)` 单一入口：repo.update + broadcastPreferences + tray.rebuild + 应用副作用（theme→nativeTheme / display→启停 watcher + showOnly / client→resizeCardWindow / autoLaunch→登录项）。OrbHoverController 独立于 AutoSurfaceWatcher：生产环境自动/固定展示模式都运行，Card/Bar 时自行静默；只有前台 watcher 随 auto 偏好启停。shutdown 统一销毁。
- **renderer 监听**（`ThemeProvider` 扩展）：mount 时 `getPreferences()` hydrate theme/client/display + `i18n.changeLanguage`，订阅 `onPreferenceChanged` 持续同步。`themeStore.setPreference` 改为乐观更新本地 + 发 IPC 持久化；新增 `hydrateFromPreferences`（主进程推送时应用，幂等）。`usageStore.setActiveClient` 同样乐观 + IPC + hydrate。新增 `displayStore`（纯监听，无 setter，displayPreference 只能从托盘改）。
- **a11y**：reduced-motion 由 `globals.css` 的 `@media (prefers-reduced-motion: reduce)` 全局处理（CSS transition/animation 归零，已存在）。Orb 状态点 `StatusDot` 从 `aria-hidden` 改 `role="img" + aria-label={t(health.*)}`（不只靠颜色，DEVELOPMENT-PLAN §12）。按钮 aria-label/focus-visible 已由 IconButton 共享层覆盖（审查确认）。
- **i18n key 补全**：`en.json`/`zh-CN.json` 加 `tray.menu.*` 子组（文档性，主进程字典已内嵌）。

**已知限制**：① 开机自启和正式托盘图标已自动化/打包验证，但尚未由用户做真实勾选、重登录和托盘视觉验收。② per-surface 位置/吸附边持久化、Orb 四态交互和边缘/自由拖放分流的代码、迁移、算法/协议测试及 portable 重建已完成；固定/自动模式 hover、revealed 与 expanded 离开 1 秒收起、碰边吸附、任意位置悬浮、窗口外点击、重启、双屏、显示器断开与混合 DPI 尚未由用户验收。③ 全量对比度审计未做（留玻璃材质优化）。

**D-2/D-3 状态**：全部完成并真机验收通过（详见 §5 历史 + §7 契约）。

### 4.1.1 时区测试失败已修复（2026-07-24）

`tests/sessionLogReaderTimezone.test.js` 第 3 个测试（"同一 UTC 时刻在 UTC 时区分桶为 UTC 当日（对照）"）此前失败（期望 `2026-07-17` 桶，实际空）。

**根因（测试设计缺陷，非实现 bug）**：该测试写 fixture record 时间戳 `2026-07-17T16:15:00Z`，却没给 reader 注入 `now`。`SessionLogReader.toUsage` 的 cutoff（"过去 N 天"）相对 `now()` 计算，默认 `now = () => new Date()` 取真实系统日期（2026-07-24）→ cutoff = `2026-07-18` → fixture 桶 `2026-07-17` 被窗口滤掉 → `daily: []`。这与 AGENT_LESSONS L9/L26 同类：**fixture 含固定时间戳，必须让被测代码用注入时钟**。实现的 cutoff 用 `now()` 完全正确，未碰 §6 稳定层。

**修法**：给前 3 个测试（Codex HK / ZCode HK / Codex UTC 对照）注入与 fixture 同一时刻的 `now = () => new Date("2026-07-17T16:15:00.000Z")`，让 cutoff 窗口覆盖 fixture 当日。第 4 个测试（server/renderer 契约对齐）原本就注入了 `now`，无需改。前两个 HK 测试此前侥幸通过只因 HK 桶 `2026-07-18` 恰好 ≥ 真实 cutoff，同样脆弱，一并加固。

**验证**：`test:server` 49/49 全绿；`npm run check` 整体 exit 0（见 §4.4）。

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

### 4.1.2 Milestone H 切片 1：Electron portable 打包骨架（代码完成，真机验证待用户，2026-07-24）

**范围**：最小步——用 electron-builder 产出可运行的 portable exe，验证 `probe-daemon.ps1` / `dist/companionBridge.js` / bridge 能在打包后运行。**不做**：开机自启、托盘图标美术资源、位置持久化（留切片 2/3）。

**实现**：

- **`electron/paths.ts`（新增）**：三个纯函数解析资源路径，感知 `app.isPackaged`——① `inAsar(segments, ctx)`：打包态→`resources/app.asar/<segments>`，开发态→`appPath/<segments>`（asar 内资源，Electron 自身能读：renderer html / preload cjs / Electron-as-node 执行的 bridge .js）；② `unpacked(...)`：打包态→`app.asar.unpacked/`（asarUnpack 资源，本切片未用，留未来 dist 若需解包）；③ `extraResource(packagedName, devRelative, ctx)`：打包态→`resources/<packagedName>`（extraResources 资源，asar 外扁平放置）。12 单测覆盖两态 × 正常/空参/多段/边界（反模式 F）。
- **`electron/main.ts` 改造**：启动时构造 `resourceCtx = { packaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }`。`bridgeScript`（line 46）从 `join(app.getAppPath(), "dist", ...)` 改为 `inAsar(["dist", "companionBridge.js"], resourceCtx)`（bridge.js 在 asar 内，Electron-as-node 能 require）；`probe-daemon.ps1`（line 71）改为 `extraResource("probe-daemon.ps1", "electron/probe-daemon.ps1", resourceCtx)`（ps1 必须 asar 外，powershell 看不到 asar 虚拟 FS）。**两处不再裸 join(app.getAppPath(), ...)**。
- **package.json `build` 配置**：`appId: "com.hieronymusf.usage-monitor"`、`productName: "Usage Monitor"`（注意：改变 userData 目录名，见下）、`directories.output: "release"`、`files: [out/**, dist/**, package.json, !dist/**/.gitkeep]`、`extraResources: [{from: "electron/probe-daemon.ps1", to: "probe-daemon.ps1"}]`、`win.target: [portable x64]`、`artifactName: "usage-monitor-portable-${version}.exe"`。新增 `dist` 脚本：`npm run build && electron-builder --win portable`。devDependency 加 `electron-builder ^26.15.3`。
- **`.gitignore`**：加 `release/`（electron-builder 产物，不入 git）。

**验证（自动化，已通过）**：

- `npm run dist` 成功产出 `release/usage-monitor-portable-0.2.0.exe`（108MB）+ `release/win-unpacked/`（可运行目录）。
- 解包结构验证：`@electron/asar` listPackage 确认 asar 内含 `/out/main/index.js`、`/out/preload/index.cjs`、`/out/renderer/index.html`、`/out/renderer/assets/*`、`dist/**`（4235 文件）、`node_modules/**`（28636）、`package.json`；`probe-daemon.ps1` 在 `resources/` 根（7908 字节，BOM `ef bb bf` 完好）。
- `npm run check` exit 0，**559 绿/0 失败**（547 + 12 新 paths 测试）。

**已知限制 / 待真机验证（如实标注）**：

- ✅ **打包后 bridge 已做无界面进程验收**（2026-07-24 后续修正）：用 `release/win-unpacked/Usage Monitor.exe` + `ELECTRON_RUN_AS_NODE=1` 实际执行 `app.asar/dist/companionBridge.js`，启动成功且 `/usage` HTTP 200。先前“AI 无法覆盖打包后 bridge 子进程”的判断过强；可拆出无 UI 的真实进程测试。仍需用户双击 portable 验收完整窗口、托盘、probe-daemon 与交互链。
- ⚠️ **userData 目录名变更**：`productName: "Usage Monitor"` 使打包后 `app.getPath("userData")` = `%APPDATA%\Usage Monitor\`（空格大写），而开发态是 `%APPDATA%\codex-usage-monitor\`。开发态/打包态 settings 不共享。打包版首次运行无历史 settings，回退默认，不阻塞。如需统一，后续可 `app.setName("codex-usage-monitor")` 强制（但牺牲 productName 显示一致性）——留后续决策。
- ✅ **应用图标已在切片 2 补齐**：`resources/usage-monitor.ico` 同时用于 portable exe 与托盘；切片 1 产物的 Electron 默认图标已被后续构建替换。
- ⚠️ **首次打包下载 Electron 二进制**：electron-builder 即使 devDeps 已有 electron，仍下载自己的副本（~100MB），首次较慢，缓存在 `%LOCALAPPDATA%\electron-builder\Cache`。

### 4.1.3 ZCode 桌面端 GLM-5.2 数据源修复（完成，2026-07-24）

**根因**：reader 仍扫描旧 `~/.zcode/v2/agent-config` 并只识别 `type:"assistant" + message.usage` 的 Claude 兼容格式。该目录 16 个 JSONL 最后写入为 2026-07-18；旧缓存虽于 07-24 被刷新时间戳，模型仍只有 `deepseek-v4-pro` / `deepseek-v4-flash` / `glm-4.7`。当前 ZCode 桌面端内置 `resources/glm/zcode.cjs app-server --stdio` 的真实数据位于 `~/.zcode/cli/rollout/model-io-*.jsonl`，07-24 持续写入，结构为 `type:"model_io" + response.usage + model.modelId`。

**实现**：

- `ZcodeSessionLogReader.defaultRoot()` 改为 `~/.zcode/cli/rollout`；`ZCODE_LOG_ROOT` 覆盖契约保留。目录名 `cli` 是桌面端 GLM app-server 的内部存储，不代表检测外部命令行客户端。
- 只读取 `requestId`、`startedAt/completedAt`、`model.modelId` 和 `response.usage` 数值字段；不访问 request/response 正文或工具参数。按 `requestId` 去重。
- `inputTokens` 已含缓存命中，`totalTokens` 为权威总量（本机验证等于 `inputTokens + outputTokens`）；`cacheReadTokens + cacheWriteTokens` 仅单独记录，不再重复加进 total。
- `SessionLogReader` 的快速过滤从大小写敏感 `line.includes("token")` 改为 `/token/i`，否则 camelCase `inputTokens` 会整行被跳过。
- 默认缓存切换为 `~/.codex-usage-monitor/zcode-model-io-cache.json`；旧 `zcode-usage-cache.json` 保留但不再读取，避免不同路径/字段/总量语义的数据叠加。

**验证**：

- 真实日志端到端：`source=local_session`、`quality=local_estimate`，仅模型 `GLM-5.2`；`input=19,226,476`、`output=46,413`、`total=19,272,889`，严格满足 total=input+output；cached input `18,785,792` 单独记录，未重复计入总量。
- 真实结构测试先验证旧实现 8 项失败，再实现至聚焦 11/11 通过；`test:server` 49/49；完整 `npm run check` exit 0，559/559。
- 本轮未启动 Electron/ZCode 窗口，未修改 Milestone H 文件。

### 4.1.4 portable Codex 配额 / Pro 套餐修复（完成，2026-07-24）

**用户复现**：运行旧 `release/usage-monitor-portable-0.2.0.exe` 后，Codex 显示“配额 — 服务未提供”，标题仍是 `CODEX · PLUS`（账号已升级 Pro），并把本机累计约 1B 错放到“当前任务”。

**根因**：

- portable bridge 能定位 Windows Store Codex 的 `resources/codex.exe`，但从包外执行 `app-server` 会直接报 `Access is denied`；路径存在不代表包外进程可启动。
- `renderer` 的 `brand.codex` 固定为 `CODEX · PLUS`，没有消费 `snapshot.planType`。
- local session reader 的 `tokenUsage.total` 是跨 session 聚合，与 `lifetimeTotal` 相同，不能代表当前任务。

**实现**：

- `CodexSessionLogReader.readLatestRateLimits()` 仅读 session 尾部 `event_msg/token_count/rate_limits` 的时间戳、套餐和配额数值；最多检查最近 32 个文件、每个尾部 2 MiB，不读取凭据/对话正文/工具参数。app-server 失败时 `CodexSource` 使用该官方落盘快照，并标记 `source=local_session` + `LOCAL_RATE_LIMIT_FALLBACK`。
- normalizer 支持落盘事件的 `used_percent` / `window_minutes` / `resets_at` snake_case 字段，并保留实际来源。
- `formatCodexBrand(planType)` 同时供 CardHeader 与 Edge Capsule 使用：Pro→`CODEX · PRO`，Plus→`CODEX · PLUS`，未知→`CODEX`。
- local 聚合回退时 `tokenUsage.total=null`，继续保留 daily/lifetime；不再把 1B lifetime 冒充 current task。

**验证**：

- 本机最新官方事件确认 `plan_type=pro`，窗口为 10080 分钟；实现后的真实 `CodexSource` 返回 Pro + 每周配额。
- `npm run check` exit 0：`npm test` 513 绿 + `test:server` 52 绿 = **565 绿/0 失败**。
- `npm run dist` 成功重建 `release/usage-monitor-portable-0.2.0.exe`（107,933,700 bytes，2026-07-24 18:24）。
- 无界面启动打包后的 `release/win-unpacked/Usage Monitor.exe`（`ELECTRON_RUN_AS_NODE=1`）执行 `app.asar/dist/companionBridge.js`，`GET /usage` HTTP 200；当次返回 `planType=pro`、每周已用 6%/剩余 94%、`currentTask=null`、lifetime 保留。配额百分比会随 Codex 使用动态变化。
- 未由 AI 启动 portable UI；新 exe 的最终视觉/交互仍由用户手动复验。

### 4.1.5 Milestone H 切片 2：开机自启 + 正式托盘图标（代码与打包验证完成，真机验收待用户，2026-07-24）

**范围**：在现有偏好单一入口上加入开机自启，不引入设置弹窗；为托盘和 portable exe 提供同一套正式多分辨率图标。位置/吸附边持久化仍留切片 3。

**实现**：

- **开机自启协调器**（`electron/auto-launch.ts`）：`resolveAutoLaunchTarget` 纯函数区分 development / 非 Windows / packaged Windows。portable 打包态优先注册 electron-builder 注入的 `PORTABLE_EXECUTABLE_FILE`（外层稳定 exe），仅在没有该变量时回退 `process.execPath`；路径必须是绝对 Windows 路径。`applyAutoLaunchPreference` 对启用/停用使用相同 path/name/args，调用 `app.setLoginItemSettings`，API 异常只记录失败、不阻塞应用启动。
- **settings schema v2**：新增 `autoLaunch: boolean`（默认 false）；v1 文件缺字段时迁移为 false。`PreferenceValueMap` 让 IPC/仓库按 key 保持值类型，字符串 `"true"` 不会被当作布尔值接受。
- **统一副作用入口**：renderer IPC 和托盘 checkbox 都经 `createPreferenceCommitter` / `commitPreference`，写盘、广播、托盘重建和 `setLoginItemSettings` 同步执行；应用启动时也按已保存期望态同步一次。开发态和非 Windows 明确跳过，不会污染本机登录项。
- **正式图标**：新增 `resources/usage-monitor-icon.svg` 源稿与 `resources/usage-monitor.ico`；ICO 含 16/20/24/32/40/48/64/128/256 九档。`tray/index.ts` 从打包资源加载 ICO，损坏时才回退占位；electron-builder 的 `win.icon` 与 `extraResources` 都指向同一资源。

**验证（已通过）**：

- 新增/更新设置迁移、布尔 IPC、偏好副作用、托盘 checkbox/i18n、开机自启路径/保护/异常和 ICO 目录/打包配置测试。
- `npm run check` 整体 exit 0：`npm test` 527 绿 + `test:server` 52 绿 = **579 绿/0 失败**；typecheck/lint（178 文件）/format/build/plugin validation 全过。
- `npm run dist` 成功产出 `release/usage-monitor-portable-0.2.0.exe`（108,073,783 bytes，2026-07-24 18:51）。`release/win-unpacked/resources/usage-monitor.ico` 为 56,518 bytes，与源码 ICO 的 SHA-256 同为 `83413B21A0ACD59CF17E81B7471C20A66FAB67411434EC81C7886E2EFE0482EF`；从 portable exe 提取的关联图标也为正式用量环图标。
- 已验证 electron-builder portable 脚本把 `PORTABLE_EXECUTABLE_FILE` 设置为外层 `$EXEPATH`。AI 未启动应用，未勾选/取消真实 Windows 开机启动项。

**待用户真机验收**：运行新 portable，确认托盘显示正式图标；勾选「开机启动」后 checkbox 保持选中，重登录/重启后应用从外层 portable exe 自启；再取消勾选并确认下次不自启。切片 3 已继续实现，可与位置恢复一起验收。

### 4.1.6 Milestone H 切片 3：per-surface 位置 / 显示器 / 贴边持久化（代码与打包验证完成，真机验收待用户，2026-07-24）

**范围**：Card、Indicator Bar、Orb、Edge Capsule 各自保存位置；跨重启恢复；显示器断开、分辨率、任务栏 workArea 和 DPI 变化时安全回退。坐标只由 Electron 主进程维护，不向 renderer 扩展坐标设置接口。

**实现**：

- `shared/window-placement.ts` 新增纯函数模型：保存 `displayId` + 相对 `workArea` 的 `offsetX/offsetY` + `snapEdge`，恢复时优先原显示器、否则回退主显示器，并 clamp 到当前工作区。显式 left/right 贴边在尺寸变化后仍保留。
- settings 升级 schema v3；v1/v2 自动补空 placement。`SettingsRepository.updateWindowPlacement` 逐 surface 校验、去重并进入既有串行原子写队列；renderer 的 `setPreference` 不能改坐标。
- `SurfaceWindowManager` 在启动/切换时恢复目标 surface；Card/Bar/Capsule 用 Windows `moved` 事件落盘，Orb 避免拖动期间高频写盘，只在 drag-end 按最终 bounds 分流：碰到/越过左右边缘保存对应 `snapEdge` 并吸附为完整 revealed Orb，未碰边以 `snapEdge=null` 保存自由位置并 clamp。Card 因客户端切换改变高度时会重新 clamp。
- `shared/orb-drag.ts` 定义 `ORB_EDGE_PEEK_DIP = 24`：Orb 只在真实物理左右外边缘半隐藏；若该侧有相邻显示器或侧边任务栏，则保持完整可见并留 6 DIP。恢复逻辑同时兼容旧版完整可见 snap 位置。
- `OrbHoverController` 改为四态：`peek`（半隐藏）、`revealed`（完整贴边）、`floating`（自由位置）、`expanded`（Capsule）。hover 只执行 `peek→revealed`；拖动传 `dragged=true` 后按主进程最终位置进入 edge revealed 或 free floating；renderer click 才进入 expanded。
- controller 生命周期已从 AutoSurfaceWatcher 解耦：自动模式和固定 Orb 模式都启用；固定 Card/Bar 时自行静默。这修复了固定 Orb 模式下 hover、窗口外点击与离开计时整条失效。
- revealed Orb 离开满 1000ms 自动退回 peek，窗口外点击立即退回；floating Orb 离开或外部点击均保持。expanded Capsule 在外部点击时立即收起，或离开满 1000ms 后收起。`probe-daemon.ps1` 的全局左键事件位协议未变。
- Orb→Capsule 展开仍从当前 Orb 锚定；Capsule→Orb 改为恢复展开前已保存的 Orb placement：边缘 placement 回同边同 Y 半隐藏，自由 placement 回原自由位置。

**验证（已通过）**：

- 位置/四态控制器测试覆盖负坐标副屏、显示器断开、workArea/DPI 变化、拖放碰边/越界/未碰边、自由 placement、旧 snap 兼容、内部接缝/侧边任务栏，以及 hover 只露出、边缘 drag-end 进入 revealed 并离开 1 秒回 peek、floating 不自动隐藏、expanded 离开 1 秒恢复展开前 placement。
- `npm run check` 整体 exit 0：`npm test` 549 绿 + `test:server` 52 绿 = **601 绿/0 失败**；typecheck/lint（180 文件）/format/build/plugin validation 全过。聚焦交互/位置/真实 PowerShell 协议 72/72，其中本轮几何+控制器 29/29。
- 标准 `release/usage-monitor-portable-0.2.0.exe` 已由 electron-builder 正常重建（108,066,550 bytes，2026-07-24 22:52:44；SHA-256 `442F9A1F2321F7A672F9E79C2C6B7ED46C60FA08125E5FE12ABCA167E0C0ED46`）。`app.asar` 直接确认包含 `inferOrbDropEdge`、drag-end 碰边保存 snapEdge、边缘进入 revealed / 自由进入 floating，以及 revealed/expanded 离开计时；portable 归档直接列出 `resources/app.asar`、`resources/probe-daemon.ps1`、`resources/usage-monitor.ico`。AI 未启动 UI；为覆盖旧 portable，明确结束了用户正在测试的旧版主进程。

**待用户真机验收**：分别在自动和固定 Orb 模式确认半隐藏 hover 后露出完整 Orb，移开 1 秒重新半隐藏；拖到左右屏幕边缘后应自动吸附，移开 1 秒回半隐藏；拖到屏幕中间则应原位悬浮且离开不消失。点击 Orb 展开 Capsule，窗口外点击应立即收起，离开 Capsule 1 秒也应收起。自由来源应回自由 Orb，边缘来源应回同边半隐藏。退出重开确认位置，再覆盖双屏、侧边任务栏、混合 DPI 和显示器断开。

### 4.2 卡点

无。**之前 D-2 遗留的 EdgeCapsule 倒计时测试失败已在本轮修复**（ViewModel 加 now 字段，倒计时用注入时钟而非实时 Date）。

### 4.3 运行环境

- Node `v24.15.0` / npm `11.14.1`
- Electron `43.1.1` / electron-vite `5.0.0` / React `19.2.7` / Vite `7.3.6`
- AI 本轮未启动 Electron 应用；不要把自动化/打包结果写成 UI 或真实登录项验收。
- **注意：用户系统是 dark 主题**（`nativeTheme.shouldUseDarkColors=true`），dev/capture 都在 dark 下渲染。文字颜色对比度问题部分源于 dark 玻璃背景偏浅，需要后续玻璃材质优化。
- **工作方式调整**：AI 不再主动 `npm start` 启动浮窗做真机验证（用户反馈浮窗碍眼）。真机手测由用户用 `start-electron.cmd` 自行启动。AI 验证用自动化测试 + capture 静态截图。

### 4.4 最近一次验证

`npm run check`：**整体 exit 0**（2026-07-24，Milestone H 切片 3 真机反馈修正后复跑）。typecheck ✓（server/desktop/tests 三 bucket）/ lint ✓（180 文件）/ format ✓ / **`npm test` = 547 绿 exit 0** / build ✓ / validate:plugin ✓ / **`test:server` = 52 绿 exit 0**。
**测试总数**：**601 绿 / 0 失败**。另有聚焦交互/位置/真实 PowerShell 协议 72/72、真实本机 CodexSource、打包后 companion bridge、portable 构建/资源哈希，以及 Slice 3 `app.asar` 四态交互代码标记验证通过（详见 §4.1.4/§4.1.5/§4.1.6）。
**本轮修复（2026-07-24）**：时区测试失败修复（§4.1.1）→ `test:server` 48→49。**关于 format 的更正**：核实中一度看到 `format:check` 报 30 文件不符并据此判断"E-F+G commit 未跑 prettier"，**此判断错误**——在 HEAD `760cf2a` 干净树上 `format:check` 本就 exit 0 全过。那 30 文件的"不符"是中途 `prettier --write` 在 `core.autocrlf=true` + 无 `.gitattributes` 环境下引入的 CRLF/LF 行尾假象（`git diff -w` 显示零内容差异），经 `git stash` 规范化后消失，**这些文件无需也无可改动**（已全部还原）。真正阻塞 check 的只有时区测试那 1 个 server 失败，修后 check 整体 exit 0。教训见 §9 新增 lesson。**遗留建议（已落实）**：仓库原本无 `.gitattributes`，`core.autocrlf=true` 下任何 `prettier --write` 都会制造行尾假象。**本轮已新增 `.gitattributes`**（`* text=auto eol=lf` + `*.ps1 binary` 保护 BOM + 二进制资源显式 binary）并 `git add --renormalize` 规整，从根上消除该问题（详见 §9 L37）。
**test 脚本拆分（E-F+G 轮）**：`npm test` 只含 4 个会绿的 bucket（build:server 前置 + renderer×3 + electron×1）；`test:server` 单独跑 server；`check` 末步跑 `test:server`。未用 `;` 串联（Windows cmd 不识别为分隔符）。时区测试修复后 server bucket 也 exit 0，check 末步不再拖黑。
**全 IPC sender 校验（验收轮 4 P1）**：getUsage/refreshUsage/resizeCardWindow/showSurface 补齐校验，与既有 getPreferences/setPreference/moveOrb/dragOrbEnd/getOrbBounds/getContext 统一复用 preferences.ts 的 `requireTrustedSender`（invoke 类拒绝）/`allowTrustedSender`（send 类忽略+记录）。getUsage/refreshUsage 未知 sender reject（不读取/广播数据）；resizeCardWindow/showSurface 未知 sender 忽略+记录（不执行窗口副作用）；保留参数校验（codex/zcode、validateSurfaceKind）。+6 测试（preferences-integration：requireTrustedSender/allowTrustedSender 合法/未知）。
**设置路径文档同步（验收轮 4 P2-a）**：docs/01-product-requirements.md + README 从 `%LOCALAPPDATA%\CodexUsageMonitor\settings.json` 改为 `app.getPath("userData")/settings.json`（Win `%APPDATA%\codex-usage-monitor\`），与 DEVELOPMENT-PLAN §10 / 实现一致。全仓搜过 LOCALAPPDATA，剩余提及均为"历史从...改至此"的有效叙述。
**ThemeProvider 启动容错（验收轮 4 P2-b）**：getContext/getPreferences 显式 `.then(onFulfilled, onRejected)`——reject 不产生 unhandled rejection（失败 console.error 记录简短错误，保留本地默认不阻止渲染）；unmount 后 active=false，迟到的 resolve/reject 不更新 store/i18n（onPreferenceChanged 也加 active guard）。新增 `tests/renderer/theme-provider.test.tsx`（4 测试：getContext reject / getPreferences reject / unmount 迟到 / 成功回归）。
**托盘刷新可测（验收轮 4 P2-c）**：refresh→broadcast→错误处理 提取为 `electron/preferences.ts` 的 `performTrayRefresh(refresh, broadcast, log)`，main.ts tray refresh 回调和测试调同一份真实逻辑（不再手写 fake 串联）。+3 测试（成功广播一次对象一致 / 失败不广播不抛记录 / 连续刷新不串线）。bridge API 和 renderer 刷新行为未变。
**偏好 IPC sender 校验（验收轮 3 P1）**：getPreferences/setPreference 校验 + handleGetPreferences/handleSetPreference 纯函数（详见 §5 历史）。
**契约统一（验收轮 3 P1）**：路径 userData + 语言回退 en（详见 §5 历史）。
**commitPreference 可测（验收轮 3 P2）**：createPreferenceCommitter（详见 §5 历史）。
**测试清理合规（验收轮 2）**：唯一目录 + mkdir 单层 + finally 删明确单文件，不递归遍历/批量删（遵守 AGENTS.md）。
**useUsageData 订阅稳定（验收轮 2）**：effect 依赖稳定 mutate；重复 render 不重复订阅测试。
**语言解析可测（验收轮 2）**：resolveLanguageFromLocale 在 shared/settings.ts，测试调真实函数。
**真机验收状态（如实，未通过项明确标注）**：

- ✅ **D-3 已通过**（2026-07-23 用户确认）：hover/拖动/自动切换/并发（详见 §5 历史）。
- ✅ **E-F+G 已通过**（2026-07-24 用户确认）：托盘菜单/偏好重启恢复/语言切换/displayPreference 启停 watcher/主题跟随全部手测通过。
- ⚠️ **待验收 / 延期**：开机启动、正式托盘图标、位置持久化、Orb 四态交互与边缘/自由拖放分流的代码和打包均已完成；仍待用户真实勾选/重登录/视觉验收，以及固定/自动 Orb 模式、revealed 与 expanded 离开 1 秒收起、碰边吸附、自由位置悬浮、窗口外点击、重启、多屏、显示器断开和混合 DPI 验收。完整 Phase 6/7 Gate 另有 a11y 全量审计未完成。

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

| 日期       | Milestone                                                                                | 一句话                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-15 | Phase 0                                                                                  | 旧 WPF release 基线冻结 + 数据层测试全绿                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-07-16 | Phase 1-2                                                                                | Electron + React + shadcn/ui 骨架；companion bridge 接入；真实数据轮询                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-18 | Milestone A                                                                              | `UsageViewModel` + quota/data/health 分类 + token/countdown formatter（两轮复验，契约见 AGENT_LESSONS A-H）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-18 | Milestone B                                                                              | Foundations 组件库（GlassSurface/IconButton/MetricValue/StatusLabel/Divider/ProgressRing 6 层）+ Light/Dark/Auto 三主题                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-18 | Design System Stage 1                                                                    | `DESIGN_SYSTEM.md` + `Stack/Inline/Grid` Layout 原语 + CodexCard/TokenTray 示范迁移（修不对称 padding / borderRadius / lineHeight 坑）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-19 | Milestone C-1                                                                            | ZCodeCard 真实实现（Hero + SidePanel + 整卡，12 测试）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-19 | Milestone C-2                                                                            | CodexCard quota 子组件测试补全（4 quotaState × 子组件矩阵，17 测试）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-07-19 | Milestone C-3                                                                            | 客户端切换链路测试（usage-store 7 测试）+ 视觉验收工具（capture.mjs / diff.mjs / pixelmatch）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-19 | Ring 简化-1                                                                              | WeeklyHeroRing 重写为简版 2 层 ring（删刻度 / 删渐变 / 删 halo，端点对称）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-19 | Ring 简化-2                                                                              | WeeklySideRing 推广同款简版 ring（第 2 处，未抽 SimpleRing，等第 3 处）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-19 | 缺口修                                                                                   | tsx paths 缺口修（renderer 7 处 `@/` → 相对路径）+ 窗口尺寸随 client 切换（setResizable workaround，issue #49173）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-19 | server timeZone 对齐                                                                     | 数据层 bug 修复：server daily bucket key 从 UTC 日（`toISOString().slice(0,10)`）改为本地自然日，与 renderer todayKey 对齐（修 UTC+8 凌晨"今日"显示成昨天）。新增 `server/time.ts`（`toLocalDateKey`/`todayKey`/`dateKeyDaysAgo`）+ `tests/time.test.js` + `tests/sessionLogReaderTimezone.test.js`。触碰 §6 红线，理由：数据层独立 bug（见 §7 契约）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-07-20 | Milestone D-1                                                                            | Indicator Bar 完成（Codex 4 段 + ZCode 4 段 + 2 按钮 + 红线，8 测试）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-07-20 | 文档精简（B 方案）                                                                       | HANDOFF 62K→10K（§10.x 压成索引）；`docs/lessons-learned.md` 删除并入 AGENT_LESSONS（12K→21K）；6 处指针改                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-20 | Milestone D-2                                                                            | Orb（82×136，ProgressRing size="orb" 62×62，真胶囊 radius 41）+ EdgeCapsule v7-v26（详见下行）+ App.tsx surface 路由扩展。Orb 15 测试。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-20 | EdgeCapsule v7→v17                                                                       | 用户反馈驱动 10+ 轮视觉/结构迭代。关键节点：**v11** 单一复合 SVG mask、**v12** 信息结构按原型图重组 + Grid 4 列 + 删 5H + 删左侧更新时间、**v13** H 210→180、**v14** 修 Grid 换行 bug、**v15** 主卡片右缘内凹 cubic（产生黑色缺口）、**v16** 两个 path 并集消除黑色缺口、**v17** 胶囊嵌入主卡片右侧内部 + 工具栏收窄 + 文字对比度修复。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-22 | EdgeCapsule v18→v25                                                                      | 视觉精修（v17 基础上）：**v18-v19** 文字对比度（显式颜色函数 inkColor/secondaryColor/tertiaryColor 绕过 capture 模式 var() 解析问题）、**v20** 完整重写（3 数据列等宽 + 信息结构 + 胶囊融合 + 删 overflow 截断）、**v21** 主卡片普通圆角矩形 + 右侧弧形翼片 SVG 覆盖层（删"双卡片拼接"）、**v22** 统一 RightControls 容器（58+24+92 grid，解决 ActionRail/EdgeWing 重叠）、**v23** 翼片弧线向左展开包裹圆环（wingIndentX -10）、**v24** 圆环/状态点右移 8px（calc(50%+8px)）、**v25** 三项优化（统一基线 grid-template-rows + 分隔线缩短 120px + 减弱阴影）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-22 | EdgeCapsule v26（D-2 收尾）                                                              | 功能接入 + token 化 + 规范统一（详见 §4.1）。行为接入真实 store/bridge、ActionRail 复用 IconButton、收起控件改 native button、主题三态循环、删除硬编码 hex/字号、删重复「更新于」、capture 工具支持 theme/scale、行为测试、文档尺寸统一。23 测试（18 结构 + 5 行为）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-22 | EdgeCapsule v27（D-2 最终验收）                                                          | 9 项最终验收修复（详见 §4.5 历史）。showSurface("orb") IPC（不再 window.close 退出）、FIXED_NOW 预览时钟（修今日 token 显示 —）、refresh-error + 保留旧快照、SWR 去重（vm 透传 refresh）、外层行为测试（showSurface/refresh/switchClient 真实接线）、图标 size 18、7 张截图、删 nul 文件。+5 测试。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-22 | EdgeCapsule v28（D-2 最终修正）                                                          | 5 项修正（详见 §4.5）。refresh-error 数据链统一（vm 读 store.error，集成测试验证 dataState）、Segoe Fluent Icons 真替换（FluentIcon 组件 PUA codepoint，非 Windows fallback lucide）、showSurface IPC 运行时校验（validateSurfaceKind + rejection 捕获）、HANDOFF 清理（v26/v27 只留历史）、DPI 如实标注。+5 测试（refresh-error 集成 2 + validateSurfaceKind 3）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-22 | EdgeCapsule v29（P1 修复）                                                               | 3 个 P1：① Auto 图标字母 A bug（E97E HalfAlpha 是 IME 字母，改 E791 FillColor 对比半圆，fonttools+视觉确认）；② Orb 位置保持（showOnly 读旧窗口 bounds + screen.getDisplayMatching，setPosition 到同显示器右下锚点，复用 WPF 算法）；③ refresh-error 可见短提示（TodaySection row4 加 · footer.error/stale，复用 Card 模式）。+1 测试。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-22 | EdgeCapsule v30（最终复验）                                                              | 2 个 P1 清零：主题改用官方 Fluent SVG（Auto 明暗半圆 / Light 太阳 / Dark 月亮）；refresh-error 改为短提示替换更新时间并限制在第三列。+2 FluentIcon 测试，385 测试全绿，`design-qa.md` passed。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-22 | **D-3 切片 1（前台检测 + 自动切换）**                                                    | 前台进程名→SurfaceKind 纯函数 resolver（shared/desktop.ts）+ ForegroundWindowAdapter 接口/Fake/Null（electron/windows/foreground.ts）+ PowerShell P/Invoke 实现（poll-foreground-window.ps1 + foreground-powershell.ts，execFile 10s 超时降级 null）+ AutoSurfaceWatcher 300ms 轮询去抖→showOnly（auto-surface-watcher.ts）+ main.ts 接线（dev/capture 跳过）。7 文件（2 改+5 新建），+6 测试。**纯主进程闭环，未碰 renderer/preload/IPC**。映射对齐 WPF：codex/chatgpt→card、code/cursor/windsurf/zcode→bar、powershell/pwsh→unchanged、其他→orb。真机手测通过。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-07-22 | **D-3 切片 2（hover 展开 Orb→EdgeCapsule）**                                             | 命中区几何纯函数（shared/hover-geometry.ts：Orb 82×136 真胶囊 r=41 / Capsule 720×180 排除左 28px 圆角，+13 测试）+ PowerShell probe（hover-probe.ps1 输出 raw 几何 cursor/bounds/dpi，UTF-8 BOM）+ HoverProbe（execFile 调纯函数，2s 超时降级 false）+ OrbHoverController（80ms probe 状态机，220ms 展开 / 420ms 收起 → showOnly）+ manager.ts getVisibleSurface/getVisibleWindow + main.ts 接线。7 文件（2 改+5 新建），**未碰 renderer/preload/IPC/watcher**。不用 mouseenter/mouseleave（Electron #49982/#33281）。watcher 协调靠 lastResolved 不变式。真机 hover 手测待用户方便时执行（浮窗碍眼）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-22 | **D-3 切片 3（click 展开 + 拖动 + 贴边）**                                               | 拖动判定+贴边纯函数（shared/orb-drag.ts：shouldStartDrag 6 DIP 逐轴 / snapOrbToEdge Y clamp+左/右贴，移植 WPF，+11 测试）+ manager.ts moveVisibleWindow/snapVisibleWindowToEdge/getVisibleWindowBounds + IPC 全链（orb:move/drag-end/get-bounds，channels+desktop.ts+preload+ipc）+ useOrbDrag hook（pointer 状态机，rAF 16ms 节流，click 展开 vs drag 贴边）+ Orb.tsx no-drag（覆盖 App.tsx drag）+ i18n orb 组。10 文件（7 改+3 新建）。Orb 改 no-drag 因 OS drag 抑制 renderer 指针事件。**D-3 三切片代码全部完成**，仅剩真机手测。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-23 | **D-3 修复轮（性能 + 竞态 + 夹具）**                                                     | ① 探针改长驻 `probe-daemon.ps1` + `ProbeDaemon` 客户端（fg/hover 复用单例，368→~3ms）+ foreground-powershell/hover-probe 改委托 daemon。② OrbHoverController + AutoSurfaceWatcher 加可注入 now()+scheduler，dwell 用 `now-start>=delay` 实测计时（修 probeMs 累加漂移）。③ useOrbDrag 竞态修复：startBounds 初始 null + 未就绪不 moveOrb + dragId token + pointercancel/lostpointercapture/effect 清理。④ ViewModel 加 `now` 字段 + EdgeCapsule 倒计时用 vm.now（修过期夹具 + 修复 D-2 遗留测试）。**新增 tests/electron bucket（23 测试）+ useOrbDrag 5 测试**。443 测试全绿（0 失败）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-07-24 | **Milestone E-F + G（托盘 + 设置持久化 + i18n 切换 + a11y）**                            | 主进程为偏好单一真相源。`shared/settings.ts`（schema + validateSettings 纯函数 + resolveLanguageFromLocale）+ `electron/settings/repository.ts`（严格串行写盘 + flush + initialDefaults locale 注入）+ `electron/preferences.ts`（createPreferenceCommitter 可测协调器 + handleGetPreferences/handleSetPreference sender 校验 + requireTrustedSender/allowTrustedSender 通用校验 + performTrayRefresh 托盘刷新协调）。偏好 IPC 四点扩展（getPreferences/setPreference/preferenceChanged + broadcastPreferences/broadcastUsage）。托盘菜单：`buildTrayMenuTemplate` 纯函数 + createTray（占位图标 + rebuild）。renderer：ThemeProvider hydrate 全偏好（getContext/getPreferences 显式 catch + unmount guard）+ themeStore/usageStore 乐观更新+IPC+hydrate + displayStore + i18n.changeLanguage（fallbackLng=en）。a11y：Orb 状态点 role=img+aria-label；reduced-motion 由 globals.css 覆盖。经 4 轮验收修复（全 IPC sender 校验 / 契约统一路径 userData+回退 en / commitPreference 可测 / 串行写盘 / 清理合规 / ThemeProvider 容错 / 托盘刷新可测）。当前测试总数见 §4.4（546 绿 + 1 既有失败）。**真机手测已通过（2026-07-24 用户确认）**。 |
| 2026-07-24 | **E-F 验收修复轮 4**                                                                     | ① P1 全 IPC sender 校验：getUsage/refreshUsage（requireTrustedSender 拒绝）/resizeCardWindow/showSurface（allowTrustedSender 忽略+记录）复用统一逻辑，+6 测试。② P2-a docs/README 设置路径同步 userData（与 PLAN/实现一致）。③ P2-b ThemeProvider getContext/getPreferences 加 catch + unmount active guard（不 unhandled rejection / 失败不阻止渲染 / 迟到不更新 store），+4 测试。④ P2-c 托盘刷新提取 performTrayRefresh 生产函数，main.ts 和测试调同一份，+3 测试。546 绿 + 1 既有失败。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-24 | **test 脚本拆分（修虚报验证）**                                                          | 核实发现 `npm test`/`check` 用 `&&` 串联 5 bucket，server 既有失败使后续 4 bucket（498 E-F 测试）不执行——旧 §4.4"check 时 546 绿"验证场景跑不出来（虚报）。已改：`npm test` 只含 4 绿 bucket（498 绿 exit 0）；新增 `test:server`（48 绿+1 既有 fail）；`check` 把 `test:server` 放末步，前 6 步完整可见。未用 `;`（Windows cmd 不识别为分隔符）。546 总数不变，HANDOFF §4.4 同步更正。未碰 server 稳定层。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-24 | **时区测试失败修复 + 新增 .gitattributes（check 全绿）**                                 | `sessionLogReaderTimezone.test.js` 第 3 测试（UTC 对照）失败根因是测试设计缺陷：写 fixture 时间戳却未注入 `now`，`toUsage` cutoff 用真实系统日期把 fixture 桶滤掉（AGENT_LESSONS L9/L26 同类）。**实现无 bug，未碰 §6 稳定层**，给前 3 测试注入与 fixture 同一时刻的 `now` 修复，`test:server` 48→49。新增 `.gitattributes`（`* text=auto eol=lf` + `*.ps1 binary` 保护 BOM + 二进制资源显式 binary）+ `git add --renormalize`，从根上消除 `core.autocrlf=true` 的 CRLF/LF 行尾假象。现 **`npm run check` 整体 exit 0，547 绿/0 失败**。中途一度误判 E-F+G commit 有"format 债"（30 文件不符），核实为行尾假象，干净树本就全过，已还原（详见 §4.4 + §9 L37/L38）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-07-24 | **Milestone H 切片 1：Electron portable 打包骨架（代码完成，完整 UI 真机验证待用户）**   | electron-builder portable + 打包资源路径已完成；后续已用打包后的 Electron-as-node 实际执行 asar 内 bridge 并请求 `/usage` 成功，证明 bridge 路径/进程链可运行。完整窗口、托盘、probe-daemon 与交互仍需用户双击新 exe 验收。详见 §4.1.2/§4.1.4。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-07-24 | **Milestone H 切片 2：开机自启 + 正式托盘图标（代码/打包完成，真机验收待用户）**         | settings schema v2 新增 `autoLaunch`；portable 注册 `PORTABLE_EXECUTABLE_FILE` 外层 exe；托盘 checkbox 走统一偏好入口；九档 ICO 同时用于 tray/exe 并打包到 resources。`npm run check` 579/579，`npm run dist` 成功；未改真实登录项。详见 §4.1.5/§8.2。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-24 | **Milestone H 切片 3：per-surface 位置 / Orb 四态交互（代码/打包完成，真机验收待用户）** | settings schema v3 保存 workArea 相对坐标、displayId 和 snapEdge。状态为 peek/revealed/floating/expanded；控制器独立于 Auto watcher，固定 Orb 模式也工作；revealed 移开 1 秒回 peek；drag-end 碰边进入 revealed、未碰边进入 floating；expanded 离开 1 秒收起并恢复展开前 placement。`npm run check` 601/601，标准 portable 与 app.asar 验证成功；真实交互/重启/多屏/混合 DPI 待验。详见 §4.1.6/§8.2。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

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
- **Milestone E-F + G（偏好 / 托盘 / 持久化）**：
  - **主进程为偏好单一真相源**：`SettingsRepository`（`electron/settings/repository.ts`）唯一权威。托盘菜单和 renderer 都经它读写，不各自维护真相。renderer 偏好切换走"乐观更新本地 + 发 IPC 持久化"，主进程广播回来由 hydrate 幂等覆盖（避免托盘/UI 各改一份的不一致）。
  - **Settings schema（`shared/settings.ts`）**：`{ version: 3, themePreference, displayPreference, activeClient, language, autoLaunch, windowPlacements }`。只存界面偏好和窗口位置，不存凭据/配额快照（§6 + AGENTS.md 红线）。v1/v2 自动迁移空 placement；单 surface 损坏只回退该项，`normalizePreference` 不接受 windowPlacements。路径 `app.getPath("userData")/settings.json`（Electron 惯例；packaged `productName` 使当前目录为 `%APPDATA%\Usage Monitor\`）。
  - **SettingsRepository 容错**：load 文件缺失/损坏/校验失败 → 回退 DEFAULT_SETTINGS（不阻塞启动）；偏好 update 与 `updateWindowPlacement` 共用串行原子写（.tmp→rename）+ flush()；值未变不产生新引用/写盘。
  - **偏好 IPC**：`getPreferences`(invoke 返 repo.get) / `setPreference`(send，校验后 repo.update + broadcastPreferences) / `preferenceChanged`(主进程→所有窗口广播)。`broadcastPreferences(Settings)` 在 `ipc.ts` 导出，托盘和 setPreference handler 都用（单一广播入口）。
  - **托盘菜单**（`electron/tray/menu-builder.ts` 纯函数 + `tray/index.ts`）：菜单：打开Card / 展示模式(Auto|Card|Bar|Orb) / 客户端(Codex|ZCode) / 主题(Auto|Light|Dark) / 语言(简体中文|English) / 刷新 / 开机启动 / 退出。radio/checkbox 选中态来自 settings；文案主进程内嵌中英文字典（`TRAY_STRINGS`，**不经过 react-i18next**）。偏好变化时 `tray.rebuild()` 重建菜单刷新 ✓。
  - **commitPreference 单一入口**（`main.ts`）：托盘 callbacks 和 setPreference IPC 都经它 = repo.update + broadcastPreferences + tray.rebuild + 应用副作用（theme→nativeTheme.themeSource / display→applyDisplayPreference / client→resizeCardWindow / autoLaunch→setLoginItemSettings）。副作用不遗漏。
  - **applyDisplayPreference**：OrbHoverController 在生产环境独立常驻（自动/固定模式共用，Card/Bar 自行静默）；auto 只额外启动 AutoSurfaceWatcher，非 auto 只停 watcher + 固定 showOnly(目标 surface)。
  - **renderer hydrate**（`ThemeProvider` 扩展）：mount 时 getPreferences() → hydrate theme/client/display + i18n.changeLanguage；订阅 onPreferenceChanged 持续同步。themeStore.setPreference/usageStore.setActiveClient = 乐观更新 + IPC；hydrateFromPreferences = 主进程推送时应用（幂等）。displayStore 无 setter（displayPreference 只能从托盘改）。
  - **托盘 / 应用图标**：`resources/usage-monitor.ico` 含 16–256px 九档，tray 运行时通过 extraResources 读取，portable exe 通过 `win.icon` 嵌入；资源异常才回退内嵌占位。
  - **开机自启**：仅 packaged Windows 应用 `app.setLoginItemSettings`；electron-builder portable 优先注册 `PORTABLE_EXECUTABLE_FILE` 外层路径，development/非 Windows/非法路径明确跳过。真实重登录验收仍待用户。
  - **位置/四态交互（H 切片 3）**：四形态各存 workArea 相对坐标、displayId、snapEdge；原显示器缺失回退主屏并 clamp。边缘 Orb 半隐藏→hover 完整，移开 1 秒重新半隐藏；drag-end 碰到/越过左右边缘时吸附为 revealed，未碰边时以自由 placement 原位停留；点击才展开 Capsule；Capsule 外部点击/离开 1 秒收起并恢复展开前 placement。代码/测试/打包完成，真实交互/重启/多屏/混合 DPI 待验。
  - **未做（留后续）**：全量对比度 a11y 审计（玻璃材质优化时做）；设置弹窗 UI（用户选定仅托盘）。

## 8. 下一步

**D-2 + D-3 + E-F+G 全部完成并真机验收通过**（2026-07-23/24）。下一步候选（按 milestone 归类）：

### 8.1 D-3 自动模式（✅ 全部完成 + 真机验收通过）

**切片 1/2/3 + 多轮修复代码完成；核心 Orb 四态交互真机验收通过**（2026-07-24 用户确认）。固定 Orb 生命周期、边缘/自由拖放分流、revealed/expanded 离开计时已按反馈修正并确认；重启恢复、多屏、侧边任务栏与混合 DPI 仍待系统级复验。详见 §4.1 + §5 历史 + §7 契约。

### 8.1b E-F+G（✅ 全部完成 + 真机验收通过）

**托盘 + 设置持久化 + i18n + a11y 全部 ✅ 完成 + 真机验收通过**（2026-07-24 用户确认）。commit `760cf2a`（旧版写的 `d4e8dce` 是 amend 前 dangling hash，origin/main 实际是 `760cf2a`）于 `feat/milestone-e-f-g` 分支已 ff 合并 main。经 4 轮验收修复。详见 §4.4 + §5 历史。

**D-3 遗留真机验收 checklist（需用户硬件，非代码，不阻塞）**：

- **多显示器**：副显示器上 Orb 半隐藏/hover 露出/展开/收起/自由拖动不跳主屏；自由 placement 和边缘 placement 都由 getDisplayMatching + workArea 相对坐标恢复，待双屏验。
- **混合 DPI**（如主 100% / 副 150%）：跨显示器拖动 Orb，hover probe 的 DPI scale 转换（shared/hover-geometry.ts）正确，setPosition 坐标不错位（Electron #10862/#1625 风险点，只能真机验）。
- **PerMonitorV2**：Electron 43 默认已开，无需代码；验证非主屏不模糊（#8533）。

### 8.2 下一步主要工作

**Milestone H 切片 1 已真机通过；切片 2/3 代码与打包已完成**（2026-07-24，§4.1.2/§4.1.4/§4.1.5/§4.1.6）。下一步按依赖顺序：

1. **✅ Milestone H 切片 1 核心真机验收通过**：2026-07-24 用户截图确认新 portable 可启动、`CODEX · PRO`、每周配额正常、“当前任务”不再显示 lifetime 1B。自动切换/托盘/刷新属于此前已通过功能的快速回归项，不阻塞进入下一切片。
2. **【当前待用户验收】Milestone H 切片 2**：运行 `release/usage-monitor-portable-0.2.0.exe`，确认托盘为正式用量环图标；勾选「开机启动」并确认菜单保持选中；重登录/重启后应用能从外层 portable exe 自启；取消勾选后下次不再自启。AI 未改真实登录项，不能用自动化结果冒充本项通过。
3. **【核心交互已通过，系统级场景待验】Milestone H 切片 3**：用户已确认半隐藏 hover、移开回藏、碰边吸附、自由悬浮、点击展开与 Capsule 自动收起的核心链路。后续只需退出重开确认位置，并覆盖双屏、侧边任务栏、混合 DPI 与显示器断开。AI 未启动 UI，不能用自动化/打包验证冒充剩余系统级场景通过。
4. **【上述验收后】共享层玻璃材质整体优化**（aurora wash 强度、内部高光、双层边缘、环境光晕）—— Orb v3 遗留的 3 项（§7 末）；含全量对比度 a11y 审计。
5. **Card 剩余小事**（§8.4）：Codex Card 像素验收、CardHeader 展示模式菜单实际功能。

- 用户确认：CardHeader 当前禁用的 `2×2` 是展示模式占位，不单独修改；到第 5 项实现真实展示模式菜单时一并替换/移除。
- 真机验收通过后回填此处 + DEVELOPMENT-PLAN §15 Phase 8 Gate（功能对等矩阵全过 + 旧 WPF 退役条件 §18.5）。
- 注：时区测试失败 + format 债已于 2026-07-24 修复（§4.1.1/§4.4）；Milestone H 切片 1/2/3 及四态交互修正的代码与打包均已完成。`npm run check` 现整体 exit 0，601 绿。

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

- **L27（拖动与 hover 必须显式互斥，不能靠"各自正确"碰巧不冲突）**：OrbHoverController 80ms probe 持续移动/回藏 Orb，renderer 同时处理拖动；pointerdown 必须 `suspendHover`，保持已经露出的完整 Orb，pointerup 再 `resumeHover` 并由 click 或 drag-end 决定展开/半隐藏。**教训**：两个独立状态机共享同一交互对象时，必须有显式互斥协议，不能假设时序。
- **L28（pointerup 不能只读 pointermove 设的标志，必须用最终坐标重算位移）**：浏览器可能合并/遗漏最后一次 pointermove，导致 state.dragging 未置 true 但实际 down→up 位移超阈值 → 误判 click 展开。修复：pointerup 时 `wasDragging = state.dragging || shouldStartDrag(upDx, upDy)`，用最终 screenX/Y 重算。**教训**：pointer 事件不保证逐个送达，判定拖动用起止绝对位移，不依赖中间事件标志。
- **L29（拖动 IPC 必须绑定具体窗口 + 校验来源，不能操作"当前可见窗口"）**：moveVisibleWindow/finish drag 若操作"当前可见窗口"，拖动期间 surface 切换会误移 EdgeCapsule/Card/Bar。当前 moveOrbWindow/finishOrbWindowDrag/getOrbWindowBounds 只碰 Orb，IPC 校验 sender=orb，隐藏/销毁时丢弃。**教训**：异步副作用必须绑定明确目标并校验仍可用。
- **L30（并发 showOnly 必须 generation token，后发覆盖先发）**：showOnly 首次创建窗口含异步 loadURL/loadFile，较早发出的切换可能较晚完成覆盖更新的决策。修复：每次 showOnly 自增 `#showOnlyGeneration`，await getOrCreate 后检查 `myGeneration !== current` 则放弃显隐。**教训**：异步"显示 X 隐藏其他"操作必须防乱序完成——generation/epoch token 是标准手段。AutoSurfaceWatcher 同步 await showOnly 后再发下一轮。
- **L31（探针失败和无前台窗口不能折叠成同一个 null）**：ProbeDaemon 失败返 processName:null，resolver 把 null 当 orb → 探针故障时误切 orb。修复：ForegroundProbeResult 改可判别 union（`{kind:"ok",processName}` / `{kind:"error"}`），watcher 见 error 保持当前 surface。**教训**：这是反模式 B（多语义折叠单值）——"检测到无前台窗口"和"检测失败"是两种语义，必须可判别。
- **L32（守护进程请求必须真串行 + requestId，不能 FIFO 匹配）**：ProbeDaemon 原用 pending FIFO 匹配响应，某请求超时后迟到响应错配给下一请求 → 连续错位。修复：真串行（一次一个 inFlight，`#request` 等完成再发下一条）+ 响应按 requestId 匹配（双保险）+ 超时 kill daemon 下次 lazy restart（新进程无残留响应）。**教训**：行协议流一旦失同步（超时/乱序）就不可恢复，要么串行（不可能乱序）要么 ID 匹配，不能假设 FIFO。

### D-3 真机验收修复轮教训（2026-07-23）

- **L33（P0：线协议两端必须实现同一契约，"测试全绿"≠"协议通"）**：probe-daemon.ts 发带 id 的请求 + `#dispatchLine` 只接受相同 id，但 probe-daemon.ps1 的响应**完全没回传 id** → 所有响应被丢弃 → 所有请求超时。`npm run check` 451 全绿因为：parse 单测用合成 JSON（带 id）、controller/watcher 用 fake probe、**没有任何测试 spawn 真实 powershell 验证端到端**。**根因**：协议契约分散在两文件，无集成测试覆盖真实进程。**修复**：ps1 所有响应（fg/hover/unknown/异常）原样回传数值 id；新增 `probe-daemon-integration.test.ts`（7 测试，spawn 真实 powershell 验证 id 回传 + 连续无串线 + 性能）。**教训**：跨进程/跨语言协议必须有**进程级集成测试**（不只测各自的解析函数），否则两端契约漂移不会被静态测试发现。"452 项绿"可以完全掩盖协议根本不通。
- **L34（P1：null 不能折叠"成功无数据"和"执行失败"，即使在 PowerShell 侧）**：Get-ForegroundProcessName 的 catch 返回 null，主进程把 null 当"无前台窗口→orb"。但 API/PInvoke/Get-Process 异常也是 null → 探针故障时误切 orb。**修复**：ps1 返可判别 `@{ok=$true;name=$null}`（成功无窗口）/ `@{ok=$false}`（异常），主循环据此发 processName 或 error。**教训**：L31（探针失败和无前台窗口不能折叠）的同一反模式在 PowerShell 侧又出现一次——可判别结果必须贯穿全链路，不能在一层修了在另一层又折叠。
- **L35（P1：异步副作用取消必须有显式代次/generation，不能靠"后面不发了"）**：hover 展开是 `showOnly(edge-capsule)` 异步（EdgeCapsule 首次创建/load 慢），pending 时用户开始拖动 → suspend 只设标志，但 pending showOnly 完成后仍会隐藏 Orb 显示 capsule。**修复**：`#expandGeneration` 代次，suspend 自增使 pending 展开失效，其 `.then` 检测代次变了 + suspended → 立即 showOnly("orb") 回滚。**教训**：已发出但未完成的异步副作用，"取消"不能只靠标志位阻止未来的新调用，必须让正在途中的调用完成后检查是否已被取消（代次 token）并回滚。
- **L36（P1：子进程 kill 后的迟到事件必须验证身份/代次，不能无条件 reject）**：probe-daemon.ts 的 child exit/error handler 原无条件 `#rejectInFlight`。旧 child 被 kill（超时重启）后其迟到 exit 触发 → reject 新 child 的在途请求。**修复**：`#generation` 代次，每次 #start 自增，handler 捕获后代次，只处理当前代 child 的事件（过时 child 的 exit/error/data 全忽略）。**教训**：kill 不等于事件立即停止——exit/error/data 可能迟到，handler 必须验证 `this.#child === child` 或代次匹配，否则会污染新一代的状态。

### 时区测试修复 + autocrlf 行尾假象教训（2026-07-24）

- **L37（`core.autocrlf=true` + 无 `.gitattributes` 下 `prettier --write` 会制造行尾假象，勿据此误判"格式债"）**：本轮修时区测试时跑 `npx prettier --write electron renderer shared tests/...`，随后 `format:check` 报 30 文件不符、`git status` 显示 30 文件改动，一度误判为"E-F+G commit `760cf2a` 未跑 prettier、HANDOFF §4.4 的 format ✓ 失实"。**核实推翻**：① 在 HEAD 干净树上 `format:check` 本就 exit 0 全过；② `git diff -w`（忽略空白）显示那 30 文件**零内容差异**，全是 LF↔CRLF 行尾；③ `git stash` + `git stash pop` 规范化后 30 文件全部还原，只剩 2 个实质改动。根因：仓库无 `.gitattributes`，`core.autocrlf=true` 让 checkout 时 LF→CRLF；prettier 期望 LF，`--write` 把工作区 CRLF 改 LF，但 git 在 add 时又按 autocrlf 转，造成"改了又像没改"的假象。**教训**：① 看到 `format:check` 报红时，先 `git diff -w --numstat` 看是否有实质内容差异，全 0 就是行尾问题不是格式债；② 修格式前先在干净树上跑一次 `format:check` 确认基线；③ 不要据一次 `--write` 后的 `git status` 就断言"某 commit 有格式债"——可能是环境问题。**已修复（2026-07-24）**：新增 `.gitattributes`（`* text=auto eol=lf` 默认 LF；`*.ps1 binary` 保护 UTF-8 BOM 不被规范化，对齐 L15；常见二进制资源 png/ico/ttf/exe 等显式 binary）+ `git add --renormalize` 规整索引。renormalize 后 `git ls-files --eol` 确认 ps1 三版本 BOM 完好（`ef bb bf`）、工作区 CRLF 的无关历史文件（DEVELOPMENT-PLAN.md/README.md/package.json，blob 本就 LF）不强行改动（遵循"只改任务所需文件"），`.gitattributes` 生效后未来 checkout/编辑会自动规整。
- **L38（fixture 含固定时间戳的测试，被测代码必须用注入 now，勿用 new Date()——L9/L26 的再体现）**：`sessionLogReaderTimezone.test.js` 第 3 测试写 fixture 时间戳 `2026-07-17T16:15:00Z` 却没给 reader 注入 `now`，`toUsage` 的 cutoff（"过去 N 天"）默认用 `new Date()` 取真实系统日期，随时间推移 fixture 桶被窗口滤掉。前两个 HK 测试侥幸通过只因 HK 桶日期恰好 ≥ 真实 cutoff，同样脆弱。**修复**：注入与 fixture 同一时刻的 `now`。这与 AGENT_LESSONS L9（"注入 fixture 须同时注入 now"）/ L26（EdgeCapsule 倒计时）完全同类。**教训**：任何用 fixture 固定时间戳的测试，凡是被测路径里相对"当前时间"做窗口/cutoff/倒计时计算的，都必须注入对应 `now`；否则测试会随系统日期漂移，表现为"曾经绿现在红"。

### Milestone H 切片 1 打包教训（2026-07-24）

- **L39（Electron 打包后，被外部进程执行的资源必须解出 asar，Electron 自身读的资源可留 asar 内）**：electron-builder 默认把 app 打进 `app.asar`，Electron 运行时给 asar 提供虚拟 FS（require/loadFile/existsSync 能读 asar 内文件）。但**非 Electron 进程看不到 asar 虚拟 FS**：`powershell.exe -File <asar内路径>` 会因路径 `...\app.asar\electron\x.ps1` 在物理文件系统不存在而失败；同理任何被 spawn 的外部可执行文件读 asar 内资源都会断。**分类**：① Electron 自身读的（renderer html、preload cjs、被 `ELECTRON_RUN_AS_NODE=1` 的 Electron-as-node 执行的 .js）→ 留 asar 内，路径用 `app.isPackaged ? join(process.resourcesPath, "app.asar", ...) : join(app.getAppPath(), ...)`；② 外部进程执行的（.ps1 / .sh / 第三方 exe 读的配置）→ 必须 `extraResources` 复制到 `resources/` 根（asar 外），路径用 `app.isPackaged ? join(process.resourcesPath, <name>) : join(app.getAppPath(), <devRelative>)`。本项目 `probe-daemon.ps1` 走②、`dist/companionBridge.js` 走①。**教训**：打包不是"把 dev 跑通的路径直接复制"，每个 `app.getAppPath()` 拼 + 被外部进程消费的资源都要单独评估是否需解包；抽出 `electron/paths.ts` 纯函数（inAsar/unpacked/extraResource）集中管理两态路径，避免散落各处的 `if (app.isPackaged)`。
- **L40（portable 验收要拆层；“无法自动验证打包进程”不可先验断言）**：`npm run dist` + asar 结构只证明打包成功，但可进一步用 `release/win-unpacked/Usage Monitor.exe` 配合 `ELECTRON_RUN_AS_NODE=1` 无界面执行 asar 内 bridge，验证真实打包路径、子进程启动和 HTTP 契约。只有窗口、托盘、自动切换、拖拽/hover 等 UI/系统交互仍需用户真机。**教训**：先把可自动化的打包进程链拆出来实跑，再把剩余 UI 硬件门槛如实留给用户。

### Milestone H 切片 2 开机自启教训（2026-07-24）

- **L41（electron-builder portable 的 `process.execPath` 不是稳定启动目标）**：portable 运行时的内部 Electron exe 位于临时解包目录，直接把 `process.execPath` 写入 Windows 登录项会在下次登录时失效。electron-builder 的 portable NSIS wrapper 会把用户双击的外层 exe 写入 `PORTABLE_EXECUTABLE_FILE`；开机自启必须优先注册这个绝对路径，并用同一 path/name/args 关闭。开发态、非 Windows 和非法路径必须跳过。自动测试只能证明路径决策和 API 契约，真实登录项与重登录行为仍需真机验收。跨任务规则详见 `AGENT_LESSONS.md` L16。

### Milestone H 切片 3 位置持久化教训（2026-07-24）

- **L42（位置持久化必须保存 workArea 相对坐标 + 显示器 + 完整贴边语义）**：保存 `displayId + offsetX/offsetY + snapEdge`，恢复时匹配/回退/clamp；边缘 placement 可半隐藏，自由 placement 用 `snapEdge=null`。交互控制器独立于 Auto watcher；状态机含 peek/revealed/floating/expanded，revealed 离开 1 秒回 peek，expanded 离开 1 秒恢复展开前 placement。前次把“展开状态”窄化为 Capsule 属于 `information-gap`；本次把“支持自由悬浮”实现成“所有 drag-end 都清空 snapEdge”属于 `reasoning-error`，因为边缘回藏与自由停留本应按最终 bounds 分流。预防规则：为每态显式记录 hover/leave/outside-click/click/drag，并让 drag-end 测试同时覆盖碰边、越界和未碰边。跨任务规则详见 `AGENT_LESSONS.md` L17。
