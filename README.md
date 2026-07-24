# usage-monitor

一个只读的用量监测插件，附带 Windows 常驻悬浮窗。它监测 **Codex**（官方配额 + 本机估算）和 **ZCode**（仅本机估算）的 Token 用量，显示账户配额、重置倒计时和 Token 统计，不需要在会话中反复 `@` 插件。

- **Codex**：配额窗口、已用比例、重置时间来自 Codex app-server；Token 用量在账户接口不可用时降级为本机 session 估算。
- **ZCode**：没有官方配额接口，只从本机会话日志估算 Token 用量（今日 / 累计 / 历史 / 按模型），不编造配额窗口或剩余百分比。

桌面端目前有**两套 Windows UI 实现**，共用同一份只读数据核心（`server/`）：

| | Electron 应用（主线开发中） | WPF 伴生程序（当前发行版） |
|---|---|---|
| 代码 | `electron/` + `renderer/` | `companion/`（PowerShell + XAML） |
| 四种 surface | ✅ | ✅ |
| 自动前台切换 / 托盘菜单 / 开机自启 / 便携 exe 分发 | ❌ 计划中（见各 milestone） | ✅ |
| 启动 | `npm run dev` | `npm run companion` / 便携 exe |
| 定位 | 新主线，UI 已完成 v30，系统集成待补齐 | 稳定回滚版，待 Electron 补齐功能后退役 |

## Electron 桌面应用（`npm run dev`）

多窗口 Electron 应用，单一 renderer bundle 按 `?surface=` 路由渲染四种形态。不修改 Codex / ZCode 官方界面；只监听 `127.0.0.1` 上的随机端口，用进程内随机 bridge key 鉴权，同一台机器用 `requestSingleInstanceLock` 保证单实例。

### 四种 surface

- **卡片（card）**：完整信息卡，含配额窗口、重置倒计时、今日 / 累计 Token。Codex 576×404，ZCode 576×333。
- **指示条（indicator-bar）**：紧凑单行，Codex 4 段 + ZCode 4 段 + 切换 / 刷新按钮 + 红线（缺失数据显示「—」）。
- **悬浮球（orb）**：82×136 贴边胶囊。Codex 优先显示 5 小时额度、其次周额度；ZCode 显示今日 Token（红线：不渲染配额 ring / 百分比）。
- **展开态（edge-capsule）**：720×180，主卡片 + 右侧弧形翼片（圆环 + 状态点 + 操作栏）。Codex 显示 CODEX·PLUS / 每周额度 / 64% + 重置倒计时 / 今日 Token；ZCode 显示今日 / 累计 / 模型。

### 主题

支持 **深色 / 浅色 / 自动** 三档主题（单按钮循环 auto→light→dark）；自动主题跟随系统。状态同时使用颜色和「充足 / 偏低 / 紧张」文字，不只靠颜色表达。

> 主题偏好目前仅保存在内存，**持久化计划在后续 milestone**。

### 运行

要求 Node.js 20+ 与可用的 `codex` 命令（Codex 配额读取需要；ZCode 监测不需要）。

```powershell
npm install
npm run dev          # 开发模式（带 HMR）
# 或指定 surface + 预览数据：
SURFACE=edge-capsule CARD_PREVIEW=dual npm run dev
```

### 尚未实现（计划中）

以下功能 WPF 伴生程序已具备，Electron 侧待补齐：

- **自动前台窗口切换**（按前台进程切换 surface）—— milestone D-3
- **系统托盘菜单**（右键切换 surface / 客户端）—— milestone E-F
- **设置持久化**（settings.json）—— milestone G
- **开机自启** —— 待实现
- **便携 exe 打包分发** —— 待实现

## WPF 伴生程序（当前发行版，`companion/`）

Electron 版功能补齐前的稳定 Windows 发行版，具备自动前台切换、托盘菜单、开机自启和便携 exe 分发。PowerShell + XAML 实现，通过同一份数据核心（`server/companionBridge.ts` HTTP 桥）获取用量。

### 四种显示模式

- **自动**：根据前台窗口自动切换。Codex / ChatGPT 前台显示卡片；ZCode / VS Code / Cursor / Windsurf 前台显示指示条；其他应用前台收起为悬浮球。
- **卡片**：始终显示完整卡片，含配额窗口、重置倒计时、当前任务 / 今日 / 累计 Token。
- **指示条**：紧凑单行，贴附在目标 IDE 窗口下方，避开右侧系统按钮区。
- **悬浮球**：屏幕角落的贴边胶囊。Codex 优先显示 5 小时额度、其次显示周额度；ZCode 显示今日 Token。悬停展开、离开收起，也可点击或拖动。

点卡片顶栏的客户端名（如「Codex 用量 ▾」）可下拉切换要显示的 agent；点模式按钮下拉选择显示形态。两个下拉都可在 Windows 托盘图标的右键菜单中直接选择。偏好保存在 `app.getPath("userData")/settings.json`（Windows 上即 `%APPDATA%\codex-usage-monitor\settings.json`，只含界面偏好：显示模式、主题、当前客户端）。

### 安装与运行

```powershell
npm install
npm run build
npm run install:companion   # 创建桌面快捷方式
wscript.exe .\start-floating-window.vbs   # 无控制台窗口启动
```

之后双击桌面的「Codex Usage Monitor」快捷方式即可。`start-floating-window.vbs` 通过 `wscript.exe` 静默启动，没有 cmd 黑框闪烁；`start-floating-window.cmd` 保留作后备。便携 exe 打包见 `portable.iss` + `scripts/build-portable.ps1`。

开机自启：

```powershell
npm run install:startup     # 启用
npm run status:startup      # 查看状态
npm run uninstall:startup   # 关闭
```

也可在托盘菜单中勾选 / 取消「开机启动」。开机启动使用当前用户的 Windows「启动」文件夹，不修改系统服务或 Codex 安装目录。

## 作为 Codex 插件使用

```powershell
npm install
npm run check
```

随后在 Codex 插件安装入口选择本目录。插件名和 manifest name 均为 `codex-usage-monitor`。

会话内可使用以下只读 MCP 工具（5 秒内的并发刷新会合并）：

- `get_codex_usage()` / `refresh_codex_usage()`：读取 Codex 当前快照。
- `get_codex_usage_history({ days })`：读取 1–90 天聚合历史。
- `get_zcode_usage()` / `refresh_zcode_usage()`：读取 ZCode 本机估算快照。
- `get_zcode_usage_history({ days })`：读取 1–90 天 ZCode 本机历史。
- `get_all_usage()` / `refresh_all_usage()`：一次性聚合所有已检测客户端。

## 数据精度

| 数据 | 来源 | 精度 |
|---|---|---|
| Codex 配额窗口、已用比例、重置时间 | app-server `account/rateLimits/read` / `updated` | 官方 |
| Codex 剩余比例 | `clamp(100 - usedPercent, 0, 100)` | 由官方比例派生 |
| Codex 账户 Token | app-server `account/usage/read`（仅在能力探测成功时） | 官方 |
| Codex 当前任务 Token | app-server `thread/tokenUsage/updated` | 官方 |
| Codex 今日、累计和历史降级 | 本机 session 的 `token_count` 数值字段 | 本机估算 |
| ZCode 今日、累计、历史、按模型 | 本机会话日志的 `message.usage` 数值字段 | 本机估算 |
| ZCode 配额 / 重置时间 | ZCode 无官方配额接口 | 不可用 |

窗口按 `windowDurationMins` 识别：300 为「5 小时」，10080 为「每周」，其他时长动态显示。服务未返回某个窗口时显示「服务未提供」，不会虚构 0%、100% 或 Token 上限。**ZCode 没有配额接口，悬浮球和卡片都不会为它显示剩余百分比或重置倒计时。**

## 兼容与容错

能力由实际调用探测，不仅凭版本号推断。未知方法会记录为不支持并降级；Codex 缺失、未登录、超时、文件锁、坏 JSON、字段新增、空重置时间和越界比例都会变成结构化 warning，并尽量保留上次快照。重复的同类 warning 会合并计数，避免噪音。

本机 JSONL 使用逐文件 offset 增量读取。缓存只保存聚合值、时间戳和 offset，默认保留 30 天。窗口关闭时会终止由它启动的 app-server 和 bridge 子进程。多客户端架构下，某个客户端刷新失败只影响自身（返回 stale 快照 + warning），不阻塞其他客户端。

## 隐私

- 认证完全交给 Codex app-server；本插件不读取、不转发登录凭据。
- Codex session 只筛选 `type=event_msg`、`payload.type=token_count` 并提取数值字段，不解析或输出 prompt、response、工具参数或文件正文。
- ZCode 只读取会话日志 JSONL 中的数值 `usage` 字段；`~/.zcode/v2/credentials.json`、`config.json` 等敏感文件从不打开。
- 默认不向第三方联网，不上传遥测，不记录完整协议消息。
- 不提供购买 credits、消费 reset credit、修改账户或删除历史的写操作。

## 开发验证

```powershell
npm run typecheck     # server + desktop(electron/renderer) + tests 三套 tsconfig
npm run lint          # scripts/lint.mjs + eslint
npm run format:check  # prettier
npm test              # server (*.js) + renderer domain (*.ts) + components (*.tsx)
npm run build         # build:server (tsc) + build:desktop (electron-vite)
npm run validate:plugin
```

或一键全检：`npm run check`（= typecheck + lint + format:check + test + build + validate:plugin）。当前 385 个测试全绿。

## 许可

MIT。
