# Usage Monitor 0.2.0 Beta 候选发布说明

> 状态：用户已接受当前 Electron 路线并暂不做技术迁移；包含 current-task 修复的精简 installer 已重建，真实安装、卸载已由用户完成且未报告异常。设置保留、快捷方式、回退和跨版本升级尚未全部确认，因此不是正式发布结论。
> 日期：2026-07-26（Asia/Hong_Kong）

## 本版内容

- Electron + React 四种展示形态：Card、Indicator Bar、Orb、Edge Capsule。
- Codex 真实套餐与 5h / 每周额度；ZCode 只显示本机 Token，不虚构配额。
- Auto / Light / Dark、中文 / English、Codex / ZCode、展示模式和位置持久化。
- 自动前台切换、Orb 半隐藏 / hover / 自由拖动、托盘菜单与开机启动。
- Card、Indicator Bar、Edge Capsule 均可切换展示模式；托盘额度图标随真实剩余百分比动态更新。
- 同时提供 x64 portable 与当前用户优先的 NSIS installer。

## 候选产物

- Portable：`release/portable-current-task-fix-20260726/usage-monitor-portable-0.2.0.exe`
- Portable 大小：82,322,234 bytes（78.5 MiB；原最终候选为 108,069,790 bytes，减少 23.8%）
- Portable SHA-256：`C695556A773A0DCD4F473AB466E90E90A4A8C2171B02A2779DF044C5D1B73A7C`
- Installer：`release/installer-current-task-fix-20260726/usage-monitor-setup-0.2.0.exe`
- 大小：91,535,840 bytes（87.3 MiB；首个候选为 131,161,035 bytes，减少 30.2%）
- 解包体积：317,674,802 bytes（303.0 MiB；首个候选为 559,603,413 bytes，减少 43.2%）
- SHA-256：`78B5618BCFE824E7873145FDE2FEF5CAF425FA8FA98FE13C981A06B822293C8B`
- 签名：未签名；Windows SmartScreen 可能显示未知发布者提示。

精简候选排除了运行时不需要的 `node_modules`，并只保留 `en-US` / `zh-CN` Electron 语言包。Portable 是 78.5 MiB 的压缩单文件，但运行时仍会临时解压约 303 MiB；余下体积主要是 Electron/Chromium 运行时。如果产品要求几十 MiB 级文件且运行占用也低，需要改用原生 Windows/WPF 或 WebView2/Tauri 架构，不能继续靠 Electron 打包参数解决。

## 安装验收

1. 先从托盘退出正在运行的 portable，避免 single-instance lock 阻止 installer 版本启动。
2. 运行 setup，选择“仅为我安装”（推荐）并完成安装。
3. 从桌面或开始菜单启动 `Usage Monitor`，确认托盘、Card、Bar、Orb、Edge Capsule 和展示模式切换正常。
4. 退出再启动，确认主题、客户端、语言、展示模式及位置仍保留。
5. 如启用开机启动，重登录确认生效；取消后再次重登录确认不再启动。

## 升级、卸载与回退验收

- `appId` 固定为 `com.hieronymusf.usage-monitor`，NSIS 使用由该 ID 派生的稳定安装身份；后续版本不得修改它。
- installer 配置明确 `deleteAppDataOnUninstall=false`，卸载默认保留打包版的 `%APPDATA%\Usage Monitor\settings.json`。
- 0.2.0 是首个 NSIS 候选，跨版本覆盖升级要等下一个版本包出现后实测，当前不能写成已通过。
- 当前回退步骤：退出 Electron 应用 → 在 Windows“已安装的应用”中卸载 `Usage Monitor` → 启动保留的上一版 portable / WPF 伴生程序。旧回退实现和包在 Phase 8 Gate 及用户最终确认前不得删除。

## 已验证

- 旧 portable 的核心 UI、菜单、动态托盘图标、开机启动和重启偏好已由用户真机确认。首个精简 portable 真机发现“当前任务”为 `—`；修复候选完成构建、asar 与打包运行时真实日志验证后，用户已确认 current task / lifetime UI 显示正常。
- 精简 installer 构建成功；setup 元数据为 `Usage Monitor 0.2.0`，打包后的主进程、preload、renderer、companion bridge 均存在，`app.asar` 不含 `node_modules`；用户已完成真实安装、卸载且未报告异常。
- `npm run check` 整体 exit 0：`npm test` 567 + `test:server` 54 = **621/621**；typecheck、lint 184 文件、format、production build、plugin validation 全过。

## 尚未通过的发布门槛

- installer 的快捷方式、设置保留与 portable 回退仍未被本次用户反馈明确确认。
- 当前 installer 已包含“当前任务”修复并通过结构核验；安装/卸载已通过，安装版 UI 与 portable 的一致性未被本次反馈单独说明。
- 真正的跨版本覆盖升级。
- Windows 代码签名；当前候选为 `NotSigned`。
- 双屏内部接缝、侧边任务栏、原显示器断开与混合 DPI 的完整硬件矩阵。
