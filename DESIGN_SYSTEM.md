# UI Design System — codex-usage-monitor

> 本文件定义"怎么做 UI"。所有 AI agent 改 UI 前必读（强制工作流见 `AGENTS.md` §"DESIGN_SYSTEM 强制工作流"）。
>
> 本文件是规则文档，不重复 token 值。token 的唯一源是 `docs/ui-designs/design-tokens.json`，TS 镜像是 `renderer/src/styles/tokens.ts`，CSS 变量在 `renderer/src/styles/globals.css`。

## 1. Authority & 冲突裁决

冲突时按此顺序裁决，前面的覆盖后面的：

1. **本文件**（DESIGN_SYSTEM.md）—— 规则与流程
2. **`design-tokens.json` + `tokens.ts` + `globals.css`** —— 可测量值
3. **`docs/ui-designs/visual-spec.md`** —— 组件视觉规范
4. **`docs/ui-designs/01-05*.png`** —— 构图、材质、信息层级
5. 当前生产代码 —— 只用于核对已有行为，不能反向覆盖规范

**禁止根据单张应用截图临时移动元素。** 视觉修订必须先改本文件或 token，再进入代码。

## 2. Design Token 体系

三层镜像，`tokens.test.ts` 与 `css-tokens.test.ts` 守护一致性：

| 层       | 文件                                 | 内容                                                                                                       |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| JSON 源  | `docs/ui-designs/design-tokens.json` | 颜色/尺寸/字号/圆角/描边/动效                                                                              |
| TS 镜像  | `renderer/src/styles/tokens.ts`      | `spacing` / `radius` / `stroke` / `motion` / `typography` / `ringGeometry` / `surfaceSizes` / `ringAngles` |
| CSS 变量 | `renderer/src/styles/globals.css`    | `--c-*` 颜色 + `--shadow-*`，通过 `@theme` 映射成 Tailwind 工具类（`bg-primary` 等）                       |

改任一层必须同步改另两层，否则测试红。改颜色的步骤见 `globals.css` 顶部注释。

## 3. Color

颜色只走 CSS variable（`--c-ink` / `--c-accent-start` / `--c-base-glass` 等），不在组件里写 hex。

- 文字：`var(--c-ink)` / `--c-secondary` / `--c-tertiary`
- 强调与状态：`--c-accent-start` → `--c-accent-end`（渐变方向只在 ProgressRing 用）、`--c-success` / `--c-warning` / `--c-danger`
- 结构：`--c-rail`（数据轨道）、`--c-border`（1px 描边）
- 玻璃材质 4 层：`--c-base-glass` + `--c-blue-wash` + `--c-mint-wash` + `--c-violet-wash`，封装在 `GlassSurface`，业务组件不要自己拼

完整颜色表见 `globals.css` §Light / §Dark。Light/Dark 切换靠 `<html>` 上的 `.light`/`.dark` class（`ThemeProvider` 写），不依赖 `prefers-color-scheme`。

## 4. Spacing

基础单位 8px，半单位 4px。**所有 gap / padding / margin 必须用 `spacing` token**。

| Token key | px  | 典型用途                                               |
| --------- | --- | ------------------------------------------------------ |
| `0_5`     | 4   | 图标与文字微距、菜单内边距                             |
| `1`       | 8   | 标签与控件间距、按钮组间距、surface 内统一纵向 padding |
| `1_5`     | 12  | 区块内 gap、TokenTray 列间距                           |
| `2`       | 16  | 区块间 gap、Card 内部主列横向 padding                  |
| `3`       | 24  | Card 内部主 padding                                    |
| `4`       | 32  | 大区块间距（本项目暂未用）                             |

**用法**：

```tsx
import { spacing, type Spacing } from "@/styles/tokens";
// 或直接用 layout 原语：
import { Stack } from "@/components/layout";
<Stack gap="1_5">...</Stack>; // gap 自动从 token 解析为 12px
```

**禁止**：`gap: "14px"`、`padding: "10px 16px"` 这类裸字符串。如果当前值不在 spacing 档（如历史代码里的 14/10/22），**不要凭空加 token**，归一到最近档（14→12 或 16，10→8 或 12），并在迁移日志（§11）记一笔。

**surface 内固定几何值白名单**（§13）：visual-spec §2 列出的 Card padding（21/22/28/20）、Card 主区列宽（340px、560px）、surface 窗口尺寸，属于契约值，允许作为命名常量在 surface 文件内声明，不进 `spacing` 表。

## 5. Radius

| Token                | px  | 用途                    |
| -------------------- | --- | ----------------------- |
| `radius.card`        | 34  | Card 主表面             |
| `radius.tray`        | 22  | TokenTray、内嵌玻璃托盘 |
| `radius.bar`         | 9   | Indicator Bar           |
| `radius.orb`         | 36  | Collapsed Orb           |
| `radius.capsuleLeft` | 28  | Edge Capsule 左侧       |
| `radius.button36`    | 18  | Card 上的 IconButton    |
| `radius.button30`    | 15  | Bar 上的 IconButton     |

**关键规则**：TokenTray 是 tray surface，必须用 `radius.tray`（22），不要写 `borderRadius: "18px"`。surface 与 radius 必须对应，不允许局部调整。

## 6. Typography

10 个 variant，每个绑定 `fontFamily` + `fontSize` + `lineHeight` + `fontWeight`。**禁止裸 `fontSize`/`lineHeight` 字符串**。

| Variant     | 字号/行高 | 字重     | 本项目用在哪                                 |
| ----------- | --------- | -------- | -------------------------------------------- |
| `displayXL` | 92 / 96   | Bold     | Card 主百分比（5h Hero）                     |
| `displayL`  | 60 / 64   | Bold     | 周额度 Hero（WeeklyHeroRing）                |
| `displayM`  | 42 / 48   | Bold     | 次级圆环百分比（SidePanel）                  |
| `displayS`  | 34 / 42   | Bold     | 今日 Token（SidePanel）                      |
| `metricL`   | 28 / 32   | SemiBold | Edge Capsule 主数字（未来）                  |
| `metricM`   | 22 / 28   | SemiBold | Token 数字、次级指标（TokenTray、SidePanel） |
| `labelL`    | 16 / 24   | SemiBold | 品牌 "CODEX · {PLAN}"                        |
| `body`      | 14 / 20   | Regular  | 正文、loading 提示                           |
| `caption`   | 13 / 19   | Regular  | 来源、更新时间、辅助标签、倒计时             |
| `bar`       | 14 / 20   | Regular  | Indicator Bar 全部文字                       |

**用法**：`MetricValue` 和 `StatusLabel` 已封装 variant。其他文案直接读 `typography.caption.fontSize` 等。

**禁止 spread typography 对象到 style**（强制，二次踩坑）：

```tsx
// ❌ 禁止：lineHeight:19 是 number，React 当倍率 → 13×19=247px 行高，撑爆容器
<span style={{ ...typography.caption, color: "var(--c-ink)" }}>

// ✅ 正确：逐字段引用，lineHeight 加 px
<span style={{
  fontFamily: typography.caption.fontFamily,
  fontSize: `${typography.caption.fontSize}px`,
  lineHeight: `${typography.caption.lineHeight}px`,
  fontWeight: typography.caption.fontWeight,
  color: "var(--c-ink)",
}}>
```

理由：`tokens.ts` 的 `typography.*.lineHeight` 是 number（来自 design-tokens.json），React inline style 把无单位 lineHeight 当字号倍率。Stage 1 迁移时 spread 整个 typography 对象，导致 tray 数字行高 616px，撑爆整个 card。`MetricValue`/`StatusLabel` 内部已 px 化，直接用这两个封装组件最安全。

**规则**（visual-spec §1）：

- 可见文字 ≥ 13px
- 数字必须 `font-variant-numeric: tabular-nums lining-nums`（`body` 全局已设）
- 百分号字号 = 数字字号 48–54%，基线下沉 ≤ 行框 12%
- 禁止依赖字体默认 line-height，所有文本节点固定 line-height

## 7. Component Size

本项目当前只有 **IconButton** 一个有尺寸档的控件：

| Size   | 尺寸    | 圆角                   | 用途                   |
| ------ | ------- | ---------------------- | ---------------------- |
| `card` | 36 × 36 | `radius.button36` (18) | Card 标题栏右侧 3 按钮 |
| `bar`  | 30 × 30 | `radius.button30` (15) | Indicator Bar 操作按钮 |

未来扩展（AppInput/AppSelect/AppDialog 等）见 §16。本项目暂不需要。

## 8. Layout Rules

### 8.1 三个 Layout 原语

`renderer/src/components/layout/`：

- **`Stack`** —— 纵向 flex。`<Stack gap="2" align="center" justify="space-between">`
- **`Inline`** —— 横向 flex。`<Inline gap="1" align="center" wrap>`（默认不换行）
- **`Grid`** —— CSS Grid。`<Grid columns={3} gap="1_5">` 或 `<Grid columns="340px 20px 1px 20px 1fr">`

`gap` 必须是 `Spacing` key（类型强制），未传则不设 gap。`columns` 支持数字（→ `repeat(n, 1fr)`）或字符串（原样传入）。

### 8.2 Card 内部布局契约（visual-spec §5）

```
┌─ GlassSurface card, 560×388 (窗口 576×404, margin 8) ─┐
│  padding: 22px 24px 20px 24px                          │  ← surface 契约值，白名单
│  ┌──────────────────────────────────────────────────┐  │
│  │ CardHeader (height 36)                           │  │  ← Inline justify="space-between"
│  ├──────────────────────────────────────────────────┤  │
│  │ Main grid (height 214)                           │  │  ← Grid columns="340 20 1 20 1fr"
│  │  ┌──Hero──┐ gap ┃ divider ┃ gap ┌─SidePanel─┐    │  │     5 列含分隔线槽
│  │  └────────┘     ┃         ┃     └───────────┘    │  │
│  ├──────────────────────────────────────────────────┤  │
│  │ Inline: [TokenTray flex:1] [CardFooter]          │  │  ← gap="2"
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

主区 214px、CardHeader 36px、底部一行，三者纵向用 `Stack gap="1_5"`（12px，原 14px 归一）。横向上 padding 24px 对称。

### 8.3 解决对齐问题的正确顺序

发现对齐问题时，**不要加 `marginLeft` / `top` / `left` / `transform` 补偿**。按此顺序排查：

1. 父级 `display` 是否正确（`flex` / `grid`）
2. 父级 `alignItems` / `justifyContent`
3. 子元素的 `line-height`（数字与标签不同 baseline 多半是这个）
4. 子元素自身尺寸（`IconButton` 是否 36×36，数字 variant 是否一致）
5. `padding` / `box-sizing`（默认 `border-box`，全局已设）
6. 上一步都没问题，再考虑改 layout 结构（换成 grid 列对齐）

**反例**（历史代码 `TokenTray`）：`marginLeft: "14px"` 注释自承"圆点 6+gap 8=14 左偏移"。正确做法是用 grid 列把圆点放第一列，标签和数字都从第二列起笔。

## 9. Electron Desktop Rules

本项目是**固定尺寸浮窗**，不是普通 web app，也不是可缩放桌面应用。

| Surface               | 窗口尺寸   | 可见内容   | resizable |
| --------------------- | ---------- | ---------- | --------- |
| Card (Codex)          | 576 × 404  | 560 × 388  | false     |
| Card (ZCode)          | 576 × 333  | 560 × 317  | false     |
| Indicator Bar         | ≤ 600 × 40 | 与窗口一致 | false     |
| Collapsed Orb         | 84 × 120   | 72 × 108   | false     |
| Expanded Edge Capsule | 720 × 180  | 720 × 180  | false     |

- **所有窗口 `resizable: false`**，无 DPI 自适应逻辑，不读 `screen.width` 硬编码布局
- 阴影画到窗口边缘被自然裁切（WPF `BlurRadius=48` 行为），透明窗口 + `GlassSurface` 内部不加投影（用户反馈暗色背景下蓝色阴影太明显）
- 按钮、链接必须 `-webkit-app-region: no-drag`（`globals.css` 已全局设）
- `contextIsolation` + sandbox 必须开，IPC 只暴露窄接口（AGENTS.md §"Migration boundaries"）
- 透明窗口区域可拖动（`-webkit-app-region: drag` 在非交互背景上）

## 10. Window Resize Rules

本项目所有窗口 fixed size，**没有响应式断点**。但内部仍需用 `flex` / `grid` + `min-width: 0` 而非裸像素和：

- ❌ `width: 340 + 20 + 1 + 20 + 179 = 560px`（任一改动都炸）
- ✅ `Grid columns="340px 20px 1px 20px 1fr"`（`1fr` 自动吃剩余空间）

长文本（token 数字、品牌名）必须 `whiteSpace: "nowrap"` 或 `text-overflow: ellipsis`，避免撑破容器。中英文差异：品牌格式 `CODEX · {PLAN}` / `ZCODE · LOCAL` 固定，不手动插空格；Codex 套餐来自 `planType`。

## 11. Do / Don't

### Do

- ✅ `<Stack gap="1_5">` —— gap 走 token
- ✅ `typography.caption.fontSize` —— 字号走 variant
- ✅ `<Grid columns={3}>` —— 等分列用数字
- ✅ `radius.tray` —— surface 对应 radius
- ✅ 发现对齐问题先查父级 flex/grid + line-height

### Don't

- ❌ `gap: "14px"` —— 14 不在 spacing 档，凭空加 token 也禁止，归一到 12 或 16
- ❌ `marginLeft: "14px"` —— 视觉补偿值（TokenTray 历史反例）
- ❌ `borderRadius: "18px"` —— tray surface 必须用 `radius.tray` (22)
- ❌ `fontSize: "13px"` —— 用 `typography.caption.fontSize`
- ❌ 一次改 4 个 surface 同时开 dev 验证 —— 一次只动一个
- ❌ 顺手改视觉（"既然在动 padding 就把 gap 也调一下"）—— token 化与视觉调整分两个任务

### 装饰元素白名单

下列允许裸值（不属于 spacing/typography/radius token 范畴）：

- 图标尺寸（`<Clock size={13} />`）—— 跟随 lucide-react 约定
- ≤ 8px 的圆点 / 装饰几何（如 TokenTray 的 6×6 色点）
- SVG 内部几何（圆环描边宽度、刻度长度）—— 由 `ringGeometry` / `ringAngles` token 管，不进 spacing
- surface 内固定几何值（Card 主区列宽、surface 窗口尺寸）—— 见 §4 白名单

### 迁移日志（Stage 1，CodexCard + TokenTray）

记录 token 化过程中归一的原 magic number：

| 原值                                                   | 归一到                 | 理由                                         |
| ------------------------------------------------------ | ---------------------- | -------------------------------------------- |
| `gap: "14px"`（Card 主列纵向）                         | `Stack gap="1_5"` (12) | 14 无设计依据，归一到最近档                  |
| `padding: "22px 21px 20px 28px"`（loading/ZCode 分支） | `22px 24px 20px 24px`  | 修不对称 bug，左右对称                       |
| `borderRadius: "18px"`（TokenTray）                    | `radius.tray` (22)     | tray surface 必须用对应 radius，原 18 是写错 |
| `padding: "10px 16px"`（TokenTray）                    | `12px 16px`            | 纵向归一到 spacing.1_5                       |
| `marginLeft: "14px"`（TokenTray 数字）                 | 删除，改用 grid 列对齐 | 视觉补偿值，反例                             |

## 12. 新增 surface 规则

本项目"页面"= 4 个 surface（Card / Bar / Orb / Capsule）。新增任一前：

1. 确认 `design-tokens.json` 有对应 `size.*` 和 `radius.*`
2. 在 `tokens.ts` 加 `surfaceSizes.*` 镜像（同步改 `tokens.test.ts`）
3. 在 `electron/windows/` 加窗口定义（`resizable: false`，尺寸来自 `surfaceSizes`）
4. surface 根容器用 `GlassSurface`，不要自己拼玻璃材质
5. 内部布局用 `Stack` / `Inline` / `Grid`，padding 用 surface 契约值（§4 白名单）
6. 所有状态（Light/Dark、数据缺失、loading/offline）必须有 fixture 覆盖
7. 完成后按 §15 checklist 自检

## 13. 修改旧 surface 规则

改已有 component/ 下文件前，按 `AGENTS.md` §"DESIGN_SYSTEM 强制工作流"：

1. 读本文件 §8 / §11 / §14
2. 查 `tokens.ts` 是否已有对应 token
3. 查 `components/layout/` 能否解决布局
4. 查 `components/foundations/` 能否复用
5. 优先组合，最后才新建

**surface 内固定几何值白名单**（允许在 surface 文件顶部声明为命名常量，不进 `spacing` 表）：

- Card padding：22 / 24 / 20 / 24（visual-spec §2）
- Card 主区列宽：340px / 20px（gap）/ 1px（divider）/ 1fr
- Card 主区行高：214px、CardHeader 高 36px
- 各 surface 窗口尺寸：见 §9 表

这些值改前必须改 visual-spec.md + design-tokens.json，不能直接在代码里调。

## 14. AI Coding Rules（UI 修改强制 8 步）

任何 UI 修改必须按此顺序：

1. **读 `DESIGN_SYSTEM.md`**（本文件 §8/§11/§14）
2. **检查是否已有对应 Token**（`tokens.ts`）
3. **检查是否已有对应 UI Component**（`foundations/`）
4. **检查是否已有 Layout Component**（`layout/`）
5. **优先组合已有组件完成 UI**
6. **只有确认不存在可复用组件时，才允许创建新组件**
7. **新组件如果具有通用性，必须进入 `foundations/` 或 `layout/`，不留业务页面**
8. **完成后按 §15 checklist 自检**

违反任一步骤按 `AGENT_LESSONS.md` 反模式 A–H 处理。

## 15. UI Quality Checklist

每次 UI 改完必查：

### Alignment

- 同一行元素是否垂直居中（`Inline align="center"`）
- 左右 padding 是否对称（surface 契约值）
- 标签与数字是否共享 baseline（line-height 一致）
- 圆环几何中心是否对齐（`ringCenter` 算同一个 cx/cy）

### Spacing

- 是否全部用 `spacing` token 或 layout 原语 `gap`
- 是否存在裸 `margin` / `padding` 字符串（§11 白名单除外）

### Typography

- 字号是否来自 `typography.*` variant
- line-height 是否统一（不依赖默认）
- 数字是否 `tabular-nums lining-nums`

### Components

- 是否重复实现已有 foundations 组件
- surface 与 radius 是否对应

### Layout

- 是否用 `Grid columns="..."` 而非裸像素和
- 长文本是否 `nowrap` 或 `ellipsis`
- 品牌套餐是否来自 `planType`（如 `CODEX · PRO`）；未知时是否仅显示 `CODEX`

### Glass / Ring

- `GlassSurface` 4 层是否完整（base + blue + mint + violet + border + highlight）
- `ProgressRing` 6 层是否完整（OuterHalo/OuterBorder/Rail/Ticks/InnerDisc/ProgressArc）
- 0% 是否画起点珠不画弧；null 是否画虚线 rail 不画珠

### Code

- 是否新增 magic number
- 是否通过 `marginLeft`/`top`/`left`/`transform` 做 UI 微调
- 是否影响其他 surface（一次只改一个 surface）

## 16. 未来扩展附录

下列概念本项目暂不需要，未来业务页面接入时再补 token + 组件 + 本文件章节：

- **AppInput / AppSelect / AppCheckbox / AppSwitch / AppDialog / AppTabs / AppTooltip / AppToast** —— 无表单，无设置页
- **SidebarLayout / PageContainer / PageHeader / SettingsSection** —— 无多页路由，单窗口
- **响应式断点 / 流式布局** —— 所有窗口 fixed size
- **AppButton**（文字按钮）—— 当前只有 IconButton；文字按钮出现时按 shadcn `Button` + cva variants 扩展
