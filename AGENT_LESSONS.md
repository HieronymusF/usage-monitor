# AGENT_LESSONS — codex-usage-monitor

> 跨任务复用的失败模式与预防规则。每条记录：失败模式、预防规则、验证方法、证据、最后确认日期。
> 一次性进度、临时阻塞、原始对话历史不进这里。规则已 captured 在别处（如 HANDOFF）的不重复，只留指针。

## L1. typography 对象禁止 spread 到 style；lineHeight 必须 px

**失败模式**：把 `typography.caption` 等 token 对象 spread 到 React `style`，如 `<span style={{...typography.caption, color:"..."}}>`。`tokens.ts` 的 `lineHeight` 是 number（来自 design-tokens.json），React inline style 把无单位 lineHeight 当字号倍率 → caption 实际行高 `13×19=247px`，metricM `22×28=616px`。单行文字撑爆容器，连带卸载/裁掉兄弟节点，表现是"整个区域消失只剩几个字"。

**预防规则**：

- 禁止 `style={{...typography.X, ...}}`。必须逐字段引用，lineHeight 加 px：
  ```tsx
  lineHeight: `${typography.caption.lineHeight}px`;
  ```
- 优先用已封装的 `MetricValue` / `StatusLabel`（内部已 px 化），不要自己写带 typography 的 span。
- 任何 inline style 的 lineHeight 值，第一个怀疑对象：是否有裸 number lineHeight（无单位）。

**验证方法**：grep `style.*\.\.\.typography` 应零结果；grep `lineHeight:` 在 inline style 里，值必须带 `px`。

**证据**：

- HANDOFF §10.2 P0-1（Milestone B，首轮记录）：MetricValue/StatusLabel lineHeight 单位 bug。
- HANDOFF §10.3"验收后暴露的 P0"（Stage 1，2026-07-18）：CodexCard + TokenTray spread typography 重蹈覆辙，tray 行高 616px 撑爆 card。
- DESIGN_SYSTEM.md §6 Typography（强制规则 + 代码示例）。

**最后确认**：2026-07-18（二次踩坑后升级为强制 + 写入 DESIGN_SYSTEM.md）。

## L2. 改 TSX 后确认无 parse error，再判断"改了没用"

**失败模式**：修改 `.tsx` 引入 JSX 语法错误（标签嵌套配对、`as` 类型断言在 arrow 里被误判等），babel parser 失败。Vite HMR 不抛运行时错误，但**静默回退到上一版缓存**。表现是"改了代码，UI 没变"，容易误判为逻辑问题，反复猜 flex/grid 高度。

**预防规则**：

- 改完 TSX 立即 `npm run typecheck:desktop`（tsc 能抓大部分 JSX 结构错误）。
- 或看 dev log（`call_*-stdout.log`），grep `Internal server error` / `Unterminated` / `SyntaxError` / `parse`。
- 判断"改了没用"前，先排除缓存：确认最新 HMR 时间戳 + 无 parse error，再怀疑逻辑。

**验证方法**：`npm run typecheck:desktop` 全绿；dev log 末尾有最新 `hmr update` 且无 `Internal server error`。

**证据**：HANDOFF §10.3"验收后暴露的 P0"第 2 条（2026-07-18）：Stage 1 调试时 JSX 标签配对错误，HMR 静默回退，我反复猜 flex/grid 高度 4 轮才定位到真根因 L1。

**最后确认**：2026-07-18。

## L3. 固定尺寸浮窗必须锁 body overflow

**失败模式**：Electron 窗口固定尺寸（如 Card 576×404），内容 GlassSurface 精确填满 viewport。但 `html/body/#root` 没设 `overflow:hidden`，任何 1px 误差（scrollbar 占宽、border 计算、内容微超）都触发浏览器滚动条，且能拖动到视口外怪异位置。

**预防规则**：所有固定尺寸浮窗（Card/Bar/Orb/Capsule，本项目全部 surface），`globals.css` 的 `html, body, #root` 必须 `overflow: hidden`。这是 `resizable:false` 浮窗的语义要求。

**验证方法**：grep `globals.css` 确认 `overflow: hidden` 在 html/body/#root 规则里；dev 模式下窗口不能出现滚动条、不能拖动内容。

**证据**：HANDOFF §10.3（2026-07-18）：Stage 1 验收时滚动条反复出现，根因之一是 body 没 lock overflow。已修 `globals.css`。

**最后确认**：2026-07-18。DESIGN_SYSTEM.md §9 Electron Desktop Rules 已含此规则。

## L4. 红线断言要查 visible text，不要扫整个 innerHTML

**失败模式**：写"DOM 不含 0%"断言保护 ZCode 永无配额的红线，但用 `container.innerHTML.includes("0%")` 扫描。结果误命中 `border-radius: 50%`（StatusLabel 状态点 CSS）里的子串 `0%`，测试 fail。看起来是"代码错了"，实际是断言写得太宽。

**预防规则**：

- 红线断言查 **visible text 节点**（`screen.queryByText` / `querySelectorAll("span").filter(textContent)`），不扫 innerHTML（含 style 属性）。
- 查 N% 配额数字：用正则 `^\d+(\.\d+)?%$` 过滤 span 文本节点，CSS `50%` / `100%` 不会进 span textContent。
- 查 label 文案：直接 `screen.queryByText("5 小时剩余")`。

**验证方法**：grep 测试文件，红线断言不依赖 `innerHTML.includes`；改用 `queryByText` 或 `textContent` 正则。

**证据**：HANDOFF §10.4（2026-07-19）：ZCodeCard.test.tsx 首版红线断言用 `innerHTML.includes("0%")`，fail 在 StatusLabel `border-radius: 50%` 的 CSS 子串。改正则查 span 文本节点后通过。

**最后确认**：2026-07-19。

## L5. tsx loader 在 node:test 下不解析 `@/` paths；被测组件须显式 `import React`

**失败模式**：

1. 测试 import 一个用了 `@/stores` / `@/hooks` 的组件（如 CardHeader），`npm test` 报 `ERR_MODULE_NOT_FOUND: Cannot find package '@/stores'`。tsx 4.23 在 `node --import tsx --test` 模式下不读 tsconfig paths，把 `@/stores` 当 npm 包名查。试给 `tests/renderer/tsconfig.json` 加 baseUrl + paths 无效。
2. 测试 import 一个**没显式 `import React from "react"`** 的组件（虽然 tsconfig 是 `jsx: react-jsx`，运行时不需 React 全局），`npm test` 报 `ReferenceError: React is not defined`。

**根因（2026-07-19 §10.9 查清）**：

- tsx 4.23 用 esbuild **transform 模式**（非 bundle）。
- esbuild 官方确认（issue #394）：**transform 模式不应用 tsconfig paths aliasing**，只 bundle 模式才解析。
- 所以 `@/stores/...` 这种 bare specifier 走 Node ESM resolver，在 paths 替换前就失败。
- tsx 的 `resolveTsPathsSync` 钩子只对部分场景生效，bare specifier `@/` 不在内。
- `tsconfig-paths/register` 也不行——默认读 cwd/tsconfig.json，本项目根 tsconfig 无 paths。

**预防规则**：

- **renderer 源码不用 `@/` 别名，全部相对路径**（2026-07-19 §10.9 已迁移完 7 处）。新加的 import 也用相对路径。renderer/tsconfig.json 的 paths 配置保留（vite 生产 build 仍可用），但源码不依赖。
- 测试覆盖的组件**必须显式 `import React from "react"`**（与 MetricValue / GlassSurface 等已测组件一致），即使编辑器提示 unused。一旦该组件被任何测试（单元或整卡）覆盖就必须加。
- 整卡测试引入新传递依赖时，注意它的 `window.X` 全局类型声明文件（如 vite-env.d.ts）需在 `tests/renderer/tsconfig.json` 的 include 里。

**验证方法**：

- `grep -rn "from \"@/" renderer/src/` 应零结果。
- 被测组件文件顶部有 `import React from "react"`。
- 整卡测试 typecheck:tests 过（包括 window.monitor 等全局类型）。

**证据**：

- HANDOFF §10.4（2026-07-19）：ZCodeCard.test.tsx 首版测整卡连环撞 `@/stores` + `React is not defined`，降级为测单元子组件。
- HANDOFF §10.9（2026-07-19）：根因查清，改 7 处 `@/` 为相对路径 + 4 个组件加 React import + tests tsconfig 加 vite-env.d.ts。整卡测试（ZCodeCardIntegration.test.tsx 8 个）通过。

**最后确认**：2026-07-19。

## L7. BrowserWindow.setSize 在 resizable:false + transparent + frameless 窗口上静默失败；用 setResizable workaround

**失败模式**：固定尺寸浮窗（Card/Bar/Orb/Capsule，本项目全部 surface）的 BrowserWindow 用 `resizable: false`。需要程序化 resize（如 client 切换时 Codex 576×404 → ZCode 576×333）时，直接调 `card.setSize(w, h)` **静默不生效**——`getBounds()` before/after 完全一样，不抛错。

**根因**：Electron issue #49173——frameless + transparent + resizable:false 窗口的 setSize 不工作。

**预防规则**：

- resizable:false 窗口的程序化 resize，必须用 workaround 序列：
  ```ts
  card.setResizable(true);
  card.setSize(width, height);
  card.setResizable(false);
  ```
- 临时开 resizable，setSize，立即恢复 resizable:false。
- resizable:false 只禁止**用户拖动** resize，不影响程序化 setSize（有 workaround 时）。

**验证方法**：调用前后 `getBounds()` 对比，确认尺寸真的变了。 setSize 不抛错不代表生效。

**证据**：HANDOFF §10.9（2026-07-19）：C 任务（窗口随 client 切换）首版直接 setSize，`before=576x404 after=576x404` 没变。加 setResizable workaround 后 `after=576x333` 生效。

**最后确认**：2026-07-19。

## L6. JSX 属性值里的模板字符串 `${...}` 可能触发解析器歧义

**失败模式**：在 JSX 属性值里直接写模板字符串带 `${}`，例如：

```tsx
<circle strokeDasharray={`${progressDash} ${CIRCUMFERENCE}`} />
<g transform={`rotate(-90 ${CENTER} ${CENTER})`} />
<StatusLabel label={t(`health.${health}`)} />
```

TypeScript JSX 解析器在某些上下文（特别是属性值里嵌套 `${}`）会误判，报 `JSX element 'X' has no corresponding closing tag` / `Expected corresponding JSX closing tag` / `JSX element has no closing tag`。错误位置可能在很远的地方（实际根因是属性值的模板字符串）。

**预防规则**：

- 把模板字符串提前算成普通 string 变量，再传给 JSX 属性：
  ```tsx
  const progressDasharray = String(progressDash) + " " + String(CIRCUMFERENCE);
  const rotateTransform = "rotate(-90 " + CENTER + " " + CENTER + ")";
  const healthLabelKey = "health." + health;
  <circle strokeDasharray={progressDasharray} />
  <g transform={rotateTransform} />
  <StatusLabel label={t(healthLabelKey)} />
  ```
- 不在 JSX 属性值里直接写带 `${}` 的模板字符串。简单插值（如 `viewBox={`0 0 ${w} ${h}`}`）通常 OK，但**多变量嵌套或包含标识符时改用 string 拼接**。

**验证方法**：typecheck 失败说"JSX closing tag"但代码结构明显正确时，第一个怀疑对象——属性值里的模板字符串。改成字符串拼接变量再 typecheck。

**证据**：HANDOFF §10.7（2026-07-19）：WeeklyHeroRing 重写时，`strokeDasharray={\`${a} ${b}\`}`/`transform={\`rotate(-90 ${c} ${c})\`}`/`label={t(\`health.${h}\`)}` 三个属性都触发 TS17008 "JSX element 'svg' has no corresponding closing tag"。改成 string 拼接变量后通过。注意：标准 tsc 可能也报，不只是 tsx loader。

**最后确认**：2026-07-19。

## L8. typography spread 二次踩坑

（已并入 L1，不重复。）

---

## L9. 注入确定性 fixture 数据时必须同时注入确定性时钟

**失败模式**：预览/测试模式注入合成 fixture（snapshot），但派生逻辑（`todayKey`、倒计时、stale 判定）仍用实时 `new Date()`。fixture 的 daily bucket key 是 `BASE_TIME`（如 2026-07-18）的日期，实时 today 是另一天 → `extractTodayTokens` 按今日日期匹配 bucket 失败 → 今日 token = null → 显示 "—"。

**预防规则**：注入确定性数据时，必须同时注入对应的确定性 now（`now: () => new Date(BASE_TIME)`）。任何依赖时间的派生都要用注入的 now，不要用 `new Date()`。

**验证方法**：预览/截图模式下，所有时间相关字段（今日 token、倒计时、stale）应与 fixture 一致，不随运行日期漂移。

**证据**：EdgeCapsule v27，fixture BASE_TIME=2026-07-18，2026-07-22 截图今日 token 显示 —（应为 1.7M）。修复后 preview 模式用 PREVIEW_NOW。

## L10. SWR mutate 是"写缓存"语义，不是"写 error 状态"

**失败模式**：想让 SWR 记录 error（进 refresh-error 状态），用 `result.mutate(() => { throw err })`。但 mutate 的 fetcher 抛错时，mutate 本身也 reject，调用方 `await mutate` 会抛 unhandled rejection。

**预防规则**：error 状态不要走 mutate。直接调 store 的 setError（数据流：useUsageData → store.error → useUsageViewModel → classifyDataState → refresh-error）。靠 SWR `keepPreviousData` 保留旧快照（不调 mutate 就不清 data）。单一真相源是 store.error，useUsageViewModel 应读 store.error 而非 SWR 的 result.error。

**验证方法**：refreshUsage reject 后，vm.dataState === "refresh-error" + vm.client 保留（不只断言 store.error 非空）。

**证据**：EdgeCapsule v27→v28，refresh 失败 dataState 不进 refresh-error（vm 读 SWR error 但错误推到 store）。

## L11. 多窗口 Electron 关单窗口用 surface 切换，不要 window.close()

**失败模式**：多窗口应用里，单个子窗口调 `window.close()`，触发 Electron `window-all-closed` 事件 → `shutdown()` → 退出整个应用（不只关目标窗口）。

**预防规则**：多窗口应用关闭/收起单个 surface，用 hide/show 或 surface 切换 IPC（`showSurface` → `showOnly`，隐藏目标显示另一个），不要用 `window.close()`（触发 window-all-closed 退出语义）。

**验证方法**：收起/关闭操作后应用不退出，目标窗口隐藏、另一窗口显示。

**证据**：EdgeCapsule v27，edge-capsule 收起调 window.close() 实测退出整个应用（单实例锁 + window-all-closed → shutdown）。改 showSurface("orb") IPC 后正常。

## L12. 图标字体的 codepoint 不能只看友好名，必须渲染验证

**失败模式**：从图标字体（如 Segoe Fluent Icons）选 codepoint 时，凭 glyph 友好名猜语义。`HalfAlpha` 听起来像"半太阳/半月亮"，实际是 IME 半角"字母 A"。渲染出来就是字符 "A"，用户看到明显的错误图标，但 382 项测试全绿（jsdom 不渲染字体字形，无截图测试）。

**预防规则**：

- 从图标字体选 codepoint 必须用 fonttools 提取轮廓 + 渲染 PNG 视觉确认，不能只看友好名。
- 关键 codepoint 在注释里标"已 fonttools 视觉验证"。
- 字体限制要诚实：Segoe Fluent Icons 无 Moon、无 sun+moon 组合——不能用名字接近的字形硬凑（HalfAlpha≠半月亮）。
- 官方 SVG 图标库存在对应语义时，优先使用 SVG 组件，不再退回平台字体 PUA；这样可以消除字形、平台和 CI fallback 分叉。

**验证方法**：fonttools `TTFont(path).getBestCmap()` 读 cmap；PIL `ImageFont.truetype` 渲染候选 codepoint 到 PNG；analyze_image 或人眼确认形状。

**证据**：EdgeCapsule v28→v29，themeAuto 用 E97E(HalfAlpha) 渲染成字母 A（真机截图发现，382 测试未发现）。v30 改用 `@fluentui/react-icons` 官方 SVG：DarkTheme / WeatherSunny / WeatherMoon，并增加 SVG DOM 测试与真机截图验证。

**最后确认**：2026-07-22。

## L13. 固定宽度状态行的异常文案必须替换，不能追加

**失败模式**：720×180 固定窗口中，把完整 refresh-error 文案追加在“更新于 HH:mm”后。单元测试只断言文字存在，未验证可用宽度，最终文字横穿 ActionRail 并被窗口裁切。

**预防规则**：固定宽度数据列的异常状态使用短文案替换普通辅助文字；完整说明放 `title`。状态节点必须有 `maxWidth: 100%`、`overflow: hidden`、`textOverflow: ellipsis` 和 `whiteSpace: nowrap`。不得靠扩大窗口或压缩字号解决。

**验证方法**：组件测试同时断言“普通辅助文字已被替换”和溢出约束；再用固定 viewport 真机截图验证状态文字未进入相邻操作区。

**证据**：EdgeCapsule v29→v30，`刷新失败 — 显示上次数据` 追加到更新时间后发生越界；v30 改为显示“刷新失败”，完整说明保留在 title，720×180 实机截图通过。

**最后确认**：2026-07-22。

## L14. 客户端数据源必须用当前写入链路验证，目录存在和合成测试都不够

**失败模式**：把仍然存在的 `~/.zcode/v2/agent-config/claude` 当成当前 ZCode 桌面端数据源，并用同一套旧 `assistant + message.usage` 合成夹具证明 reader 正确。实际该目录已于 2026-07-18 停更；07-24 的桌面端 GLM app-server 写入 `~/.zcode/cli/rollout/model-io-*.jsonl`，字段和总量语义均已变化。测试全绿但产品持续展示旧 DeepSeek/GLM-4.7 数据。

**预防规则**：

- 确认客户端数据源时必须同时闭环四项证据：启动/安装包中的实际运行时、最新写入目录、真实记录字段结构、当前模型标识。任一项不一致，都不能宣称已适配当前客户端。
- 合成测试夹具必须由当前真实记录脱敏后提取，只保留标识、时间戳、模型和数值用量字段；不得沿用旧格式自证实现正确。
- 数据目录、字段或总量语义变化时必须隔离旧缓存（新 namespace 或明确 schema/source identity），不能只换解析器后继续累加旧 totals。
- Token 总量先验证上游等式。若上游 `totalTokens = inputTokens + outputTokens` 且 input 已含 cache，cache 只能单独展示，不能再次加进 total。

**验证方法**：比较旧/新目录最新 mtime；用真实日志只输出字段名、模型和数值汇总；端到端结果必须出现当前模型且满足已验证的总量等式；再跑合成回归与完整质量门。

**证据**：2026-07-24 ZCode GLM-5.2 修复。旧目录 16 个 JSONL 最后写入 07-18，旧缓存模型为 DeepSeek/GLM-4.7；当前 `model_io` 日志 07-24 写入并标记 `GLM-5.2`。切换 reader 与缓存后，真实端到端只返回 GLM-5.2，完整 `npm run check` 559/559。

**最后确认**：2026-07-24。

## L15. 可执行文件“存在”不等于外部进程“可启动”；套餐文案不得硬编码

**失败模式**：portable 能定位 Windows Store 版 Codex 的 `resources/codex.exe`，但独立 bridge 从包外启动它时收到 `Access is denied`，导致 app-server 配额为空；同时 renderer 的 `brand.codex` 固定为 `CODEX · PLUS`，即使官方事件已返回 `plan_type=pro`，界面仍显示旧套餐。local session 聚合的 lifetime total 还被当成“当前任务”展示成 1B。

**预防规则**：

- 外部运行时探测必须验证“从产品实际父进程上下文成功启动并完成一次请求”，不能只做 `where` / `existsSync`。
- 若官方桌面端已把只读状态写入本地事件，可把该官方快照作为受限执行环境的降级源；只读所需数值/枚举字段，明确标注来源，绝不读取凭据或正文。
- 套餐、计费模式、模型等用户身份状态必须从快照派生；未知时显示中性产品名，不得写死 Plus/Pro。
- lifetime 聚合不得复用为 current-task；无法取得当前任务值时返回 `null`。

**验证方法**：在目标 Windows 安装形态下实际 spawn 一次运行时；再用打包后的 Electron-as-node bridge 请求 `/usage`，断言 HTTP 200、`planType`/窗口/来源正确、current-task 与 lifetime 可区分；Card 和 Edge Capsule 均用 Pro fixture 断言不出现 Plus。

**证据**：2026-07-24 portable Codex 修复。包外执行 Windows Store `codex.exe app-server` 复现 `Access is denied`；本机最新 `token_count.rate_limits` 返回 `plan_type=pro`。修复后打包 bridge 返回 Pro、每周配额及 `currentTask=null`，完整 `npm run check` exit 0。

**最后确认**：2026-07-24（Asia/Hong_Kong）。

## L16. portable 开机自启必须注册外层稳定 exe

**失败模式**：electron-builder portable 先把应用解到临时目录再启动。若把运行时 `process.execPath` 写入 Windows 登录项，注册的是内部临时 Electron exe；临时目录清理或下一次登录后，该路径可能不存在，表现为菜单已勾选但应用不自启。

**预防规则**：

- packaged Windows portable 优先使用 electron-builder 注入的 `PORTABLE_EXECUTABLE_FILE`；它指向用户实际双击的外层 exe。
- 只有该变量缺失时才回退 `process.execPath`，并要求目标为绝对 Windows 路径。
- 启用与停用必须使用相同的 `name`、`path` 和 `args`；development、非 Windows 和非法路径明确跳过。
- 设置文件保存的是用户期望态，不是系统已成功注册的证明；系统 API 失败要记录，应用启动时可按期望态重试。

**验证方法**：纯函数覆盖 portable/dev/非 Windows/非法路径；adapter 测试覆盖开关同路径、API 抛错不阻塞；检查打包器生成脚本确认外层 `$EXEPATH` 写入 `PORTABLE_EXECUTABLE_FILE`。最终仍要在真实 Windows 上勾选、重登录、取消后再重登录。

**证据**：2026-07-24 Milestone H 切片 2。当前 electron-builder portable 模板和生成的 `builder-debug.yml` 均设置 `PORTABLE_EXECUTABLE_FILE=$EXEPATH`；实现后的 `npm run check` 579/579，portable 构建成功，真实登录项尚未由 AI 改动。

**最后确认**：2026-07-24（Asia/Hong_Kong）。

## L17. 浮窗位置要保存工作区相对坐标、显示器和完整贴边语义

**失败模式**：只保存绝对屏幕坐标时，显示器断开、任务栏变化或 DPI / 分辨率变化会让窗口落到屏外；只把旧窗口的右下角锚点传给新形态时，左贴边 EdgeCapsule 收起成较窄 Orb 会跳到 `x=644` 一类的错误位置，而不是继续贴左边。只把“贴边”实现成完整可见的 snap 也不够：360 悬浮球式贴边还包括静止态半隐藏。反过来，只实现半隐藏却保留“hover 直接展开 Capsule”，会让 Orb 没有完整可拖命中区，功能上不可用。

**预防规则**：

- 每种 surface 独立保存 `displayId`、相对该显示器 `workArea` 的 `offsetX/offsetY` 和显式 `snapEdge`，不要保存全局绝对坐标。
- 恢复时优先匹配原显示器；找不到就回退主显示器，并把结果 clamp 到当前 `workArea`。显式 left/right 贴边必须优先于通用右下锚点换算。
- 规格和测试必须同时定义贴边后的可见宽度；本项目 Orb 在真实左右外边缘只保留 24 DIP 可见。`snapEdge` 本身不足以表达静止态视觉。
- 半隐藏只用于真实物理外边缘；多显示器内部接缝或侧边任务栏处必须保持完整可见，避免窗口藏进相邻屏幕或任务栏后方。
- 半隐藏引入后必须画出可达状态机并验证每个入口：`peek → hover revealed Orb → click expanded Capsule`，以及 `Orb → drag → edge revealed / free floating → click expanded Capsule`。hover 只露出 Orb；完整 Orb 未碰边时必须可在任意位置原位停留，碰到左右边缘时必须恢复贴边回藏语义。
- 状态契约不能只写转换箭头；每个状态都要逐项定义 hover、离开延时、窗口外点击、单击和拖动结果。否则“展开状态”一类自然语言容易被误读为只指 Capsule，漏掉 revealed Orb 也是临时态。
- Orb 交互控制器必须独立于 AutoSurfaceWatcher 生命周期：自动模式和固定 Orb 模式都要运行；Card/Bar 可见时控制器自行静默。否则固定模式会同时丢失 hover、窗口外点击和 Capsule 离开计时，而 renderer click 仍会直接展开，造成“测试绿但整条交互失效”。
- 1 秒离开计时作用于临时态：revealed Orb 离开满 1 秒回 peek，expanded Capsule 离开满 1 秒恢复展开前的 Orb placement；floating Orb 不因离开或窗口外点击改变。`snapEdge` 非空回 peek，`snapEdge=null` 回 floating。
- Orb 拖动是高频 `setPosition`，只在 drag-end 落盘：最终 bounds 碰到/越过左右边缘时保存对应 `snapEdge`，否则以 `snapEdge=null` 保存自由位置；不能把“支持自由悬浮”实现成“所有拖放都清空贴边语义”。使用原生窗口拖动的 Card/Bar/Capsule 可在 Windows `moved` 事件后落盘。
- 坐标属于主进程窗口状态，不新增 renderer 坐标 IPC；设置仓库仍是唯一写盘入口。

**验证方法**：纯函数覆盖负坐标副屏、显示器断开回退、workArea/DPI 变化、越界 clamp、拖放碰边/越界/未碰边、自由 placement、左右各只露 24 DIP、旧版 snap 兼容、内部接缝、侧边任务栏和 Orb↔Capsule 往返；控制器测试覆盖 hover 只露出、边缘 drag-end 进入 revealed 并离开 1 秒回 peek、自由 drag-end 进入 floating 且不自动隐藏、expanded 离开 1 秒恢复展开前 placement；renderer 测试断言 drag-end 传 `dragged=true`。真实 Windows 必须分别用自动和固定 Orb 模式走完整状态机。

**证据**：2026-07-24 Milestone H 切片 3 真机反馈修正。固定 Orb 模式因 controller 随 Auto watcher 停止而整条交互失效，drag-end 也仍强制吸边；随后先漏掉 revealed Orb 的自动回藏，又把所有 drag-end 都保存为自由位置，导致拖回边缘不能隐藏。按最终 bounds 分流后 `npm run check` 601/601，聚焦几何+控制器 29/29；标准 portable 重建成功，`app.asar` 已确认碰边保存 snapEdge、边缘进入 revealed、自由进入 floating。AI 未启动 UI，真实交互与多屏位置恢复尚未验收。

**最后确认**：2026-07-24（Asia/Hong_Kong）。

---

## Milestone A 复验 8 反模式（A-H）

> 来源：2026-07-18 Milestone A 两轮复验反推。每条对应一个真实的 P1 bug。
> `AGENTS.md §"代码纪律"`是这 8 条的强制 checklist 摘要。违反任一条都会引入 P1 bug。

### A. 未读源码就实现派生逻辑 ⚠️ 最严重

**失败模式**：实现"解释 server 数据"的逻辑时，凭注释、直觉或命名猜测 server 行为。

**真实案例**：

- 把未知 `windowMinutes` 的 quota window 当 null 丢弃——实际 `server/normalize.ts:86` 只过滤缺失/非对象窗口，未知分钟数会保留并由 `labelWindow` 生成 label。
- `todayKey` 照抄 `sessionLogReader.ts:194` 的 UTC 切片——没质疑 server 这么做是否正确，把上游 bug 当成"契约对齐"的目标。

**根因**：把"读源码"当成可选步骤，用"我以为"替代"代码确实是"。

**预防规则**：

1. 打开对应 server 源码读完，不只看类型定义。
2. 用 grep 确认实际行为，例：`grep -n "windowMinutes" server/normalize.ts`。
3. 在源码引用里记下行号，写进自己代码的注释。
4. 发现 server 行为本身可能是 bug 时，停下来报告，不要照抄。

### B. API 把多种语义折叠成单值

**失败模式**：用 `null` / `undefined` / 空字符串同时表达多种语义不同的状态。

**真实案例**：`toUsageViewModel` 对 `snapshot === null` 直接 `return null`，导致 loading 和 offline 都返回 null，组件无法区分。

**根因**：偷懒省字段，没考虑下游需要判别状态。

**预防规则**：

- 禁止用单一 `null`/`undefined` 折叠多种语义。
- 必须用 discriminated union 或显式状态字段。例：`{ dataState: "loading" | "offline"; client: null }` 而非 `return null`。
- 自检：下游组件能否仅凭返回值区分所有状态？不能就重构。

### C. 红线字段依赖上游正确性

**失败模式**：红线规则（如"ZCode 永不显示配额"）靠"上游应该不会填 limits"来保证，而不是无条件强制。

**真实案例**：

- ZCode ViewModel 靠 `classifyQuotaStates([])` 返回 unavailable——一旦 ZcodeSource 被错误填了 limits，配额就会泄露到 UI。
- `extractTodayTokens` 用 `daily[daily.length-1]` 假设最后一条是今天——跨天/乱序时会显示昨天数据。

**根因**：信任链过长。红线必须在最靠近 UI 的一层无条件强制。

**预防规则（红线清单，必须在 domain 层强制）**：

| 红线                  | 强制位置                 | 强制方式                                                                       |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| ZCode 永不显示配额    | `toClientUsageViewModel` | `if (kind === "zcode")` 分支强制清空 primary/secondary/extra/quotaState/health |
| Codex 配额缺失不伪造  | `pickQuotaWindows`       | 缺失时返回 `null`，不是 0%/100%                                                |
| 今日 Token 按日期匹配 | `extractTodayTokens`     | 按 `todayKey(now)` 精确匹配，不取数组末尾                                      |
| 不读凭据              | server 全层              | lint.mjs 已强制；新代码不得引用 auth/cookie/token                              |

每条红线必须有至少一个测试用"畸形输入"验证防御生效（如 `zcodeWithBogusLimits` fixture）。

### D. 分类集合成员语义混淆

**失败模式**：把语义不同的 code/flag 塞进同一个集合。

**真实案例**：`SOURCE_REFRESH_FAILED_CODES = new Set(["SOURCE_REFRESH_FAILED", "STALE"])`——前者是"某源失败但其他正常"（partial），后者是"数据已过期但仍保留"（stale）。两者触发完全不同的 UI 提示。

**根因**：集合命名笼统，没在定义处写明每个成员的语义。

**预防规则**：

- 每个成员必须写注释说明它代表什么、触发什么下游行为。
- 集合命名要精确：不叫 `SOURCE_REFRESH_FAILED_CODES` 然后塞 `STALE`，应该拆成 `SOURCE_REFRESH_FAILED_CODES` + `STALE_WARNING_CODES`。
- 优先级必须在注释里写明（如"stale 高于 partial"）。

### E. 先写实现再试错期望值

**失败模式**：写完函数后跑测试，失败就改期望值或改实现，反复横跳。

**真实案例**：

- `formatToken` 默认 `significantDigits=1` → `23.8M` 变 `20M`；改成 3 → `1.5B` 变 `1.50B`、`392.8M` 变 `393M`。三次才对。
- fixture 命名 `codexCritical0/Low19/LowBoundary20` 与测试断言不对应，测试名写"remaining=0"但用的是 `codexLow19`。

**根因**：期望值应该来自规格（visual-spec / server 行为 / 用户原话），不是来自"我刚写的实现"。

**预防规则**：

1. 先从权威来源确定期望值：visual-spec §X、server 行为、用户原话。
2. 写成测试断言（测试先红）。
3. 再写实现直到测试变绿。
4. 禁止实现完成后反向调整测试期望值来"让它通过"。

例：`formatToken(23_800_000)` 期望 `"23.8M"`——这个值来自 `visual-spec.md §6`，不是来自我的实现。

### F. 边界输入未覆盖

**失败模式**：纯函数只测"正常路径"，没测 null/undefined/空数组/非法字符串/数值边界。

**真实案例**：`toLocalDateKey(new Date("garbage"))` → `new Date("garbage").toISOString()` 抛 RangeError，整个 bucket 流程崩溃。

**根因**：把"调用方应该传合法值"当成不写防御的理由。

**预防规则**：每个纯函数至少覆盖：

1. 正常值（happy path）
2. null / undefined（缺失）
3. 空集合（`[]` / `""` / `{}`）
4. 非法输入（`NaN` / Invalid Date / 越界数字 / 非法字符串）
5. 边界值（数值的 0/边界点；时间的午夜/月末/闰年）

少一类就是漏洞。

### G. 改动影响范围未评估

**失败模式**：改构建配置/共享类型/公共 API 时，没列出所有下游受影响点。

**真实案例**：为了支持 `shared/time.ts`，把 `tsconfig.build.json` 的 `rootDir` 从 `server` 改成 `.`，导致 dist 结构变成 `dist/server/...`，破坏所有 `../dist/xxx.js` import 和 `.mcp.json`。最后放弃 shared/ 改用 server/time.ts。

**根因**：动手前没问"这个改动会影响哪些文件/路径/契约"。

**预防规则**：改以下任何一项前，先列出所有受影响的下游：

- `tsconfig*.json`（影响 dist 结构 → 影响 .mcp.json、tests import、package.json `main`）
- `package.json` 的 `files` / `main` / scripts
- `shared/` 目录结构（renderer 和 server 都可能依赖）
- 公共 API 签名（types.ts、shared/desktop.ts）
- HTTP bridge 路由或响应 shape

列完再决定改不改。如果影响 >3 处，优先找局部方案。

### H. 质量门未提前验证

**失败模式**：写了大量代码后才第一次跑 typecheck/lint/test，遇到一堆基础设施问题（类型规则、eslint 规则、TS 运行时支持）。

**真实案例**：

- `exactOptionalPropertyTypes` 把 `now?: () => Date` 透传给 `now: (() => Date) | undefined` 判错。
- `@typescript-eslint/consistent-type-imports` 禁止 `import()` 内联类型注解。
- Node `--experimental-strip-types` 不支持 `.js → .ts` 解析，被迫装 tsx。

**根因**：不熟悉项目的严格性配置。每个项目的 tsconfig/eslint 都不同，不能套用记忆。

**预防规则**：新加一类代码（新目录、新测试框架、新构建配置）时：

1. 先创建最小骨架（一个空函数 + 一个空测试）。
2. 跑 `npm run check` 确认骨架通过质量门。
3. 再填充实现。

这样基础设施问题在写 10 行时暴露，不是写 200 行时。

### 提交前 30 秒自检表（A-H 浓缩）

- [ ] 我读了对应的 server 源码吗？引用了行号吗？（A）
- [ ] 返回值能区分所有状态吗？没用 null 折叠？（B）
- [ ] 红线字段无条件强制了吗？有畸形输入测试吗？（C）
- [ ] 分类集合每个成员都注释了吗？（D）
- [ ] 测试期望值来自规格，不是来自我的实现？（E）
- [ ] 纯函数测了 null/空/非法/边界五类输入？（F）
- [ ] 我改了构建配置/共享类型吗？列过影响范围吗？（G）
- [ ] `npm run check` 全绿吗？（含新增的 typecheck:tests，H）

任一项不满足，停下来补。

### 历史案例索引（供后续 agent 对照）

| 日期       | 反模式 | 案例                                   | 修复参考                                                     |
| ---------- | ------ | -------------------------------------- | ------------------------------------------------------------ |
| 2026-07-18 | A      | 未知 windowMinutes 被丢弃              | `classify-quota.ts` 改为保留 `kind="other"`                  |
| 2026-07-18 | A      | todayKey 用 UTC 照抄 server bug        | 新增 `server/time.ts` 统一本地自然日契约                     |
| 2026-07-18 | B      | loading/offline 都返回 null            | `UsageViewModel.client` 改为 `T \| null` + dataState 判别    |
| 2026-07-18 | C      | ZCode 靠 `classifyQuotaState([])` 清空 | `toClientUsageViewModel` 加 `if (kind==="zcode")` 无条件分支 |
| 2026-07-18 | C      | 今日 Token 取 daily 末尾               | `extractTodayTokens` 按日期 key 精确匹配                     |
| 2026-07-18 | D      | STALE 进了 partial 集合                | 拆成 `STALE_WARNING_CODES` + 优先级 stale > partial          |
| 2026-07-18 | E      | formatToken 精度反复试错               | 改为 visual-spec §6 期望值先行                               |
| 2026-07-18 | F      | toLocalDateKey 对 Invalid Date 崩溃    | 加 `Number.isFinite(date.getTime())` 兜底                    |
| 2026-07-18 | G      | tsconfig rootDir 改动破坏 dist         | 放弃 shared/，用 server/time.ts                              |
| 2026-07-18 | H      | exactOptionalPropertyTypes 透传错      | 改为条件赋值 `if (x !== undefined) obj.x = x`                |
| 2026-07-18 | H      | Node strip-types 不支持 .js→.ts        | 装 tsx 作为 `--import` loader                                |

---

## 指针：其他已 captured 的规则

下列规则已在别处确立，不在本文件重复：

- **DESIGN_SYSTEM 强制工作流（5 步开工 + 5 条禁止）**：见 `AGENTS.md` §"DESIGN_SYSTEM 强制工作流" 和 `DESIGN_SYSTEM.md` §14。
- **跨项目通用反模式（借修 bug 建体系 / 静默选择 / 过早抽象 / 验证标准不清）**：见 `C:\Users\Jerome\.zcode\AGENT_LESSONS.md` G1–G4。
  起因：2026-07-19 用户反馈本项目 Design System Stage 1 工作有"瞎改 / 炫技 / 不务实"问题，触发反省。
  本项目相关的具体证据已写入全局 G1（16 节文档 + 3 Layout 原语）、G2（静默建 Design System 没先问）、G3（2 处复用就抽象）、G4（视觉验证靠轮询）。
  **本项目后续工作的强约束**：bug 修复 diff 只含 bug 修复；新抽象必须等到第 3 处真实复用；视觉任务要有几何 / fixture 断言，不只靠"开 dev 让用户看"。
  Karpathy 4 原则已落地到 `D:\TokenUsage\AGENTS.md` 根级。
