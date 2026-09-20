# PreviewCraft Desktop 开发计划（PLAN）

> 本文件是全部开发任务的唯一执行依据，由定时任务逐阶段消费。
> 配套约束见 [AGENTS.md](../AGENTS.md)（技术栈锁定、Skill 强制规则、提交规范）。

## 〇、给执行 Agent 的操作规程

1. 每次任务只做一个阶段（P0 → P5 顺序执行），开始前先读本文件对应章节与 AGENTS.md。
2. 实施中涉及 UI 组件：先用 `.agents/skills/heroui-react/scripts/` 查文档再动手；React 代码遵循 `.agents/skills/vercel-react-best-practices/`。
3. 阶段完成判据 = 本章「自验」全部通过 + `pnpm typecheck` + `pnpm lint` 零错误。
4. 完成后：更新本文件「进度追踪」勾选 + 「执行记录」追加一行（日期 / 阶段 / 结果 / 遗留问题），然后 git commit（Conventional Commits + 中文描述）。
5. 遇到方案级分歧或环境阻塞：写入「待确认」节后结束任务，不要擅自改变既定方案。
6. P0 之前的状态：仓库已清空（仅剩 `.git`、`LICENSE`、`AGENTS.md`、`docs/`、`.agents/`、`.gitignore`）。

## 一、产品与技术基线

**产品**：粘贴 URL → 4 设备（台式 / 笔记本 / 平板 / 手机）真实截图 → 套排版模板与背景 → 导出 PNG（默认）/ JPG / WebP，支持复制到剪贴板。

**功能需求清单**：

| 编号 | 需求 | 说明 |
| --- | --- | --- |
| F1 | 截图引擎 | puppeteer-core 控制本机 Chrome/Edge，按设备 preset 并行截图；完整等待策略（见 P1）；浏览器缺失时引导下载 Chromium |
| F2 | 模板系统 | 两层：设备组合 × 排版样式；5 套预设 + 自定义模板保存 |
| F3 | 样式定制 | 背景（渐变色板 + 自定义）、圆角、阴影、间距、设备位置/旋转 |
| F4 | 导出 | PNG/JPG/WebP，2x/3x 高分辨率，保存对话框 + 剪贴板 |
| F5 | 预览 | 预览态 iframe 实时渲染；导出态用真实截图，所见即所得 |
| F6 | URL | 一个主 URL 四端共用；可选分设备 URL 覆盖（留空回落主 URL） |
| F7 | 体验 | 明暗主题、快捷键（Ctrl+Enter 截图、Ctrl+S 导出）、设置持久化、错误 Toast |

**明确不做（本期）**：fullPage 截图、登录态截图、批量 URL、OG 尺寸预设、自动更新、系统托盘。列入文末 backlog。

**UI 图标**：HeroUI v3 不自带图标集（官方示例直接引第三方库），Button 也没有图标插槽 —— 图标就是 children 里塞一个 SVG 组件，`@heroui/styles` 的 `.button` 已给子 `svg` 定好尺寸（默认 `size-5`、`sm:size-4`、`size="sm"` 时 `size-4`，并带 `pointer-events-none shrink-0`），**所以图标一律不写 size/className 参数**。选型经用户定夺用 `lucide-react`，且只用具名 import（AGENTS.md 第三节禁裸 barrel）；实测 20 个图标使 renderer 产物 +26.18 kB（1,679.08 → 1,705.26），构建产物里只有 23 处 `createLucideIcon`、未用的图标 0 命中，tree-shake 有效。busy 态一律用 HeroUI 内置 `Spinner`，不用图标转圈。

## 二、数据定义（迁移自旧版，直接照抄）

### 设备 preset

| device | viewport (css px) | UA 特征 | isMobile | hasTouch | 机身宽 | 机身宽高比 | 内屏 inner（机身内偏移） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | 1440 × 950* | 桌面 Chrome UA | false | false | 620 | 620/478 | 600 × 396（10,10） |
| laptop | 1366 × 891* | 桌面 Chrome UA | false | false | 520 | 520/304 | 408 × 266（56,12） |
| tablet | 768 × 1020* | iPad UA | true | true | 300 | 300/396 | 280 × 372（10,12） |
| mobile | 390 × 840* | iPhone UA | true | true | 138 | 138/279 | 124 × 267（7,6） |

\* viewport 高度按「内屏宽高比」换算保证内容不变形：`height = round(width × innerH / innerW)`，实现时以此公式为准。
内屏 `inner` 是设备壳上的透明展示区，截图 `<img>` 与预览 `<iframe>` 都缩放铺到这里：`scale = innerW / viewportW`。
**数值以 `src/shared/devices.ts` 为准**；2.1.0 起设备壳改为纯 CSS 绘制（机身/支架/刘海等几何同样在该文件），旧版壳图 PNG 与 `git show 1.3.0:public/<device>.png` 的恢复路径已废弃、不再使用。
2.2.0 起 desktop 机身改窄边框 + 细支架（外接高 548 → 478，支架颈 84×86 → 56×42、底座宽 304 → 148），mobile 增 `shell.island`（灵动岛，画在内屏裁剪层内、坐标与机身同基准）；`inner` 与 viewport 四台全未改动，截图链路零影响。

### 排版模板 schema 与 5 套预设

```ts
type DeviceId = 'desktop' | 'laptop' | 'tablet' | 'mobile';
interface Placement { device: DeviceId; x: number; y: number; width: number; rotation?: number }
interface Template {
  id: string; name: string; subtitle: string;
  canvas: { width: number; height: number };   // 画布基准 1120 × 870（下述坐标基于此）
  placements: Placement[];
  background: string;                           // 背景板 key
}
```

```ts
export const presets: Template[] = [
  { id: 'classic', name: '经典全家福', subtitle: '四种屏幕，一个好故事', background: 'sunset-flare', placements: [
    { device: 'desktop', x: 220, y: 70, width: 660 }, { device: 'laptop', x: 110, y: 505, width: 470 },
    { device: 'tablet', x: 815, y: 300, width: 210 }, { device: 'mobile', x: 680, y: 498, width: 140 }] },
  { id: 'duo', name: '双屏聚焦', subtitle: '桌面与移动，恰到好处', background: 'grape-soda', placements: [
    { device: 'desktop', x: 155, y: 155, width: 700 }, { device: 'mobile', x: 785, y: 372, width: 170 }] },
  { id: 'row', name: '有序陈列', subtitle: '清晰展示每一种尺寸', background: 'glacier', placements: [
    { device: 'desktop', x: 92, y: 304, width: 340 }, { device: 'laptop', x: 454, y: 390.7, width: 300 },
    { device: 'tablet', x: 776, y: 394.5, width: 130 }, { device: 'mobile', x: 928, y: 368, width: 98 }] },
  { id: 'editorial', name: '灵感错落', subtitle: '轻盈旋转，更有表达', background: 'cotton-candy', placements: [
    { device: 'laptop', x: 132, y: 230, width: 580, rotation: -8 },
    { device: 'tablet', x: 764, y: 146, width: 225, rotation: 8 },
    { device: 'mobile', x: 642, y: 453, width: 145, rotation: -10 }] },
  { id: 'focus', name: '移动主角', subtitle: '为小屏幕留足舞台', background: 'obsidian', placements: [
    { device: 'tablet', x: 205, y: 111.6, width: 490 }, { device: 'mobile', x: 630, y: 162, width: 295 }] },
];
```

**构图口径（2.2.0 起固化，冒烟 A 段按同一组判据断言，改坐标即被校验）**：内容包围盒水平居中偏差 ≤10px、上下留白之差 ≤34px；左右留白 ≥88px（画布宽 8%）、上下 ≥60px；宽或高至少一轴占画布 ≥68%；`row` 四台底边同一地平线且相邻间隙等距；后景设备屏幕被前景压住的面积 ≤12%。

### 背景板

15 块分三组（`src/renderer/templates/backgrounds.ts`，2.2.0 重做）：

- **渐变 7**：落日熔金 `#ff9a3d→#f42c7a→#7b2ff7`、珊瑚气泡、葡萄汽水、冰川蓝、青柠气泡、玫红夜幕、棉花糖 —— 一律 `135deg` 三段，上叠一层 `radial-gradient` 左上高光。
- **纯色 5**：纯白 `#ffffff`、云灰 `#eef0f4`、淡靛 `#e2e7f4`、米砂 `#f4ece1`、透明。
- **深色 3**：曜石黑 `#1f1f28→#0b0b10`、深海、乌木紫。

每块带 `color` 代表色：样式页的背景板选择器用 HeroUI 内置 `ColorSwatchPicker`，它拿代表色的 hexa 当选中 key 并据此画描边，`value` 里的渐变只通过 `ColorSwatchPicker.Swatch` 的 `style` 透传显示。

### IPC 契约

```ts
// src/shared/types.ts
browserDetect(): Promise<{ found: BrowserInfo[]; active?: BrowserInfo }>          // BrowserInfo: { kind: 'chrome'|'edge'|'chromium'; path: string }
captureStart(input: { url: string; deviceUrls: Partial<Record<DeviceId, string>>; devices: DeviceId[] }): Promise<CaptureResult>   // 事件 capture:progress → { device, status: 'pending'|'done'|'error', path? , error? }
exportCompose(input: { template: Template; shots: Record<DeviceId, string>; scale: 1|2|3; format: 'png'|'jpg'|'webp'; quality?: number }): Promise<{ path: string }>
exportSave(input: { path: string }): Promise<{ saved: boolean }>                  // dialog.showSaveDialog
exportClipboard(input: { path: string }): Promise<void>
settingsGet(): Promise<AppSettings>; settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>
```

## 三、阶段任务

### P0 骨架与风险验证（0.5~1 天）

**目标**：全新 Electron + HeroUI 项目能跑，两个最大技术风险当场证伪。

1. `.npmrc`：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 与 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`（P5 打包依赖此镜像）；`pnpm init` 并安装 electron、electron-vite、electron-builder、React 19、TS、Tailwind v4、`@heroui/styles`、`@heroui/react`、`tailwind-variants`。
2. electron-vite 三层骨架（main / preload / renderer），主窗口 1280×800、标题 PreviewCraft、默认深色主题，渲染一个 HeroUI Button 验证样式链路。
3. 恢复设备壳图到 `resources/frames/`（命令见第二节）；renderer 能显示一张壳图。
4. 迁移数据定义：`src/renderer/templates/`（presets、backgrounds、device 几何）与 `src/shared/types.ts`。
5. **Spike A（导出风险）**：主进程临时脚本创建隐藏 `BrowserWindow({ show: false })`，加载数据 URL 彩色页面，`webContents.capturePage()` 存临时 PNG；若空图则改「窗口移到屏幕外坐标 + show: true」再验。结论写入「执行记录」。
6. **Spike B（截图风险）**：主进程临时脚本用 puppeteer-core 连 `C:\Program Files\Google\Chrome\Application\chrome.exe` headless 截 `https://example.com`。结论写入「执行记录」。

**产出**：可运行空壳 + resources/frames + 模板数据 + 两个 spike 结论。
**自验**：`pnpm dev` 出窗口且 HeroUI 按钮样式正确；两个 spike 均产出非空 PNG；typecheck/lint 通过。

### P1 截图引擎（1~1.5 天）

**目标**：`src/main/browser.ts` + `src/main/capture.ts`，任何站点都能按设备出图。

1. `browser.ts`：注册表（`reg query HKLM\...\Microsoft\Windows\CurrentVersion\App Paths`）+ 常见路径枚举检测 Chrome/Edge/Chromium，返回列表；一个都找不到时用 @puppeteer/browsers 把 Chromium 装到 `app.getPath('userData')/chromium`（带下载进度事件）。
2. `capture.ts`（等待策略直译旧版 route.ts，这是旧版最有价值的代码）：
   - 每 device 开独立 page：`setViewport({ width, height, deviceScaleFactor: 2 })` + `setUserAgent` + `isMobile/hasTouch`；
   - `goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })` → `document.fonts.ready` → 等待所有 iframe load + 2s → 等 `document.images` 全部 complete → 注入冻结动画 CSS（`* { animation: none !important; transition: none !important }`）→ `requestAnimationFrame` 稳一帧 → 全视口 `screenshot()`；
   - 4 设备并行（`Promise.all`），每台完成即发 `capture:progress` 事件；单台失败不拖垮其他台（`allSettled` 语义）；
   - 截图落盘 `app.getPath('temp')/preview-craft/<uuid>.png`，路径回传 renderer；
   - 浏览器实例复用：连续截图不重复 launch，应用退出时关闭。
3. IPC + preload bridge 按第二节契约实现；`settings:set` 支持「自定义浏览器路径」覆盖自动检测。

**产出**：完整截图服务。**自验**：DevTools console 调 `window.api.captureStart` 对 `https://github.com` 与任一国内站点出 4 张 2x PNG，尺寸与 preset 一致、无动画残影；`capture:progress` 事件顺序正确。

### P2 前端主体（1.5~2 天）

**目标**：三栏单屏布局——顶栏 URL 区 / 中央画布预览 / 右侧样式区雏形；HeroUI 组件优先。

1. 布局骨架：HeroUI 组件拼装（顶栏 `Input` + `Button`；主题切换 `Switch`/`Button`；右栏留位 `Card`）。
2. `UrlBar`：主 URL 输入（回车即刷新预览）+ 「分设备 URL」折叠区（HeroUI `Accordion` 或 `Popover`，4 个可选输入，placeholder 提示「留空使用主地址」）。
3. `DeviceFrame`：壳 PNG 背景 + inner 区绝对定位 + `transform: scale(innerW/viewportW)`，预览态渲染 iframe（`scrolling="no"`、pointer-events 关闭交互）；几何数据来自 templates 模块。
4. `Canvas`：按模板 placements 绝对定位摆放 DeviceFrame（本阶段先接 classic）；画布外按 `background` 渐变铺底。
5. 明暗主题：HeroUI v3 theming（`.dark` + `data-theme`），选择持久化到 electron-store。
6. 状态管理：React 内置（`useState`/`useReducer` + context），不引入额外状态库；URL 校验逻辑（normalizeUrl，http/https only、拒绝 userinfo）放 `src/shared/`。

**产出**：可交互预览主界面。**自验**：粘贴 URL 回车，四设备 iframe 实时显示；给某设备填独立 URL 后仅该设备变化；主题切换即时生效且重启保留。

### P3 模板系统（2~3 天）

**目标**：模板即数据，切换零成本；用户可存自己的排版。

1. `TemplateGallery`：左/右侧栏缩略图网格（HeroUI `Card` + 选中态），缩略图用真实 Canvas 按 1/4 比例静态渲染（无 iframe，占位色块即可），切换模板立即重排画布。
2. `StylePanel`（HeroUI `Slider` / `Select` / `Switch` / `Tooltip`）：背景板选择 + 自定义渐变色、画布圆角、设备阴影开关、整体缩放、每台设备 x/y/宽度/旋转数值微调。
3. 自定义模板：基于当前画布「另存为模板」（命名 + HeroUI `Modal`），存 electron-store（key 带版本 `templates:v1`，遵循 localStorage 版本化规则）；支持删除与恢复预设。
4. 排版微调的持久粒度：仅作用于当前会话除非另存为模板（避免预设被静默污染）。

**产出**：完整模板与样式系统。**自验**：5 套预设切换即时生效；修改背景/阴影/位置即时可见；另存模板后重启仍在；editorial 的 rotation 正确渲染。

### P4 导出闭环（1.5~2 天）

**目标**：从预览到成品图一条龙，预览 = 导出。

1. 导出流程：点击导出（或 Ctrl+S）→ 逐设备调 `captureStart`（进度条用 HeroUI `Progress`，文案「正在截取手机画面…」）→ 完成后 Canvas 内屏切换为真实截图 `<img>`（object-fit: cover，`scale` 同预览）。
2. `export.ts`：隐藏 BrowserWindow 加载导出专用路由（复用同一 `Canvas` 组件，截图以 dataURL 注入，无交互元素）；窗口尺寸 = canvas × scale（2x 默认 / 3x 可选）；`capturePage()` → `nativeImage`；Spike A 结论决定 show:false 还是屏幕外坐标。
3. 格式：PNG（`toPNG`）/ JPG（`toJPEG(quality)`，默认 90）/ WebP（导出窗口内 `OffscreenCanvas.convertToBlob({ type: 'image/webp', quality })`）；格式与倍率选择存设置。
4. 出口：`dialog.showSaveDialog`（默认文件名 `<host>-<template>-2x.png`）+ `clipboard.writeImage`（导出成功 Toast）。
5. 失败路径：单设备截图失败时该设备显示重试占位（HeroUI 风格），可单台重试不必全量重截。

**产出**：导出功能完整。**自验**：GitHub + 任一国内站导出 2x PNG/JPG/WebP 三种格式均清晰、字体无缺失、与预览排版一致；剪贴板粘贴到微信/画图有效；3x 导出文件尺寸合理。

### P5 打磨与分发（1~2 天）

**目标**：能安装、能容错、可发布。

1. 错误与边界：无浏览器时的引导 `Modal`（说明 + 一键下载 Chromium + 进度）；截图超时/站点不可达的错误 Toast 与重试；URL 非法输入校验提示。
2. 设置页（HeroUI `Tabs` 或 `Modal`）：浏览器路径覆盖、默认模板/背景/格式/倍率、清除缓存（temp 截图清理）。
3. 快捷键：Ctrl+Enter 截图、Ctrl+S 导出、Ctrl+V 到 URL 输入；`localShortcut` 或主进程 globalShortcut（仅窗口聚焦时用 renderer 监听即可，不抢全局）。
4. 应用图标（`resources/icon.*`，可用旧 logo.svg 转 ico/icns）+ electron-builder NSIS 配置（中文安装界面、桌面快捷方式、`appId`、产品名 PreviewCraft）。
5. README.md 重写（产品介绍 + 截图 + 开发/构建说明）；清理 P0 的 spike 临时脚本。
6. 打包自验 + 安装实测。

**产出**：v2.0.0 安装包。**自验**：`pnpm typecheck`、`pnpm lint`、`pnpm build` 全过；`release/` 出 NSIS 安装包；安装后全流程（输入 URL → 截图 → 换模板 → 导出 2x PNG）可用；卸载残留干净。

## 四、进度追踪

- [x] P0 骨架与风险验证
- [x] P1 截图引擎
- [x] P2 前端主体
- [x] P3 模板系统
- [x] P4 导出闭环
- [x] P5 打磨与分发（2026-09-19 完成：打包 / 安装 / 全流程 / 卸载实测通过；「保存对话框落盘 + NSIS 中文安装界面」目视与「卸载是否清数据」口径均已由用户确认关闭）
- [x] 回归冒烟基线（2026-09-20：`scripts/smoke.mjs` 常驻，源码态 **122/122 PASS、零 SKIP**；超时自动转储现场、窗口停帧即判红、网络探测不通的分支走 `skip()` 不再虚报 PASS，详见「五、执行记录」。**跑前必须 `pnpm build`**：`smoke` 脚本不含构建，仓库里的 `out/` 一旦落后于源码就会打出一串假 FAIL（2026-09-20 踩到：2.0.0 时代的 `out/` 缺 2.1.x 全部功能，10 条红）。安装版 `--exe` 模式的靶子是 `release/win-unpacked/`，随 `release/` 清理会不在盘上、需重跑 `pnpm dist` 才有（2026-09-20 出 2.1.4 包后已恢复，安装版同轮跑 **122/122 PASS**）
- [x] 反馈迭代 2.1.0 ~ 2.1.3（线上发布版曾为 2.1.3：装机反馈 4 项修复 + 预览拦截占位 + 检查更新「关于」页 + Chromium 下载二次确认 + 图标重设计为白底黑标并补 alpha；tag `2.1.3` 与 GitHub Release 已发、安装包已核验字节数与 SHA256 与本地一致、已静默装到本机）
- [x] 缺陷收口 2.1.4（**当前发布版 2.1.4**，2026-09-20：渲染→主进程边界收紧、截图引擎不再被一次启动失败锁死、换地址清掉对应设备旧截图、截图任务互斥 + 删死文件。四道门全过：出包 ✅ / 推 origin ✅ / tag + Release ✅ / 装机复验 ✅ —— 安装包匿名核验 116,566,272 字节与本地一致、Range 请求 206 且首两字节 `MZ`）
- [x] 视觉迭代 2.2.0（2026-09-20 用户看图签字通过：背景板 7 → 15 块重做、五套预设按构图口径重排、阴影按显示宽分级、desktop 壳去粗支架 + mobile 灵动岛 + 机身轮廓光、缩略图对齐真机、背景板选择器换 HeroUI 内置 `ColorSwatchPicker`；同日续做 **28 处按钮补图标（lucide-react）** 与两处收口（缩略图贴边、圆角默认 12 连带 JPG 垫白）。门禁 typecheck / lint / build 零错误，冒烟 **133 条**（新增 10 条：构图光学判据 ×3、壳体几何 ×3、色板代表色 ×2、内置选择器交互、圆角 JPG 垫白 ×1）。**版本已升 2.2.0；代码按 feat / test / docs / chore 四个 commit 落库，出包 / 推 origin / tag+Release / 装机四道门均待放行**）
- [ ] 下一步：Backlog 择机（长截图 / 登录态截图 / 批量队列 / OG 预设 / 托盘 / 导出历史），以及 16px 图标简化版与 Chromium 真取消（0.5~1 天）——用户 2026-09-20 定：功能清单先记在 §7，有空再做；§7「已报出、待排期」五项技术债同候

## 五、执行记录

| 日期 | 阶段 | 结果 | 遗留问题 |
| --- | --- | --- | --- |
| 2026-09-17 | 前置 | 旧代码清理完成（保留 .git/LICENSE）；Skill 与本计划落库；`desktop/` 目录被进程占用仅剩空壳，内容已清空 | 关闭占用进程后手动删除空目录 |
| 2026-09-18 | 基线 | 提交 be7ac7c：清理旧 Web 版 + AGENTS/PLAN/Skill 落库 | — |
| 2026-09-18 | P0 | 完成。骨架可运行（Electron 44 / electron-vite 5 / vite 8 / React 19 / HeroUI 3.2 / Tailwind 4.3 / TS 6.0），HeroUI 按钮 + 暗色主题 + 壳图显示已验证（截图核验）；**Spike A**：show:false 的 capturePage 产出 92,696 字节真实渐变 PNG → **P4 采用 show:false 方案**（offscreen:true 模式 74,526 字节可用作备选；「屏幕外坐标 + show:true」失败报 Current display surface not available，弃用）；**Spike B**：puppeteer-core 控本机 Chrome headless 截 example.com 产出 39,910 字节 2x PNG → 截图引擎路线可行；typecheck/lint 零错误 | ① 本会话环境 GPU 进程不可用，dev 启动即崩 → main 已按 `!app.isPackaged` 条件加 `no-sandbox`/`disable-gpu` 开关，打包版默认路径待 P5 实测；② pnpm 信任策略拦截 semver@6.3.1/5.7.2 → pnpm-workspace.yaml `trustPolicyExclude`；electron/esbuild 构建脚本经 `allowBuilds` 放行；③ TypeScript 锁 6.0.3（typescript-eslint 8.70 不支持 TS7）；④ 壳图恢复命令的 tag 实为 `1.3.0`（无 v 前缀），本计划中 `v1.3.0` 写法需留意；⑤ 内屏偏移取自旧版 enums（desktop 11/11、laptop 56/10、tablet 10/12、mobile 7/6），已固化进 devices.ts |
| 2026-09-18 | P1 | 完成。browser.ts（常见路径枚举优先 + 注册表兜底 + Chromium 下载到 userData/chromium）与 capture.ts（2x 视口/UA/isMobile/hasTouch、字体→iframe+2s→图片→冻结动画→双 rAF 完整等待策略、4 设备并行、allSettled 语义、temp 落盘、浏览器实例复用）+ IPC/preload 全契约实现 + electron-store 设置持久化。自验：github.com 与 bilibili.com 均 4 设备出图，desktop 2880×1900 / mobile 780×1680 与 preset 精确一致，capture:progress 事件顺序正确 | ① 会话安全策略拉黑 reg.exe → 检测顺序调整为常见路径优先、注册表仅在路径枚举有遗漏 kind 时兜底（功能不缺失）；② @puppeteer/browsers v3 install 已移除 progressCallback → 下载进度事件仅上报起止（0%/100%），P5 引导 UI 需知悉；③ 自验钩子 PC_CAPTURE_TEST 环境变量与 scripts/ 临时脚本（spike-a/b、p0-shot、png-size）留待 P5 清理 |
| 2026-09-18 | P2 | 完成。三栏布局（顶栏 URL 区 / 中央画布 / 右侧留位）；UrlBar（回车刷新 + 分设备 URL Accordion + normalizeUrl 校验）；DeviceFrame（壳图 + inner 绝对定位 + viewport 缩放，几何全部由 devices.ts 驱动）；Canvas（classic 模板 + 背景板 + ResizeObserver 自适应缩放）；明暗主题（.dark + data-theme，持久化 electron-store）；React 内置状态管理。应用底色按用户要求统一为 bg-background text-foreground。自验（无头 Chrome 交互驱动）：主 URL 回车 → 4 设备 iframe 实时加载；主题切换即时生效；分设备 URL 仅该设备变化 | ① github.com 等带 X-Frame-Options/CSP frame-ancestors 的站点无法进预览 iframe（ERR_BLOCKED_BY_RESPONSE），属站点限制——P4 导出走真实截图不受影响，预览态此限制接受；② vite 长驻 dev server 的 HMR 对外部编辑器改动可能失效（本次排查中踩到 stale module），验证前需重启 dev；③ 主题持久化依赖 preload 桥，浏览器直开页面时安全降级（window.api? 可选链） |
| 2026-09-18 | P3 | 完成。TemplateGallery（预设 5 + 自定义，ThumbCanvas 按 0.22 静态渲染占位色块，选中态 ring）；StylePanel（背景板色板 + ColorField 自定义渐变 custom: 前缀存入 template.background、圆角/整体缩放 Slider、阴影 Switch、每设备 X/Y/宽/旋转 Slider）；自定义模板 electron-store `templates:v1` CRUD（templates:save/get/delete IPC）；另存为模板 Modal；微调仅会话生效 + 还原预设按钮；dev server 固定端口 5188（strictPort，用户要求避开 5173）。自验（无头 Chrome 交互驱动）：5 预设缩略图渲染；切换「灵感错落」rotation 正确渲染；Slider 键盘微调圆角 0→5px 实时生效；另存模板后画廊出现自定义项；删除后消失 | ① HeroUI Card/ToggleButtonGroup 的 pressable API 未查证，画廊项与设备 chips 用手写 div（符合「HeroUI 没有才手写」的边界判断，视觉语言一致）；② 圆角/阴影/缩放为会话样式，不随模板持久化（PLAN 3.4 的执行口径） |
| 2026-09-18 | P4 | 完成。export.ts（隐藏 BrowserWindow + offscreen 渲染 + CDP `Emulation.setVisibleSize` 扩视口 → capturePage 全帧 → PNG/JPG/WebP，WebP 走导出窗口 OffscreenCanvas）+ export:compose/save/clipboard IPC + preload 4 个导出通道 + ExportPage（hash 路由 #/export，载荷渲染→图片解码完成→export:ready）+ ExportPanel（格式/倍率 Select + 进度）+ App.tsx 编排（截图→合成→保存对话框→剪贴板→Toast，单设备重试）。自验（真实应用 CDP 驱动 16/16 PASS）：GitHub 与 bilibili 各 4 台截图成功；2x PNG/JPG/WebP 均为 2240×1740、3x PNG 3360×2610（尺寸/魔数断言通过，3x 1.2MB 合理）；剪贴板 ContainsImage=True；UI 点击导出→进度条→temp 产物全链路通过；typecheck/lint/build 三绿。关键修复：① 导出窗口补挂 preload（缺失会导致 export:ready 永不回传）；② Electron 44 移除 clipboard.writeImage → ClipboardItem W3C API；③ 隐藏窗口被 OS 钳制在工作区（2x/3x 被裁成 1920×1032）→ 窗口按 1x 创建 + setVisibleSize 扩布局视口解决；④ capturePage 偶发 UnknownVizError → 3 次重试自愈 | ① 保存对话框为原生 UI 未自动化，安装实测时人工确认；② 验证依赖 PC_REMOTE_DEBUGGING_PORT 环境变量钩子（P5 随 PC_CAPTURE_TEST 一并移除）；③ scripts/ 临时脚本（含 p4-verify.mjs 与 P0~P3 旧脚本）待 P5 清理；④ P3 追踪项勾选补记于本提交 |
| 2026-09-18 | P5（**部分完成，中断待续**） | **已落地并通过自验（第 1~5 项）**：① 错误与边界 —— BrowserGuideModal（说明 + 一键下载 Chromium + 真实下载进度）、describeCaptureError 中文归因（超时/DNS/连接中断/证书/浏览器启动失败…，未归类 net::ERR_* 保留错误码）、失败设备清掉上一轮旧截图以露出画布内「重试」占位（原缺陷：过期画面遮住重试入口）、URL 校验补拒绝含空白串；② 设置页 SettingsModal（Tabs：浏览器 / 默认值 / 缓存）+ 新增 IPC `cache:stats`、`cache:clear`、`dialog:pick-browser`、`clipboard:read-text`（capture.ts 导出 shotCacheDir/cacheStats/cacheClear，export.ts 复用）；③ 快捷键 useShortcuts（Ctrl+Enter 截图 / Ctrl+S 导出 / Ctrl+V 由主进程代读剪贴板，焦点在输入区时让位原生粘贴、Ctrl+Shift+V 不拦截）+ 截图与导出拆分为 captureShots 复用 + 顶栏「截图」「设置」入口；④ 图标 resources/icon.svg/png/ico（旧 1.3.0 logo.svg 加暮色紫圆角底，本机 Chrome 光栅化 16~512px + PNG-in-ICO 打包）+ electron-builder.yml（NSIS 中文 zh_CN/LCID 2052、桌面与开始菜单快捷方式、appId com.previewcraft.desktop、productName PreviewCraft、artifactName PreviewCraft-Setup-版本.exe、npmRebuild:false）+ package.json 脚本 `dist` / `dist:dir` + main 进程 setAppUserModelId；⑤ README.md 重写完成（产品介绍/功能表/快捷键/安装/架构与 IPC 表/已知限制），两张配图见下文。**自验**：typecheck/lint 零错误、electron-vite build 通过；真实应用 CDP 驱动最近一次完整跑 **22/24 PASS**（URL 校验、Ctrl+Enter 截图 4 台、换模板、不可达站点错误 Toast「连接被中断，站点可能不可达」+ 单台重试、设置三 Tab、格式持久化、清除缓存 before=4/removed=4/after=0、Ctrl+V 归一化、浏览器路径缺失报错全绿；两条 FAIL 均为脚本口径：App 内 format 状态未随 IPC 直写同步导致导出成 .jpg、原生保存对话框 Esc 关闭后剪贴板未写入）。**第 6 项清理**：PC_CAPTURE_TEST / runCaptureSelfTest / PC_REMOTE_DEBUGGING_PORT 三个钩子已删（改用 CLI `--remote-debugging-port` 驱动，验证可行）；`scripts/` 全部临时脚本（spike-a/b、p0-shot、p2-verify、p2-debug、p3-verify、png-size、extract-docs、p4-verify、p5-verify 与产物目录）与 .gitignore 的 `scripts/p4-out/` 条目已删除。README 两张配图已落库（`docs/images/app-main.png`、`docs/images/export-sample.jpg`，后者是导出链路真实产物）。**第 7 项打包与安装实测未开始** | 见「六、待确认」P5 待续条目
| 2026-09-19 | P5（**完成**） | **第 7 项打包与安装实测通过**：① BrowserGuideModal 目视验证 —— 临时无条件 `setGuideOpen(true)` → build → CDP 截图核验（标题 / 三条说明 / 稍后再说·指定路径·下载 Chromium 三按钮 / 暗色主题遮罩均正确）→ 还原后 `git diff` 干净；② 打包 —— `resources/icon.ico` 为 PNG-in-ICO 封装被 electron-builder 判非法（其解析器只认 BMP 帧），`win.icon` 改指 `resources/icon.png`（512×512）由构建期转 ICO，icon.ico 删除；`pnpm dist` 时 electron-builder **不读 .npmrc**，首次需显式 export `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR`（否则 NSIS 资源下载超时 600s 失败，已写进 README）；产出 `release/PreviewCraft-Setup-2.0.0.exe`（111MB）；③ 安装实测 —— `/S` 静默安装到 `%LOCALAPPDATA%\Programs\PreviewCraft`，安装目录 / 桌面与开始菜单快捷方式 / HKCU 注册表卸载项全部就位；CDP 驱动安装版全流程：启动无崩溃（**P0 遗留的打包版 GPU/沙箱疑虑解除**）→ github.com 四端 iframe 预览 → 截图 4 张（2880/2732/1536/780 与 preset 2x 精确一致）→ 切「双屏聚焦」→ 导出（重新截图 + 合成临时文件 + 保存对话框步骤 + **剪贴板 ContainsImage=True**）；④ 卸载验证 —— `/S` 卸载后安装目录 / 快捷方式 / 注册表项全清；userData **实际为 `%APPDATA%\preview-craft`**（Electron 取 package.json name 而非 productName，已修正 yml 注释）按 `deleteAppDataOnUninstall: false` 保留，settings.json 内容原样；⑤ 保存对话框无法在本自动化环境弹出/驱动（裸 Electron 独立脚本 showSaveDialog 同样挂起 → **会话环境限制，非应用缺陷**；导出链路其余环节均已自动化验证），「对话框落盘确认」与「NSIS 中文安装界面目视」交人工，见「六、待确认」。typecheck / lint 零错误 | 剩余人工确认两项 + 卸载数据口径一项，见「六、待确认」
| 2026-09-19 | 反馈修复（v2.1.0） | **安装实测后用户反馈 6+2 项全部修复**：① 单实例锁 `requestSingleInstanceLock`，重复启动聚焦已有窗口（实测第二实例即刻退出）；② 设备壳弃用 PNG 改**纯 CSS 绘制**（几何数据化进 `shared/devices.ts`，DeviceShell 组件渲染机身/支架/底座/刘海/摄像头，内屏内容统一进 overflow-hidden 裁剪层）——圆角精确贴合解决「笔记本/手机圆角漏底色」，2x/3x 导出锐利且不再嵌图，4 张壳图与 `@frames` 别名删除；③ 新增「透明」背景板：预览铺棋盘格，导出窗口 `transparent:true` + 页面透明，**PNG 保留 alpha**（实测 colorType 6、四角 alpha=0、设备区不透明），JPG 自动垫白（`flattenWhite` 载荷）；④ 截图/导出任务遮罩上移覆盖画布 + 右侧面板，交互全锁定，顶栏「刷新预览/截图/设置」随任务禁用；⑤ 模板画廊改单列（缩略图 0.3）；分设备 URL 区收进卡片容器；侧栏页签改分段器样式；⑥ 模板修正：经典全家福左移 35px 居中（包围盒 65~1055）、有序陈列左移 40px 手机完整入画（原溢出画布 15px）。**自验**：typecheck/lint/build 三绿；CDP 驱动 9 项断言全过（含透明 PNG alpha 逐像素解析、单实例、遮罩存在性）；JPG 环节教训：React Aria Select 需真实指针事件，`element.click()` 打不开下拉 → 换 `page.mouse.click` 坐标点击后经 UI 切格式成功导出 JPEG（magic ffd8）。版本 2.1.0，四个提交（1c109dc / b075ec5 / 54d7236 / 1dfb7ae） | 无遗留；人工确认项同上不变
| 2026-09-19 | 样式微调（v2.1.0 续） | 用户手工调整入库（页签全默认、导出/样式面板按钮并排、说明文字改 Description，a56f96b）；渐变起止色 ColorField 增加实时 ColorSwatch 色板前缀（a2de5dc，官方 Prefix 复合写法，CDP 截图核验）；侧栏页签先加分段器后按用户要求还原默认（2702570）。**版本更新提示功能确认本期不做**，轻量 / 完整两档方案记入「七、Backlog」待后续选型。typecheck / lint / build 三绿，安装包重新产出（02:18） | —
| 2026-09-19 | 卸载口径定夺（v2.1.1） | 用户定夺「**卸载即清空**」：`deleteAppDataOnUninstall` 改 `true`，卸载时连同 `%APPDATA%\preview-craft`（设置、自定义模板、缓存）一并删除；曾考虑卸载时弹窗由用户选择（`customUnInstall` 自定义 NSIS 宏方案，已验证模板钩子存在），按「不用搞那么复杂」取消，脚本未入库。版本升 2.1.1 并重出安装包 | 明日视情况调整；注意 2.1.1 起卸载即清数据，覆盖安装不受影响
| 2026-09-19 | 回归冒烟基线（**98/98 PASS**） | 各阶段自验脚本在 P5 按约定清理后仓库无可重跑回归，本次建为**常驻资产** `scripts/smoke.mjs`（配 `pnpm smoke` / `pnpm verify`）。**A 段 35 条纯逻辑**（Node 直跑 src 下 TS，零新依赖）：normalizeUrl 六类拒绝、viewport 高度按内屏比例换算公式、4 台 2x 尺寸表、UA/isMobile/hasTouch、内屏落在机身内、5 套预设 id 唯一 + **旋转外接盒越界检查**、背景 `custom:` / 透明 / 未知 key 解析、cloneTemplate 深拷贝与 isTemplateModified、错误归因 9 类、formatBytes。**B 段 63 条真实应用 CDP**（起 `out/` + `--user-data-dir=.smoke-profile` 隔离）：bridge 22 方法齐备、全新档案默认设置、浏览器检测命中本机 Chrome/Edge、非法 URL 中文提示、4 台预览 iframe、分设备覆盖与回落、captureStart 4/4 且逐台尺寸断言（2880×1900 / 2732×1782 / 1536×2040 / 780×1680）、capture:progress 4 pending 先行 + 4 done 收尾、shotDataUrl、导出 PNG/JPG/WebP × 1x/2x/3x（2240×1740 / 1120×870 / 3360×2610，魔数 + 页内解码尺寸）、**透明底 PNG colorType=6 且四角 alpha=0**、透明底 JPG 垫白、样式化导出（圆角/无阴影/zoom）、部分设备缺图仍可合成、剪贴板 ContainsImage=True、Ctrl+Enter 截图后 iframe 全换 img、模板切换 / 旋转 / ring 选中态、圆角 Slider 即时生效、另存与删除自定义模板 + 画廊空态回归、设置三页签与「关闭」按钮、主题双向切换并落库、格式/倍率持久化、不可达站点中文归因 + 4 台重试占位 + 单台重试、**改地址后失败占位让位给新预览**、UI 导出产出 temp 文件与进度遮罩、单实例锁拦截、**未污染用户真实设置（settings.json 哈希不变）**、cacheStats/cacheClear、无未捕获异常。导出产物与日志留在 `.smoke-out/`。**发现并修复应用缺陷 1 项**：截图失败后改地址，画布仍残留「重试」占位、预览回不来（实测 iframe=0、重试=4）→ `App.tsx` handleApply 改为仅在地址真变化时清 `shotErrors`（UrlBar 失焦会以同值二次提交，无条件清会抹掉重试入口）。工具链：`package.json` 加 `smoke` / `verify`，`.gitignore` 与 eslint ignores 同步补 `.smoke-out` / `.smoke-profile`。typecheck / lint 零错误 | ① 纯逻辑断言内嵌在冒烟脚本，未起 vitest（测试框架属依赖变更，见「六、待确认」6）；② 原生保存对话框仍不可自动化（P5 已判定为会话环境限制），UI 导出断言止于「temp 产物 + 进度遮罩」；③ 冒烟跑的是未打包 `out/`（dev 分支带 no-sandbox/disable-gpu），NSIS 安装版内的端到端未覆盖，需要时可加 `--dist` 模式指向 `release/win-unpacked`；④ 首轮 18 条 FAIL 全为脚本口径，教训已写进脚本注释：React Aria 组件需真实指针事件、HeroUI Slider 可聚焦控件是 `input[type=range]`（焦点留在页签上按方向键会切页签）、应用 CSP `connect-src` 不含 `data:`（页内解码图片用 `Image` 不用 `fetch`）、受控 Input 清空用 focus+Ctrl+A+Backspace（三击选中不可靠）
| 2026-09-19 | 发布收尾（v2.1.2） | 冒烟基线抓到的缺陷随补丁版出包：版本升 **2.1.2**，`pnpm dist`（需显式 export 两个镜像变量，electron-builder 不读 `.npmrc`）产出 `release/PreviewCraft-Setup-2.1.2.exe`。**发现打包卫生缺陷 1 项**：首次出包 124,728,233 字节，比 2.1.1（116,618,585）大 8.1MB —— 根因是 `electron-builder.yml` 的 `files` 采用逐项排除式白名单，漏了新加的 `.smoke-out/`（7.8MB 导出图）与 `.smoke-profile/`（8.4MB 隔离档案），被 asar 一起打进安装包；补两条 `!` 排除后重出为 **116,618,521 字节**（与 2.1.1 差 64 字节，即版本串长度）。补打 2.x 线首个 annotated tag `2.1.2` 并推 origin（此前仓库只有废弃 Web 版 1.0.0~1.3.0）。**vitest 定夺：不引入**，纯逻辑断言继续内嵌冒烟 A 段（见「六、待确认」6）。typecheck / lint / build / smoke 四绿 | ① GitHub Release 是否挂载安装包待定（本机无 `gh` CLI，需网页手动上传或先装）；② `release/` 内 2.0.0 / 2.1.0 / 2.1.1 三个旧包（约 333MB）是否清理由用户定夺；③ 安装实测本轮未重跑（改动仅一个 renderer 修复 + 打包排除项），如需可 `/S` 静默装 2.1.2 覆盖安装 |
| 2026-09-19 | 冒烟补打包版路径（`--exe` 模式） | `scripts/smoke.mjs` 加 `--exe=<path>`，直接打 `release/win-unpacked/PreviewCraft.exe`（`app.isPackaged=true`、不吃 dev 的 `no-sandbox/disable-gpu`、渲染走 asar），B 段 **63/63 PASS**；未打包路径回归 **98/98 PASS**。**关闭上一条遗留 ③**（NSIS 产物内端到端未覆盖）。首跑打包版曾连锁 FAIL 11 条，探针取证（保存模板后 300ms 弹窗即关、Esc 可关、页签切换正常）判定为**脚本节奏问题而非应用缺陷**：打包版整体比 `out/` 慢（截图 37.7s vs 21.7s），固定 sleep 让点击落在页签/弹窗的中间态上。据此把 UI 步骤从「等时间」改成「等条件」——页签 `aria-selected`、`.modal__dialog` 高度归零、画廊文本出现、缓存统计出数、`documentElement` 主题类；顺带确认 `--user-data-dir` 对打包版同样生效（隔离档案 + 用户 `%APPDATA%` 哈希不变）、单实例锁在打包版同样拦截 | 遗留 ①（vitest）已按定夺关闭；仍存的只有 ②原生保存对话框不可自动化 与 ③NSIS 安装/卸载落位（快捷方式、注册表、卸载清 userData）——后者需真机装卸，交用户执行或授权后跑 |
| 2026-09-19 | 2.1.2 装机实测（**通过**） | 静默安装 `PreviewCraft-Setup-2.1.2.exe /S`（8s）→ 落位全绿：`%LOCALAPPDATA%\Programs\PreviewCraft\PreviewCraft.exe`、`Uninstall PreviewCraft.exe`、桌面与开始菜单快捷方式、控制面板卸载项 `DisplayName=PreviewCraft 2.1.2 / DisplayVersion=2.1.2`（键名是 electron-builder 由 appId 派生的 GUID `4cf14dc5-967c-5ee7-a7ac-46708ad0d920`，**不是** `com.previewcraft.desktop`——首次按 appId 查所以误报 NOT FOUND）、安装目录 421MB。**安装版内跑全量冒烟 `--exe` 模式 63/63 PASS**（截图 4/4 与 2x 尺寸、三格式与 3x、透明底 alpha、剪贴板、模板 CRUD、设置与主题、错误重试、单实例锁、隔离档案、缓存清理，零 soft）。**卸载实测**：`Uninstall PreviewCraft.exe /S` 后安装目录 / 两类快捷方式 / 卸载项 / 残留进程全清，且 `%APPDATA%\preview-craft`（42MB 真实数据含 settings.json）一并删除 —— **`deleteAppDataOnUninstall: true` 的「卸载即清空」口径至此首次真机验证通过**（2.1.1 定策时只改了配置，02:19 那次卸载是 2.1.0 时代 false 的行为）。**偶发失败 1 次**：安装版首跑 53/64，卡点全在「另存为模板」保存后弹窗未关（`等另存弹窗关闭` 10s 超时）引发 11 条连锁；同码同脚本重跑 63/63 全绿，win-unpacked 路径亦全绿，探针亦证明保存后 300ms 即关 → 判定为环境性偶发（窗口被遮挡时 Chromium 节流 rAF，弹窗退场卡在中间态），非应用缺陷。据此给冒烟基线加两样：`waitTrue` 超时自动转储现场（弹窗标题/输入值/按钮、活动页签、焦点元素、aside 命中元素、画布 rotate 与 img 数），以及 UI 阶段前 `page.bringToFront()`。**清理**：`release/` 内 2.0.0 / 2.1.0 / 2.1.1 三个已被取代的安装包连同 blockmap 一并删除（约 336MB），仅留 2.1.2 与 win-unpacked（后者是 `--exe` 打包版冒烟的目标，删了要重跑 `pnpm dist` 才能再验）。 | ① **GitHub Release 未挂**：`winget install GitHub.cli` 的 MSI 需要 UAC 提权，非交互安装被系统取消（exit 1602）→ 只能用户本机执行（或走网页拖拽上传）；② 偶发失败若日后复现，看 `[scene]` 转储即可定性 |
| 2026-09-19 | GitHub Release 发布（**完成**） | Release <https://github.com/baiwumm/preview-craft/releases/tag/2.1.2> 已发布并挂上 `PreviewCraft-Setup-2.1.2.exe`，**匿名 API 核验附件 116,618,521 字节与本地一致**，公开下载链路 `302 → 206 Content-Range: bytes 0-1023/116618521` 实测可用，SHA256 写进 Release 说明；README 补 Releases 链接。**顺带修 README 一处过期错句**：原文写「卸载只清除程序与快捷方式，保留 `%APPDATA%\PreviewCraft`」——2.1.1 起口径已改为卸载即清空，且目录名实为 `preview-craft`（Electron 取 package.json name），两处一并纠正。**发布过程三条环境排障（避免重复踩）**：① 网页端 release 附件上传**单文件上限约 25MB**，111MB 被拒只给 "Something went really wrong, and we can't process that file."，大附件必须走 gh CLI / REST API（上限 2GB）；② 本机命令行到 `github.com`（设备码等 HTML 端点）直连会超时，而 `api.github.com` 直连 0.4s 正常、**走系统代理 `127.0.0.1:7890` 反而 403** → CLI 一律不要注入 `HTTP(S)_PROXY`，`github.com` 慢就重试；`git push` 走 SSH 不受影响；③ `gh auth login` 的一次性码**只在终端打印、不发邮件**，且必须等该进程轮询完成才会写入 `%APPDATA%\GitHub\`（没有它 `gh auth status` 就是「未登录任何 host」），中途关窗即前功。另记：`gh release edit <tag> --draft=false` 对**草稿**会报 `release not found`（草稿与 tag 的关联尚未建立，REST 列表与 GraphQL `release(tagName:)` 都查不到），本次由用户删除草稿后改用 `gh release create 2.1.2 <exe> --notes-file ...` 一次成功 | 无遗留。「六、待确认」六项全部闭环 |
| 2026-09-19 | 反馈修复 + 两项新功能（预览占位 / 检查更新） | 装机后用户提 4 个体验问题 + 3 项评估。**先修三项**（提交 d1cab6e）：① 样式页横向滚动条 —— 两个色值 ColorField 是 `flex-1` 子项但 flex 默认 `min-width:auto` 不收缩（各 207px 固有宽，368px 面板被撑到 438px），补 `min-w-0` 后各 164px、`scrollWidth==clientWidth`；② 双屏聚焦贴底 —— desktop 含支架包围盒底边距画布仅 21.7px，改 `x160 y100 w760` + 手机 `x790 y310 w170`，四周 100/160/160/98.3 且水平居中偏移 0（截图目检）；③ 设置「重新检测」其实执行成功但界面零反馈，补 Toast（命中数 + 浏览器名 / 未命中 warning / 异常 danger）。**新增 A：预览拦截占位**（`src/main/probe.ts` + `preview:probe`）—— 渲染前读一次响应头判 `X-Frame-Options` / `CSP frame-ancestors`，被拦站点在设备屏内显示「该站点禁止内嵌预览 · 点截图查看真实效果」而不是留白。两个环境坑：Electron 主进程 fetch 对 github.com 的 **HEAD 会挂到超时**（代理不转发 HEAD），改成只用 GET + `Range: bytes=0-0`；本机到 github.com 直连常需 10s（实测 9.75s），6s 超时导致 fail-open 结果被缓存 → 超时放宽 8s + 重试一次 + 结果加 `probed` 字段区分「探到不拦」与「没探到」，失败一律不缓存，UI 仅在 `probed && blocked` 时提示。**新增 B：检查更新**（`src/main/update.ts` + `src/shared/version.ts` + `update:check` / `update:open` / `app:version`）—— 匿名打 GitHub Releases API 与 `app.getVersion()` 比对，设置新增「关于」页签显示版本与结果，发现新版才出「前往下载」，`shell.openExternal` 前校验只放行 `https://*.github.com`；**不引入 electron-updater 与 semver**（自动更新会把发布绑死在代码签名上，单人自用不值）。**冒烟**：A 段加 compareVersions 与 `judgeEmbedding` 六例合成响应头判定（DENY / SAMEORIGIN / frame-ancestors none / 'self' / `*` / 无头），B 段加 previewProbe 双站点、画布占位、关于页版本、检查更新文案，bridge 清单 26 个方法；**110/110 → 109/109 全绿、零 soft**，其中一轮 github 探测遇网络失败，容错分支按设计打 `[skip]` 而非误报 FAIL。**顺带修一个 dev 语义坑**：`electron out/main/index.js` 启动时 app path 落在 `out/main/`（那里没有 package.json），`app.getVersion()` 返回 Electron 版本 44.4.1 而非 2.1.2，会让「关于」显示错版本；冒烟启动方式改 `electron .` 后正确（打包版一直正确）。typecheck / lint / build / smoke 四绿 | **第 4 项「下载 Chromium 取消按钮」原估的子进程方案不成立**：① `@puppeteer/browsers@3.2.2` 的 `install()` 无 AbortSignal（`httpUtil` 用裸 `https.request`）；② 打包后该库在 `app.asar` 内，`ELECTRON_RUN_AS_NODE` 起的子进程是纯 Node、读不到 asar，要额外解包依赖。真取消两条路：自实现下载器（Node 内置 fetch + AbortController + `tar.exe` 解 chrome-for-testing zip，脚本零依赖走 extraFiles，`installedChromium()` 改按路径识别）约 **0.5~1 天**，或把库解包成 extraResources 约 **0.5 天**；廉价替代是下载前二次确认（**20 分钟**，只防误点、不能中断已开始的下载）。本机装有 Chrome/Edge 时这条路径几乎走不到，优先级待用户定 |
| 2026-09-19 | 图标重设计 + 下载二次确认（v2.1.3） | **dev 图标问题定位**：`createWindow()` 从未传 `icon`，未打包运行时 Windows 退回 Electron 默认图标（打包版由 electron-builder 把 `win.icon` 烤进 exe，所以一直是对的）→ 改为 `!app.isPackaged` 时传 `resources/icon.png`（该目录不随包发布，故只在 dev 生效，打包版不受影响）。**旧标两处硬伤**：沿用废弃 Web 版 1.3.0 的「P」字标 + 暮色紫底，与产品语义无关；且 `icon.svg` 里 `translate(96 96) scale(20)` 把 24px 图形放大到 480 超出 512 画布，右下角是被切的。**新标**：把产品自身的视觉语言抽象成设备构图 —— 显示器（机身 + 支架 + 底座，屏幕用 mask 镂空让底色透出）+ 手机压在右下前方，遮挡关系靠 mask 让出的一圈 12px 间隙表达而不是描边；底色沿用应用默认背景板暮色紫（三段渐变 + 左上极淡高光），墨色 `#171720`。渲染管线不变：`icon.svg` 为源，puppeteer-core + 本机 Chrome 光栅化 512 PNG，electron-builder 构建期转 ICO。16~256px 全尺寸出图目检：24px 以上清晰，16px 偏糊（Windows 实际取 32/48 为主，可接受）。**README 主界面图重拍**：原图是 PNG 壳时代产物、缩略图还带着「LARGE SCREENSHOTS」水印占位，已过期；CDP 驱动 `electron .` → github.com → Ctrl+Enter 真实截图 → 1280×800 重截。**下载二次确认**（第 4 项的 B 方案）：新增 `ChromiumDownloadButton`（idle → 确认态「确认下载（约 150 MB，无法中途取消）」→ 开始；8s 自动收回；下载中复位并禁用），引导弹窗与「设置 → 浏览器」两个入口统一换用；真取消受 `@puppeteer/browsers` 无 AbortSignal 限制，维持 Backlog。**冒烟**：加两段式确认 2 条断言（只验确认态，绝不真下 150MB）；`typeInto` 加三次重试 + 「名字没落进输入框就不点保存」的护栏 —— 上一轮 11 条连锁 FAIL 由 `[scene]` 转储定位为空输入框触发 `if (!trimmed) return`、弹窗不关吃掉后续所有点击，重试后 **112/112 PASS、零 soft、零 warn**。版本升 **2.1.3** | 16px 图标在小尺寸场景（任务栏合并窗口、部分第三方列表）仍偏糊，如在意可加一套手绘简化版走 `largeIcon`/多帧 ICO；真取消下载仍在 Backlog |
| 2026-09-19 | 图标 alpha 缺陷 + 改白底黑标 + 冒烟反节流 | **用户装机后指出的两处**：① 「dev 预览图标没变」—— 上一轮的 dev 图标修复有效，但**他看到的窗口是在新 `icon.png` 落盘（20:52）之前创建的**，图标只在窗口创建时读一次，重启 dev 即正常；② 「任务栏缩略图带白底」—— 真缺陷：我用 Chrome 截图生成 `icon.png` 时漏了 `omitBackground`，产物退化成 **`colorType=2`（RGB，无 alpha）**，圆角外全是不透明白，任务栏与缩略图就露出白方块。修完为 `colorType=6`、四角 `0,0,0,0`，并**给冒烟加一条锁死该属性**（512×512 + 8bit + RGBA）。**风格按用户要求改判**：弃掉暮色紫渐变（「太丑」），改**纯白底 + 近黑图形 `#111114`**（DeepSeek 式平涂），仅保留一圈 `#E7E7EE` 极淡描边防纯白在浅色资源管理器里糊边；设备构图不变。副作用是体积从 147KB 掉到 12KB。**从新 `release/win-unpacked/PreviewCraft.exe` 抽出 32×32 图标复验**：四角 alpha=0、底 `255,255,255`、图形 `#131316` ✓ 白底问题在产物层面消除。 **更正上一条记录的归因**：我曾把「保存后弹窗未关引发 11 条连锁」判为「脚本固定 sleep 不够」，不准确。真因是**窗口被遮挡 → Chromium 节流 rAF → HeroUI Modal 退场动画永不结束 → 节点不卸载、遮罩仍在 → 后续每次点击都被吞**（证据链：`[warn]` 为零说明名字已写入、`templatesGet` 已通过、输入框已被 `setName('')` 清空，唯独弹窗还在；且 Esc 也关不掉，说明不是点击丢失）。属测试环境耦合而非应用缺陷（用户点保存时窗口必在前台；理论上点完立刻 Alt+Tab 可能短暂滞留，系 HeroUI 依赖动画结束才卸载的固有行为，罕见且仅关观感，不动组件）。修法给被测进程加三个反节流开关 `--disable-backgrounding-occluded-windows` / `--disable-renderer-backgrounding` / `--disable-background-timer-throttling`，另加 `focusAppWindow()`（每段 UI 交互前置前）与 `closeAllDialogs()`（**Esc 清场**，键盘事件经 CDP 直达渲染进程、不受系统焦点影响）。加固后 **113/113 PASS、零 soft、零 warn**，探测与占位、二次确认、关于页、检查更新全部真跑通。2.1.3 重出包 116,561,932 字节 | 图标小尺寸（16px）仍偏糊，如在意需另出一套简化版；推送 / tag / Release / 安装四道门均待用户视觉签字 |
| 2026-09-19 | 2.1.3 发布收口 + 安装版冒烟归因更正 | **发布链走完**：`release/` 只留最新包（2.1.2 连同 blockmap 删除）→ 推 `5018b01` → annotated tag `2.1.3`（无前缀，与旧 1.x 一致）→ `gh release create` 挂 `PreviewCraft-Setup-2.1.3.exe`。**匿名核验**：API 附件 116,561,932 字节 = 本地一致，`draft=false`，Range 请求 206 且首 16 字节为 `MZ`（公开链路真在伺服）。**静默安装落位全绿**：`DisplayVersion=2.1.3`、`%LOCALAPPDATA%\Programs\PreviewCraft\PreviewCraft.exe`、桌面 + 开始菜单快捷方式，安装版 `app.asar` 头里 `.smoke-out` / `.smoke-profile` 命中 0（上轮打包卫生修复未回退）。**图标产物复验**：`icon.ico` 7 帧全 32bpp，32×32 与 256×256 为 PNG 封装（真 alpha、无 AND 掩码），任务栏白底在 exe 层面消除。**安装版冒烟：首跑 56/71 FAIL（exit 1，门禁确实判红了），此后 3 次 69/69 全绿零 soft**（断言数 71→69 是设计内分支：`Esc 可收设置弹窗` 仅在「关闭」按钮失败时兜底；拦截占位在探测不通时跳过）。**三条取证把上一轮的归因推翻**：① 加上 `--disable-features=CalculateNativeWinOcclusion` 后转绿属巧合 —— 同 exe 同脚本做 A/B、只去掉该开关，照样 69/69，**开关已撤回**，不把无效咒语留在基线里；② 用顶层不透明 WinForms 表单整片盖住被测窗口，`visibilityState` 仍是 `visible`、弹窗 1s 正常卸载，**「被遮挡」这个说法（含上一条记录写的真因）不成立**；③ 卡住期间 `setTimeout` / React 渲染 / IPC 全部正常、只有动画不动，且整轮余下时间再没恢复 —— 与 `export.ts:48` 早记过的「普通隐藏窗口不产帧、导出窗必须 `offscreen`」是同一机制。**结论：首跑是窗口停止产帧的环境事件（锁屏 / 熄屏 / 最小化），既非应用缺陷也非安装版专属路径**。**据此只动测试侧**：`waitTrue` 现场转储补 `document.timeline` 两次采样 + `visibilityState` + `hasFocus` + 弹窗内动画 `playState@currentTime`，并**连续两次取到「窗口不可见」即抛具名 FATAL 退出**，不再磨出一串假 FAIL（判据只用 `visibilityState`：空闲页面本就可以不推进 timeline，拿它当条件会误杀真实失败现场）。**顺带修冒烟诚实性**：github.com 探测不通时「拦截判定」与「画布占位」原先记成 PASS（`!siteProbed \|\| …`），把覆盖率虚报成满格 —— 改走新增的 `skip()`，汇总行成 `111/111 PASS + 2 SKIP（本轮未验到）` 并逐条列原因。**最终校验**：typecheck / lint 零错误；源码态全量 111/111 + 2 SKIP、安装版 69/69 | ① 环境性停帧无法无人值守预防，已改成「判红即定性」；若还要更硬的可恢复手段，候选是关窗后 `document.getAnimations().forEach(a => a.finish())` 或 `Page.setWebLifecycleState({ state: 'active' })`；② 拦截分支两条断言依赖外网，本机到 github.com 常 10s 上下顶到 8s 超时，近 3 轮里 2 轮 SKIP —— 要满覆盖得在 CI 里造一个可控的拒绝内嵌站点 |
| 2026-09-20 | 缺陷收口（v2.1.4） | 用户拍「先修债、Backlog 往后延」，本轮只动已批准的四条真缺陷 + 文档纠偏，**不碰功能面**。**① 渲染→主进程边界**：主窗口挂 `setWindowOpenHandler` 一律 deny + `will-navigate` 只允许留在自身来源（设备屏里嵌的是任意远程站点，子帧 `window.open` 弹出的窗口按 Electron 规则继承 opener 的 webPreferences 含 preload，放行等于把整套 `window.api` 交给外部页面）；`capture:start` / `preview:probe` 在主进程侧过一遍 `normalizeUrl`（原先只有渲染侧校验，`file://` 与内网地址从这里出得去）；`shot:dataurl` / `export:save` / `export:clipboard` 的路径锁进 `shotCacheDir()`（`export.ts` 新增 `assertShotPath`，三条通道共用），`export:save` 的 `defaultName` 过 `basename` 防借它写出目录。**② 截图引擎生命周期**：`launchBrowser` 原先把 rejected promise 永久缓存 —— 一次 launch 失败（Chrome 被占用 / 崩掉）之后每次截图都返回同一个错误，只能重启应用；改为记 `{path, promise}`，失败即清缓存、挂 `disconnected` 断连即清、传入路径与缓存不同则关旧实例重开（顺带解决「设置里换了浏览器路径不生效」），`before-quit` 也把 `closeBrowser()` 从 fire-and-forget 改成带 2s 上限的等待，不再留孤儿 chrome.exe。**③ 换地址残留旧截图**：`handleApply` 原先只清 `shotErrors`，而 `DeviceFrame` 优先渲染 shot → 截完 A 站改成 B 站，画布仍是 A 的截图，此时直接导出会把 A 的图配上新排版且全程不报错（2.1.x 只修了失败分支，成功分支漏）。改为按「该台实际用的地址（自己的覆盖 \|\| 主地址）」精确清 `shots`/`shotPaths`/`shotErrors`，同值提交（失焦二次提交）仍是空集，不伤「重试」入口。**④ 截图并发**：单台重试不盖遮罩，`handleRetryDevice` 原先不查 `job` 也不挡连点 → 两条 `captureStart` 共用一个浏览器实例并发导航、后完成的覆盖先完成的；渲染侧加 `job` + 在途设备集合双护栏，主进程 `capture:start` 加在途标记（第二次直接抛「上一次截图还在进行中」），`UrlBar.submit` 在 `busy` 时直接返回（回车与失焦是三个已禁用按钮留下的旁路）。**⑤ 死文件与文档**：删 `renderer/templates/index.ts` + `devices.ts`（纯 re-export、全仓库零 importer，大家都直接引 `@shared/devices`）与随之悬空的 `getPresetById`；PLAN §2 设备表从 PNG 壳时代数值改为 CSS 壳实际值并标「数值以 `shared/devices.ts` 为准」（laptop 892→891、tablet 1022→1020、机身宽高比四列全换、删掉「壳图从 git 历史恢复」一句）；§7 Backlog 抬头「均未开发」纠正 —— 轻量档检查更新其实 2.1.3 已上线，同时把本轮评审发现但**未获批准动手**的项（导出 IPC 监听器泄漏、缓存只增不减、会话不落盘、`setState` 更新函数里发 IPC、`deviceScaleFactor:2` 语义、外网依赖的 2 条 SKIP）逐条记进去待排期。**冒烟新增 9 条断言**：四条越界输入被主进程挡下（缓存目录外读 ×2、非 http(s) ×2）、`window.open` 返回 null、launch 失败如实报错 + **失败后下一次截图仍成功**（真拿 `where.exe` 当浏览器触发失败，再改回自动检测截出图来）、并发 `captureStart` 被互斥挡下、改地址后 `img 0 / iframe 4`。**门禁**：typecheck / lint 零错误，`pnpm build` 通过，源码态全量 **122/122 PASS、零 SKIP**。**主动收窄的一处**：批准清单里的「iframe 加 `sandbox`」没做 —— `sandbox` 会向下传播给被预览页面自己内嵌的子帧且无法由子帧解除（视频/地图类嵌入组件会黑屏），为一张截图工具的渲染保真不值；顶层的 `setWindowOpenHandler` 已经关掉「外部页面拿到 bridge」这个真正的洞 | ① 本轮未做 `pnpm dist` / 推送 / tag / Release / 装机，四道门均待放行；② `release/` 已清空，`--exe` 打包版冒烟要等重新出包才有靶子；③ 环境性停帧仍只能「判红即定性」；④ 拦截占位两条断言依旧依赖外网（本轮网络争气，零 SKIP） |
| 2026-09-20 | 2.1.4 发布四道门（**三道半过，Release 卡在凭据**） | **门 1 出包**：带 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 跑 `pnpm dist`（electron-builder 不读 `.npmrc`，不显式给就会卡在 NSIS 资源下载）→ `release/PreviewCraft-Setup-2.1.4.exe` **116,566,272 字节**（比 2.1.3 的 116,561,932 大 4,340 字节，与改动量同量级，无异常膨胀），SHA256 `60db7f7c2cf22862614d8e952088c31f9dcf4bd6bb3e486d049fbe8b7df48538`；**打包卫生复验**：`app.asar`（53.1MB）头里 `.smoke-out` / `.smoke-profile` 命中均 false，2.1.2 那次 +8.1MB 的坑没回退。**门 2 推送**：`git push origin main` `49966b0..884c243`，7 个提交（走 SSH，不受本机到 github.com HTML 端点超时影响）。**门 3 tag 完成、Release 未完成**：annotated tag `2.1.4` 已推 origin；但 `gh auth status` 报「未登录任何 host」，且 `%APPDATA%\GitHub\` 目录根本不存在、`GH_TOKEN`/`GITHUB_TOKEN` 均未设 —— **本机没有可用的 GitHub 凭据**，116MB 附件又超网页端约 25MB 上限，只能走 CLI/API，故 Release 待用户放行认证（说明稿已写到 `%TEMP%\pc-release-214.md`，含修复清单 + 字节数 + SHA256）。**门 4 装机复验通过**：装前确认 `NO_RUNNING_INSTANCE`（不顶掉用户正在用的窗口）→ `Setup-2.1.4.exe /S` 静默覆盖安装 exit=0 → exe `ProductVersion=2.1.4.0`、卸载项 `DisplayName=PreviewCraft 2.1.4 / DisplayVersion=2.1.4`（键名仍是 appId 派生 GUID `4cf14dc5-…`，不是 `com.previewcraft.desktop`）、桌面与开始菜单快捷方式齐、安装目录 420.9MB → **在安装版靶子 `release/win-unpacked/PreviewCraft.exe` 上跑全量冒烟 122/122 PASS、零 SKIP**，本轮 9 条新断言在打包态（`app.isPackaged=true`、渲染走 asar）逐条真跑过：四条越界输入被主进程拒（路径不在缓存目录 / 非 http(s)）、`window.open` 返回 null、launch 失败后下一次截图仍出图、并发 `captureStart` 被互斥挡下、改地址后 `img 0 / iframe 4`。踩坑一条：PowerShell 内联命令里的 `$p` 被 Git Bash 当变量展开掉，解析期就报错（安装器根本没跑），改写成 `.ps1` 文件 `-File` 执行才对 | ① **GitHub Release 未挂**，需用户 `gh auth login`（设备码只在终端打印、须等轮询完成才落 `%APPDATA%\GitHub\`，CLI 一律不要注入 `HTTP(S)_PROXY`）或授权我起会话由其在浏览器输码；② 用户批准清单里的「iframe 加 `sandbox`」判定不做（会向下传播给被预览页面的子帧且不可解除，视频/地图类组件黑屏，代价大于收益），已在其回复中知情；③ §7「已报出、待排期」五项未动 |
| 2026-09-20 | 2.1.4 Release 补挂（**四道门全过**） | 关闭上一条遗留 ①。`gh` 认证走用户放行的设备码流程（`A78C-xxxx` 由用户在浏览器输码），登录后 `gh auth status` 确认账号 `baiwumm`、token scopes `gist/read:org/repo`、协议 ssh。**Release** <https://github.com/baiwumm/preview-craft/releases/tag/2.1.4> 已发并挂上 `PreviewCraft-Setup-2.1.4.exe`：**匿名 API 核验 `draft=false`、附件 116,566,272 字节 = 本地 `stat` 一致**；公开下载链路 Range 请求回 **206 / 16 字节、首两字节 `MZ`**（真在伺服 PE）。说明稿含修复清单、字节数与 SHA256。**这条网络口径要更正上一轮写下的「CLI 一律不要注入 `HTTP(S)_PROXY`」——那是半成品结论，实测本机当前是分裂路由**：`github.com`（设备码 `POST /login/device/code`、Release 下载跳转）直连**超时**、走系统代理 `127.0.0.1:7890` **1.1s 通**；而 `api.github.com` 直连 0.28s 通、走代理 **403**。所以按端点分：**设备码与下载链路带 `-x http://127.0.0.1:7890`，API 读写与 `gh release create` 一律裸连**。另记一条 gh 用法坑：`--web` 流程的一次性码要先过「Press Enter to open browser」，把命令接进 `| tail` 会把码缓冲掉、拿不到 —— 后台任务直接输出到它自己的日志文件再读，别加管道 | ① `sandbox` 判定不做（渲染保真代价）；② §7「已报出、待排期」五项技术债待用户排期；③ 本轮 docs 提交是否推 origin 待放行 |
| 2026-09-20 | 视觉迭代（v2.2.0，**用户看图签字**） | 用户指「预设模板有点丑」，拿 shots.so 做参照先出方案再动手，批准范围只含「零 schema / 零 IPC / 零导出尺寸变更」那一档。**先量后改**：写脚本按统一口径算出改前五套的包围盒留白与遮挡 —— `row` 左右留白仅 **25px**（贴边）且四台底边 585/551/493/553 无对齐轴、`focus` 水平偏心 22.5px 且画面占比仅 63%、`editorial` 偏心 14px、`classic` 前景压住后景屏幕 **14.8%**（「糊成一团」的根因）。**改后**：留白 88~205px、五套水平偏心全部 ≤7.5px、上下差 ≤19px、占比 71~84%、最大压屏 4.7%（`focus` 10.1% 为有意叠层），`row` 四台底边全落 566.1 且间隙等距 22px。判据**固化进冒烟 A 段**（留白 / 居中 / 占比 / 遮挡 / 底边对齐 / 间隙等距），以后改坐标即被校验。四项实现：① **背景板** 7 → 15 块分三组，渐变一律 `135deg` 三段 + 左上 `radial-gradient` 高光层（`value` 本就是单个 CSS 串，多层叠加零 schema 变更），自定义渐变同步改 135deg；② **阴影** `DeviceFrame` 原对四台一律 `0 18px 32px/.35`，改 `deviceShadow(displayWidth)` 按显示宽折算 + 双层（desktop 660 → `0 28.8px 54.4px`，mobile 140 → `0 8.1px 15.3px`），helper 落 `lib/design.ts` 供真机与缩略图共用；③ **设备壳** desktop 外接高 548 → 478（支架颈 84×86 → 56×42、底座 304 → 148、下巴 42 → 20、金属由亮银改空间灰），mobile 加 `shell.island` 灵动岛（画在内屏裁剪层内，坐标与机身同基准、定位需从 inner 原点做差值），摄像头件从白色块改暗镜片，机身加 `0 0 0 .8k rgba(255,255,255,.14)` 外轮廓光——**这条是实测逼出来的**：`focus` 首版黑底压黑壳，设备轮廓整个消失；④ **缩略图** `ThumbCanvas` 补同一套阴影 + 玻璃压边 + 灵动岛，内屏占位从 `bg-white/70` 改中性渐变，画廊与真机所见一致。**背景板选择器换 HeroUI 内置 `ColorSwatchPicker`**（用户点名要内置，替掉手写 button 网格）：读安装包源码确认边界——选中态以 `color.toString('hexa')` 为唯一 key、`color` 参数走 `parseColor` 所以**渐变串进不去**，故每块背景补 `color` 代表色（15 个互不相同，冒烟锁死），真实 CSS 经 `ColorSwatchPicker.Swatch` 的 `style` 透传覆盖；每组各一个 picker，跨组互斥用「点选后全页仅一项 `data-selected`」断言兜。**代价（已告知并获准）**：内置色块只有 16~40px 方/圆，做不了原来的宽条块 + 每块挂中文名，`title` 也不在 `ColorSwatchPickerItemProps` 类型里（TS 直接拒），故名称改为「当前：X」单行回显 + `aria-label`。**门禁**：typecheck / lint / build 三绿；冒烟 A 段先 50/50，加条目后全量 **132 条**（本轮 2 条 SKIP 是 github.com 探测超时的既有外网依赖分支，非本轮引入）。**出图核验**：CDP 驱动真实应用截 `tailwindcss.com` 四台 → `exportCompose` 逐套预设出 1x PNG + 三张应用内界面图，用户看图通过 | ① 代码按 feat / test / docs / chore 四个 commit 落库，**出包 / 推 origin / tag+Release / 装机复验四道门全部待放行**；② 方案级那条**没做**：浏览器窗口壳（`Placement.frame`，即 shots 的 Frame 模式）——chrome 条应撑在 inner 之外、viewport 保持不变，否则截图内容被拉伸；且导出态要在地址栏显示 URL 需给 `ExportRenderPayload` 加 `urls` 字段，属契约变更，排在 §7 五项技术债之后；③ README 两张配图本轮重拍替换（旧图仍是淡彩底 + 粗支架时代产物）；④ 画廊卡片在缩略图与标题之间有一段 `bg-surface` 深色留白，2.1.x 既有观感、本轮未动 |
| 2026-09-20 | 按钮补图标（v2.2.0 续） | 用户提「按钮都是纯文字，适当加图标，比如顶部那 4 个」。先查清一件事再报选型：**HeroUI v3 不提供图标集**（`@heroui/react` 只有 react 与 styles 两个包，官方 Button 文档的图标示例直接引第三方库），Button 也没有图标插槽 —— 图标就是 children 里塞一个 SVG，所以「用库内置」在这条上不成立，必然是新增依赖。按 AGENTS.md 第三节「依赖变更属方案级」摆三个选项带推荐（lucide-react / @gravity-ui/icons 官方示例同款 / 手写 inline SVG 零依赖），用户定 **lucide-react + 全站范围**。落地 28 处：顶栏 4（RefreshCw / Camera / Settings / Sun·Moon）、样式面板 3（Palette / Save / RotateCcw）、导出面板 2（Camera / Download，busy 态换 HeroUI 内置 Spinner）、设置弹窗 9（Check·Circle / FolderOpen / Eraser / ScanSearch / Trash2 / RefreshCw / CircleArrowUp / ExternalLink / X）、Chromium 下载四态 4、引导弹窗 2、另存弹窗 2、画廊删除的 `✕` 文字符号换成 X、设备屏内「重试」加 RotateCw。两处细节：`使用 / 已选` 同一枚按钮的两个状态各配一枚图标（Circle / Check），否则只有一态带图标会造成 16px 宽度跳动；主题钮的图标与文案同指「要切去的那一档」（暗色下显示太阳 + 「浅色」）。**不写任何 size / className** —— `@heroui/styles` 的 `.button` 已给子 `svg` 定好 `size-5` / `sm:size-4` / `size="sm"` 时 `size-4` 并带 `pointer-events-none shrink-0`，自己再指定反而和库打架。**包体实测**：具名 import 下 renderer 产物 1,679.08 → 1,705.26 kB（20 个图标 +26.18 kB），产物内 `createLucideIcon` 仅 23 处、抽测未用图标（Bath / Astronaut / Squirrel / Zodiac）0 命中 → tree-shake 有效，AGENTS.md 那条「禁裸 barrel import」按具名 import 满足；代价是构建图里模块数 1,768 → 3,630、build 325ms → 426ms。**门禁踩到两类非代码抖动，都做了取证**：① 一轮 130/134，4 条 FAIL 全在「Ctrl+Enter 后画布出图」段，同轮 bridge 层 `captureStart` 却 4/4 用 21.3s 过 —— 判为 github.com 瞬时故障致 UI 截图报错、画布停在错误占位、`waitForFunction` 顶满 300s，单跑 B 段复验 **82/82 全绿**；② 另一轮 FAIL「未污染用户真实设置 06be9e69 → 34558372」，取证发现是**用户自己的 dev 实例**（PID 1900，13:39:07 起的 `electron .`，命令行里没有 `--user-data-dir`）正持有真实 `%APPDATA%\preview-craft` 并在 14:00 写过 settings.json；冒烟与出图实例都带 `.smoke-profile`，隔离档案里能看到 smoke 自己的终态（theme dark + browserPath + `templates:v1`），**未污染用户数据、也没去杀那个进程**，事后核对真实 settings.json 内容与本次会话开始时逐字节相同（theme light / png / 2）。该轮重跑后此条回到 `34558372 → 34558372` PASS | ① AGENTS.md §二「技术栈（锁定）」表没列图标库，只在第三节把 `lucide-react` 当反面例子点名 —— 要不要在 §二补一行由用户定，我只在 PLAN §一 记了选型与实测；② 「未污染用户真实设置」这条哈希断言**分不清**「冒烟污染」与「有人 concurrent 在用真实档案」，建议加一条：启动时检测到非冒烟实例持有真实 userData 即走 `skip()` 并写明原因（未获批准，本轮没动）；③ 图标改动随本轮两处收口一并提交（见下一行），出包 / 推送 / tag+Release / 装机四道门仍全部待放行 |
| 2026-09-20 | 视觉迭代续：缩略图贴边与圆角默认值 | 用户装机看效果后回提两条。**① 预设缩略图贴边**：先量再定——实测卡片 border-box 336px、`p-2` + 1px 边框下内容区只有 **318px**，而 `ThumbCanvas` 按写死的 `scale=0.3` 输出 **336×261**，右侧溢出 9px 被卡片的 `overflow-hidden` 裁掉，于是左边 8px、右边 0px 看着贴边；根因是**死比例算死宽度**（336 = 384 侧栏 − 面板 p-4 32 − 卡片 p-2 16 − 边框 2 − 侧栏内滚动条 16，少算任何一项都会再犯）。改法不新增钩子：外层给 `w-full` + `aspect-ratio: 1120/870` 撑出真实高度，缩放直接复用主画布那个 `useFitScale` 按实宽算，`scale` prop 与 0.3 魔数一并删掉（全仓库仅 TemplateGallery 一处用）。复量：缩略图 318×247、左右各 9px 对称。**② 圆角默认 12**：`defaultStyle.borderRadius` 0 → 12。这条牵出一个真缺陷——画布带圆角后四角是被裁掉的透明区，**JPG 没有 alpha**，导出窗口页面底色一直强制 transparent，圆角外就会渲染成黑角；改 `ExportPage` 在 `flattenWhite`（JPG）时把页面本身铺白，与既有「透明底 JPG 自动垫白」同一口径。新增断言实测四角 247~255 全白；阈值先写 250 判红过一次，实为 JPG 色度抽样在圆角边缘的振铃（247 是正常值不是缺陷），放宽到 235 并注明原因。**README 两张配图随本轮再刷**（主图带图标与圆角、导出样例改按默认圆角 12 的 2x JPG）。门禁：typecheck / lint / build 零错误，冒烟 B 段 **81/81 + 2 SKIP**（外网探测分支） | ① 出包 / 推送 / tag+Release / 装机四道门待放行；② 圆角是会话样式、不随模板持久化（PLAN 3.4 既有口径），用户若要「每个模板自带圆角」需扩 schema，未动 |
| 2026-09-20 | 2.2.0 出包（门 1）+ 一处打包膨胀纠偏 | 用户定下**「每次发新包只保留最新一份」**，已写进 AGENTS.md 第五节。**门 1 出包**：带 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR` 跑 `pnpm dist` → `release/PreviewCraft-Setup-2.2.0.exe` **116,572,866 字节**、SHA256 `131084cdadd0d7c974e3816a6d9c22e336495363870827c02ff66b64e18d9ef4`、exe `ProductVersion=2.2.0.0`，比 2.1.4 仅大 6,594 字节。**先撞出一个真问题**：首版出到 **117,324,757** 字节、`app.asar` 从 53.1 MiB 涨到 **61.5 MiB**，而本轮 renderer 只 +26 KB —— 取证为 `lucide-react` 被当生产依赖，electron-builder 把 39 MB 的整包塞进 asar（头部 `@2795152` 命中 `"lucide-react":{"files":{"LICENSE"…`）。它是纯构建期依赖（Vite 已内联，产物内仅 23 处 `createLucideIcon`），挪进 `devDependencies` 后 asar 回到 **55,708,235 字节（53.13 MiB，与 2.1.4 基线齐平）**、安装包降到 116,572,866；归类规则一并写进 AGENTS.md。**打包卫生复验**：asar 头部 `.smoke-out` / `.smoke-profile` / `.agents` / `PLAN.md` 全部未命中（2.1.2 那次 +8.1MB 的坑没回退）。**旧包清理**：删 `PreviewCraft-Setup-2.1.4.exe` 连同 `.blockmap`（GitHub Release 上有存档），`release/` 只剩 2.2.0 与 `win-unpacked`。**打包版全量冒烟这轮没跑完**：`--exe` 模式两次都在「另存为模板 → 等自定义项进画廊」处遇到 `visibility=hidden` + 动画时间轴停进（即 2.1.4 记过的锁屏/熄屏级环境事件），新加的判据按设计抛 FATAL 并当场定性，没有磨出一串假 FAIL。改做针对性产物核验并**通过**：包内资源指纹 `index-CwMFZMgC.js` 与本轮构建逐字一致、按钮内 8 枚 SVG 带 `class="lucide lucide-refresh-cw"`、画布 computed `border-radius: 12px`、底色为新渐变、bridge 可用 | ① 门 2 推送 / 门 3 tag+Release / 门 4 装机复验均待放行；② 打包版全量冒烟需在窗口保持可见时重跑一次（更硬的可恢复手段仍挂在 §7：`getAnimations().forEach(a=>a.finish())` 或 `Page.setWebLifecycleState`）；③ 顺带量到一个候选：`@heroui/react` / `react` / `react-dom` / `tailwind-variants` 及其 `react-aria` / `react-stately` 传递树同样是「只进 renderer」的依赖，asar 里 50 MB 量级大部分是它，移进 `devDependencies` 可望再省几十 MB——需实测安装版仍能启动，未动 |

## 六、待确认

截至 2026-09-19 晚，六项全部闭环，无待确认事项。

1. **卸载数据口径**：✅ 已定夺「卸载即清空」—— 2.1.1 起 `deleteAppDataOnUninstall: true`，卸载时连 `%APPDATA%\preview-craft` 一并删除；覆盖安装不受影响。
2. **安装界面与保存对话框目视确认**：✅ 用户已实际安装并使用应用（2026-09-19 反馈即来自真实使用），视为通过。
3. **打包版 GPU/沙箱**：✅ 已解除疑虑（安装版启动正常），dev 的条件开关维持现状。
4. **发布事务**（git tag / GitHub Release）：✅ 全部完成 —— annotated tag `2.1.2` 已推 origin（2.x 线首个，此前仅有废弃 Web 版 1.0.0~1.3.0），GitHub Release 已发布并挂上安装包：<https://github.com/baiwumm/preview-craft/releases/tag/2.1.2>，附件 `PreviewCraft-Setup-2.1.2.exe` 116,618,521 字节（匿名 API 与本地字节数一致，公开下载链路 302→206 实测可用，SHA256 已写进 Release 说明）。装机与卸载实测通过、安装版内冒烟 63/63。
5. **版本更新提示**：本期不做，方案记录在「七、Backlog」，需要时再选型。
6. **纯逻辑单测要不要上 vitest**（2026-09-19 冒烟基线新增）：✅ 已定夺**不引入** —— 核心纯函数断言继续内嵌在 `scripts/smoke.mjs` A 段（Node 24 直跑 `src` 下 TS，零新依赖，`pnpm smoke` 一条命令跑完），新增纯函数断言直接往 A 段加；不引入 vitest 的 watch / 覆盖率，换取依赖面不变。

## 七、Backlog（后续迭代）

> **排期口径（2026-09-20 用户定）**：已批准的范围是「先把已存在功能面的债修干净，新功能往后延，这个不急」。
> 以下各条**均无排期、无 owner**，等空档再逐条挑；其中「待排期技术项」是 2.1.4 评审时发现、明确判定不当轮动手的。

### 功能（均未开发）

- fullPage 长截图
- 登录态截图（复用用户 Chrome profile）
- 批量 URL 队列
- OG image 尺寸预设
- 系统托盘与全局快捷键
- 导出历史记录
- **应用内自动更新**：2.1.3 已落「轻量档」（`src/main/update.ts` 比对 GitHub Releases + 设置「关于」页手动触发、只跳转不自动装）。剩余的是「完整档」electron-updater 方案，代价是发布流程被代码签名绑死，单人自用暂不值。
- **Chromium 下载真取消**（2.1.3 只做了下载前二次确认）：`@puppeteer/browsers@3.2.2` 的 `install()` 无 AbortSignal，且打包后该库在 `app.asar` 内、子进程读不到。两条路：自实现下载器（Node 内置 fetch + AbortController + `tar.exe` 解 zip，约 0.5~1 天），或把库解包成 extraResources（约 0.5 天）。
- **16px 图标简化版**：当前 `icon.svg` 在 24px 以上清晰、16px 偏糊（Windows 实际主要取 32/48，可接受）。在意的话需另出一套手绘简化版走多帧 ICO。
- **浏览器窗口壳（shots 的 Frame 模式）**：2.2.0 只做了「不改契约」那一档，这条是方案级、需先记 §六 待确认再动。落法：`Placement.frame?: 'device' | 'browser'`（缺省 `'device'`，已存自定义模板不失效），`devicePresets[d].frame` 拆成 `frames: { device, browser }` 各带 `aspect` / `inner`；**chrome 条必须撑在 inner 之外、把机身加长**，viewport 保持不变，否则截图内容被拉伸、还得改 `capture.ts` 与截图 IPC。导出态要在地址栏显示真实 URL，需给 `ExportRenderPayload` 加 `urls` 字段（不能塞进 template——模板是排版数据）。
- **画布比例族**（4:3 / 1:1 / 9:16 等，shots 有 5:4 一档）：牵动全部预设坐标、已存自定义模板、以及冒烟里 2240×1740 的尺寸断言，代价远大于「多个选项」的收益，暂不做。
- **同一类设备放多台**（两个手机并排这类布局）：现在 `Canvas` 用 `key={placement.device}`、`shots: Record<DeviceId, string>`、`StylePanel` 的 `find(p => p.device === …)` 全都假设每台唯一，要加 `slot` id 并改截图结果、单台重试、样式面板三处。
- **Tilt 3D 透视**（shots 招牌）：`perspective + rotateY` 与 `filter: drop-shadow` 组合在隐藏窗口 `capturePage` 下的渲染表现未验证，风险/收益不划算，暂缓。

### 已报出、待排期的技术项（2.1.4 评审时判定不在当轮范围）

- **导出 IPC 监听器与定时器不泄漏**：`export.ts` 等 `export:ready` / `export:webp:result` 用的是 `ipcMain.once`，20s/15s 超时胜出后监听器不被摘除；`capture.ts` 的 `withTimeout` 不 clear timer；`ExportPage.tsx` 等图片解码的自续 `setTimeout` 无 cleanup 且永不超时会一直轮询。因导出被遮罩串行化，当前危害有限（下一轮导出可能被残留监听器提前放行）。
- **截图缓存只增不减**：唯一删除入口是全量「清除缓存」。每轮截图 4 张大 PNG + 每次导出 1 张落 `%TEMP%/preview-craft`，失败/重试丢弃的也只是路径、文件留在盘上。缺按台清除、缺容量上限、缺「打开缓存目录」。
- **会话状态不落盘**：URL / 选中模板 / 样式微调重启即丢（设置与自定义模板已持久化）。
- **`setState` 更新函数里发 IPC**：`App.tsx` 的另存/删除自定义模板把 `templatesSave` / `templatesDelete` 写在 `setCustomTemplates(prev => …)` 里，`main.tsx` 开着 StrictMode → dev 下更新函数双调用、真发两次 IPC。违反 AGENTS.md 第三节红线，因模板 id 是时间戳 upsert 才没产生重复数据。
- **截图倍率语义**：`capture.ts` 的 `deviceScaleFactor: 2` 是硬编码（出图恒为 viewport 的 2 倍），与设置里的「导出倍率」是两件事，界面上没说清。
- **冒烟的两条拦截分支依赖外网**：本机到 github.com 常 10s 上下顶到 8s 探测超时，近几轮里常出现 2 条 SKIP；要满覆盖得在 CI 里造一个可控的「拒绝内嵌」站点。
- **renderer 专用依赖仍被打包进 asar**：2.2.0 出包时抓到 `lucide-react` 被塞进 `app.asar`（+8.4 MiB），已挪进 `devDependencies`；但同类还有 `@heroui/react` / `react` / `react-dom` / `tailwind-variants` 及其 `react-aria` / `react-stately` / `@internationalized/*` 传递树——它们同样只被 Vite 打进 renderer，运行时无人 require，占了 asar 53 MiB 的大部分。全部挪进 `devDependencies` 可望把安装包再压几十 MB。**必须先实测**：安装版启动后主进程只依赖 `electron-store` / `puppeteer-core` / `@puppeteer/browsers`，挪错会让 asar 里缺模块直接白屏；改完要在 `win-unpacked` 上跑通打包版冒烟再算数。
- **「未污染用户真实设置」分不清污染与并发使用**：该断言只比对真实 `%APPDATA%\preview-craft\settings.json` 的前后哈希，而用户自己开的 dev 实例（`electron .` 不带 `--user-data-dir`）同样在写这个文件 —— 2026-09-20 就踩到一次假红（`06be9e69 → 34558372`，取证为 PID 1900 那个实例 14:00 的写入）。改法：启动时枚举 `electron.exe` / `PreviewCraft.exe` 的命令行，凡持有真实 userData 且非本冒烟进程，即让这条断言走 `skip()` 并写明原因，而不是判红。
