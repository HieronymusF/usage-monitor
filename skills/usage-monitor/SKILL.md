---
name: usage-monitor
description: 显示或刷新 Codex 配额与 Token 用量、ZCode Token 用量，或读取 1-90 天历史。用户询问 Codex/ZCode 用量、配额、限额、剩余额度、Token 消耗、重置时间或用量历史时使用。
---

# Usage Monitor

使用本插件的只读 MCP 工具获取数据，不猜测缺失窗口或 Token 上限。Codex 与 ZCode 是两个独立客户端，能力不同。

## Windows 悬浮窗

需要常驻查看时，优先使用插件根目录的 `start-floating-window.cmd`，或桌面的“Codex Usage Monitor”快捷方式。它是独立置顶伴生窗，支持三态：

- **卡片**：详细配额与 Token，适合 Codex/ZCode 在前台时。
- **指示条**：屏幕顶部紧凑单行。
- **悬浮球**：屏幕角落的轻量小球，显示今日 Token；点击展开 Codex/ZCode 两栏详情；拖动可移动。自动模式下，非编码客户端前台时默认用悬浮球，不干扰桌面。

悬浮窗是独立伴生程序，不修改 Codex/ZCode 官方界面；只监听 `127.0.0.1` 随机端口并使用进程内随机 bridge key。

## Codex 用量

1. 调用 `get_codex_usage`（或 `refresh_codex_usage` 强制刷新）。
2. 原样保留卡片中的数据来源、质量、更新时间与 warning。
3. 若 5 小时或周窗口缺失，显示“服务未提供”，不要改写为 0%、100% 或估算值。

## ZCode 用量

1. 调用 `get_zcode_usage`（或 `refresh_zcode_usage`）。
2. ZCode **没有官方配额接口**：只返回本机会话日志估算的 Token 统计（今日 / 累计 / 按模型 / 历史），标注 `local_estimate`。
3. 不要为 ZCode 编造剩余百分比、重置时间或配额窗口。

## 汇总

调用 `get_all_usage`（或 `refresh_all_usage`）一次性获取所有已检测客户端的聚合快照。

## 历史

调用 `get_codex_usage_history` 或 `get_zcode_usage_history` 并传入 1–90 的 `days`。账户历史不可用时，明确说明数据是本机 session 的增量估算。

## 边界

- 工具只读，不购买 credits、不消费 reset credit、不更改账户、不删除历史。
- 不读取或索要认证文件、cookie、access token、API key 或对话正文。ZCode 的 `credentials.json` / `config.json` 从不打开；只读 JSONL 的数值 `usage` 字段。
- 此插件只提供会话内按需卡片与独立悬浮窗；不要声称能修改 Codex/ZCode 顶栏、状态栏或侧栏。
