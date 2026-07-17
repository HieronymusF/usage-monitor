# codex-usage-monitor

一个只读的用量插件，并附带 Windows 常驻悬浮窗。它监测 **Codex**（官方配额 + 本机估算）和 **ZCode**（仅本机估算）的 Token 用量，显示账户配额、重置倒计时和 Token 统计，不需要在会话中反复 `@` 插件。

## Windows 悬浮窗

悬浮窗支持四种显示模式：

- 自动：Codex 桌面前台显示卡片；ZCode、VS Code、Cursor、Windsurf 前台显示不超过 600 DIP 的单行指示条；其他应用前台显示悬浮球。
- 卡片：始终显示完整卡片。5 小时额度存在时固定为左侧主指标；只有周额度时，周额度圆环移到左侧放大，今日 Token 放右侧。
- 指示条：始终显示紧凑单行数据。窗口本体最多 600 DIP，居中但避开右侧 170 DIP 系统按钮区，不再用透明全宽窗口覆盖“文件 / 编辑 / 视图 / 帮助”。条内按钮可直接切回卡片或收起为悬浮球。
- 悬浮球：屏幕角落的贴边胶囊，Codex 优先显示 5 小时、其次显示周额度；ZCode 显示今日 Token。悬停后展开，离开后带动画收起，也可点击或拖动。

主题支持 `深色 / 浅色 / 自动`；自动主题跟随 Windows 应用主题。状态同时使用颜色和“充足 / 偏低 / 紧张”文字，不只靠颜色表达。

点击卡片右上角的模式按钮可选择自动、卡片、指示条或悬浮球；指示条右端可一键切回卡片或收起为悬浮球，也可以在 Windows 托盘图标的右键菜单中直接选择。模式会保存在 `%LOCALAPPDATA%\CodexUsageMonitor\settings.json`，其中只包含界面偏好。

安装桌面快捷方式并运行：

```powershell
cd D:\TokenUsage\plugins\codex-usage-monitor
npm install
npm run build
npm run install:companion
wscript.exe ./start-floating-window.vbs
```

启用开机启动：

```powershell
npm run install:startup
```

也可以在托盘菜单中勾选或取消“开机启动”。其他命令：

```powershell
npm run status:startup
npm run uninstall:startup
```

开机启动使用当前用户的 Windows“启动”文件夹，不修改系统服务或 Codex 官方安装目录。悬浮窗只监听 `127.0.0.1` 上的随机端口，并使用进程内随机 bridge key。

### UI 设计稿

![Codex Usage Monitor UI design overview](docs/ui-designs/00-ui-design-package-overview.png)

完整 Light / Dark、Codex / ZCode、Card / Indicator Bar / Orb / Edge Capsule 设计稿位于 [Figma「灵光记原型」](https://www.figma.com/design/RoxNVD39VjdWWNbEvhy5HQ/%E7%81%B5%E5%85%89%E8%AE%B0%E5%8E%9F%E5%9E%8B?node-id=1689-3095)。所有 UI 更改必须先更新 Figma，再按具体组件的 Dev Mode 节点实现；强制流程见 [`docs/ui-development-workflow.md`](docs/ui-development-workflow.md)，节点映射见 [`docs/ui-implementation-map.md`](docs/ui-implementation-map.md)，精确规范见 [`visual-spec.md`](docs/ui-designs/visual-spec.md)。

## Codex 插件

Node.js 20+ 环境中运行：

```powershell
npm install
npm run check
```

随后在 Codex 插件安装入口选择本目录。插件名和 manifest name 均为 `codex-usage-monitor`。

会话内可使用以下只读工具：

- `get_codex_usage()` / `refresh_codex_usage()`：读取 Codex 当前快照，5 秒内的并发刷新会合并。
- `get_codex_usage_history({days})`：读取 1–90 天聚合历史。
- `get_zcode_usage()` / `refresh_zcode_usage()`：读取 ZCode 当前快照（本机估算）。
- `get_zcode_usage_history({days})`：读取 1–90 天聚合历史。
- `get_all_usage()` / `refresh_all_usage()`：一次性聚合所有已检测客户端。

## 数据精度

| 数据 | 来源 | 精度 |
|---|---|---|
| Codex 配额窗口、已用比例、重置时间 | `account/rateLimits/read` / `updated` | 官方 |
| Codex 剩余比例 | `clamp(100 - usedPercent, 0, 100)` | 由官方比例派生 |
| Codex 账户 Token | `account/usage/read`，仅在能力探测成功时 | 官方 |
| Codex 当前任务 Token | `thread/tokenUsage/updated` | 官方 |
| Codex 今日、累计和历史降级 | 本机 session 的 `token_count` 数值字段 | 本机估算 |
| ZCode 今日、累计、历史、按模型 | 本机会话日志的 `message.usage` 数值字段 | 本机估算 |
| ZCode 配额 / 重置时间 | ZCode 无官方配额接口 | 不可用 |

窗口按 `windowDurationMins` 识别：300 为“5 小时”，10080 为“每周”，其他时长动态显示。服务未返回某个窗口时显示“服务未提供”，不会虚构 0%、100% 或 Token 上限。**ZCode 没有配额接口，悬浮球和卡片都不会为它显示剩余百分比或重置倒计时。**

## 兼容与容错

能力由实际调用探测，不仅凭版本号推断。当前实测结果见 [docs/capability-matrix.md](./docs/capability-matrix.md)。未知方法会记录为不支持并降级；Codex 缺失、未登录、超时、文件锁、坏 JSON、字段新增、空重置时间和越界比例都会变成结构化 warning，并尽量保留上次快照。

本机 JSONL 使用逐文件 offset 增量读取。缓存只保存聚合值、时间戳和 offset，默认保留 30 天。窗口关闭时会终止由它启动的 app-server 和 bridge 子进程。

## 隐私

- 认证完全交给 Codex app-server。
- 不读取或输出 `~/.codex/auth.json`、cookie、access token 或 API key。
- Codex session 只筛选 `type=event_msg`、`payload.type=token_count` 并提取数值字段，不解析或输出 prompt、response、工具参数或文件正文。
- ZCode 只读取会话日志 JSONL 中的数值 `usage` 字段；`~/.zcode/v2/credentials.json`、`config.json` 等敏感文件从不打开。
- 默认不向第三方联网，不上传遥测，不记录完整协议消息。
- 不提供购买 credits、消费 reset credit、修改账户或删除历史的写操作。

## 展示边界

官方插件扩展点只能提供会话内按需卡片，不能把永久组件插入 Codex 顶栏、状态栏或侧栏。这里的常驻卡片和指示条是独立 Windows 伴生窗，复用同一个只读数据核心，不修改 Codex chrome。

界面层级参考 [Quota Float](https://github.com/change-42-yhmm/quota-float) 的配额卡片与 [Codex Usage Overlay](https://github.com/ymy1990/codex-usage-overlay) 的紧凑指示条；实现、数据源和自动切换逻辑均属于本项目。

## 开发验证

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run validate:plugin
```
