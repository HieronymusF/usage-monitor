# Usage Monitor 1.0.0 — 首个正式版

> 状态：首个正式版，面向 Windows x64，同时提供 NSIS 安装包与 portable 单文件版。
> 日期：2026-07-26（Asia/Hong_Kong）

## 本版内容

- Electron + React 四种展示形态：Card、Indicator Bar、Orb、Edge Capsule。
- Codex 真实套餐与 5h / 每周额度；ZCode 只显示本机 Token，不虚构配额。
- Auto / Light / Dark、中文 / English、Codex / ZCode、展示模式和位置持久化。
- 自动前台切换、Orb 半隐藏 / hover / 自由拖动、托盘菜单与开机启动。
- Card、Indicator Bar、Edge Capsule 均可切换展示模式；托盘额度图标随真实剩余百分比动态更新。
- 同时提供 x64 portable 与当前用户优先的 NSIS installer。

## 候选产物

- Portable：`usage-monitor-portable-1.0.0.exe`
- Portable 大小：82,323,149 bytes（78.5 MiB）
- Portable SHA-256：`243D1A6717B173C62230ADEC475F52171F7F498288534A02558E4E83487B69D4`
- Installer：`usage-monitor-setup-1.0.0.exe`
- Installer 大小：82,586,788 bytes（78.8 MiB）
- Installer SHA-256：`A187DE0284D1C957A1E19BBC491D3F968888FAF7E6B4F236C42BA8D6AF5BCB68`
- 解包体积：约 303.0 MiB
- 签名：未签名；Windows SmartScreen 可能显示未知发布者提示。

正式版排除了运行时不需要的 `node_modules`，并只保留 `en-US` / `zh-CN` Electron 语言包。Portable 是 78.5 MiB 的压缩单文件，但运行时仍会临时解压约 303 MiB；余下体积主要是 Electron/Chromium 运行时。

## 安装验收

1. 先从托盘退出正在运行的 portable，避免 single-instance lock 阻止 installer 版本启动。
2. 运行 setup，选择“仅为我安装”（推荐）并完成安装。
3. 从桌面或开始菜单启动 `Usage Monitor`，确认托盘、Card、Bar、Orb、Edge Capsule 和展示模式切换正常。
4. 退出再启动，确认主题、客户端、语言、展示模式及位置仍保留。
5. 如启用开机启动，重登录确认生效；取消后再次重登录确认不再启动。

## 升级、卸载与回退验收

- `appId` 固定为 `com.hieronymusf.usage-monitor`，NSIS 使用由该 ID 派生的稳定安装身份；后续版本不得修改它。
- installer 配置明确 `deleteAppDataOnUninstall=false`，卸载默认保留打包版的 `%APPDATA%\Usage Monitor\settings.json`。
- 1.0.0 是首个正式 NSIS 版本，真正的跨版本覆盖升级要等下一个版本包出现后实测。
- 当前回退步骤：退出 Electron 应用 → 在 Windows“已安装的应用”中卸载 `Usage Monitor` → 启动保留的上一版 portable / WPF 伴生程序。旧回退实现和包在 Phase 8 Gate 及用户最终确认前不得删除。

## 已验证

- 旧 portable 的核心 UI、菜单、动态托盘图标、开机启动和重启偏好已由用户真机确认。首个精简 portable 真机发现“当前任务”为 `—`；修复候选完成构建、asar 与打包运行时真实日志验证后，用户已确认 current task / lifetime UI 显示正常。
- v1.0.0 installer 与 portable 均构建成功；文件元数据和包内版本均为 `1.0.0`。主进程、preload、renderer、companion bridge、探测脚本和正式图标均存在，`app.asar` 不含 `node_modules`；用户已在同功能候选上完成真实安装、卸载且未报告异常。
- `npm run check` 整体 exit 0：`npm test` 567 + `test:server` 54 = **621/621**；typecheck、lint 184 文件、format、production build、plugin validation 全过。

## 已知限制

- 真正的跨版本覆盖升级要等下一版本验证。
- 当前 Windows 文件未做代码签名，SmartScreen 可能显示“未知发布者”。
- 双屏内部接缝、侧边任务栏、原显示器断开与混合 DPI 的完整硬件矩阵。
