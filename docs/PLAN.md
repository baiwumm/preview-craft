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

## 二、数据定义（迁移自旧版，直接照抄）

### 设备 preset

| device | viewport (css px) | UA 特征 | isMobile | hasTouch | 壳图宽 | 壳宽高比 | 内屏 inner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| desktop | 1440 × 950* | 桌面 Chrome UA | false | false | 620 | 671/629 | 600 × 396 |
| laptop | 1366 × 892* | 桌面 Chrome UA | false | false | 520 | 969/579 | 408 × 266 |
| tablet | 768 × 1022* | iPad UA | true | true | 300 | 981/1293 | 280 × 372 |
| mobile | 390 × 840* | iPhone UA | true | true | 138 | 1000/2025 | 124 × 267 |

\* viewport 高度按「内屏宽高比」换算保证内容不变形：`height = round(width × innerH / innerW)`，实现时以此公式为准。
内屏 `inner` 是设备壳上的透明展示区，截图 `<img>` 与预览 `<iframe>` 都缩放铺到这里：`scale = innerW / viewportW`。
壳图从 git 历史恢复：`git show v1.3.0:public/desktop.png > resources/frames/desktop.png`（4 张同名）。

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
  { id: 'classic', name: '经典全家福', subtitle: '四种屏幕，一个好故事', placements: [
    { device: 'desktop', x: 320, y: 140, width: 620 }, { device: 'laptop', x: 100, y: 420, width: 510 },
    { device: 'tablet', x: 850, y: 290, width: 240 }, { device: 'mobile', x: 710, y: 465, width: 135 }] },
  { id: 'duo', name: '双屏聚焦', subtitle: '桌面与移动，恰到好处', placements: [
    { device: 'desktop', x: 175, y: 150, width: 790 }, { device: 'mobile', x: 820, y: 335, width: 175 }] },
  { id: 'row', name: '有序陈列', subtitle: '清晰展示每一种尺寸', placements: [
    { device: 'desktop', x: 65, y: 240, width: 390 }, { device: 'laptop', x: 455, y: 355, width: 335 },
    { device: 'tablet', x: 805, y: 255, width: 180 }, { device: 'mobile', x: 1020, y: 320, width: 115 }] },
  { id: 'editorial', name: '灵感错落', subtitle: '轻盈旋转，更有表达', placements: [
    { device: 'laptop', x: 100, y: 255, width: 640, rotation: -8 },
    { device: 'tablet', x: 810, y: 170, width: 240, rotation: 8 },
    { device: 'mobile', x: 700, y: 455, width: 135, rotation: -8 }] },
  { id: 'focus', name: '移动主角', subtitle: '为小屏幕留足舞台', placements: [
    { device: 'tablet', x: 300, y: 130, width: 355 }, { device: 'mobile', x: 660, y: 260, width: 205 }] },
];
```

### 背景板

`暮色紫 #ede6ff→#b5aff2`、`海盐蓝 #e4f5fb→#9ac6e4`、`薄荷绿 #e9f4df→#a4caba`、`奶油杏 #fff2df→#edc6b0`、`曜石黑 #3b3b49→#171720`、`纯白 #ffffff`。

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
- [x] P5 打磨与分发（2026-09-19 完成：打包 / 安装 / 全流程 / 卸载实测通过；「保存对话框落盘 + NSIS 中文安装界面」目视与「卸载是否清数据」口径待用户确认，见「六、待确认」）
- [x] 回归冒烟基线（2026-09-19：`scripts/smoke.mjs` 常驻，98/98 PASS，见「五、执行记录」）

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

## 六、待确认

截至 2026-09-19 晚，六项全部定夺完毕，无阻塞开发的事项；唯一悬着的是 GitHub Release 是否挂载安装包（见第 4 项）。

1. **卸载数据口径**：✅ 已定夺「卸载即清空」—— 2.1.1 起 `deleteAppDataOnUninstall: true`，卸载时连 `%APPDATA%\preview-craft` 一并删除；覆盖安装不受影响。
2. **安装界面与保存对话框目视确认**：✅ 用户已实际安装并使用应用（2026-09-19 反馈即来自真实使用），视为通过。
3. **打包版 GPU/沙箱**：✅ 已解除疑虑（安装版启动正常），dev 的条件开关维持现状。
4. **发布事务**（git tag / GitHub Release）：✅ 2.1.2 起补上 —— 2.x 线此前无任何 tag（仅废弃 Web 版 1.0.0~1.3.0），本次为 2.1.2 打 annotated tag 并推 origin；GitHub Release 是否挂安装包仍未定（本机无 `gh` CLI，需网页手动上传或先装 gh），README 已说明本地 `pnpm dist` 出包路径。
5. **版本更新提示**：本期不做，方案记录在「七、Backlog」，需要时再选型。
6. **纯逻辑单测要不要上 vitest**（2026-09-19 冒烟基线新增）：✅ 已定夺**不引入** —— 核心纯函数断言继续内嵌在 `scripts/smoke.mjs` A 段（Node 24 直跑 `src` 下 TS，零新依赖，`pnpm smoke` 一条命令跑完），新增纯函数断言直接往 A 段加；不引入 vitest 的 watch / 覆盖率，换取依赖面不变。

## 七、Backlog（后续迭代，均未开发）

- fullPage 长截图
- 登录态截图（复用用户 Chrome profile）
- 批量 URL 队列
- OG image 尺寸预设
- **版本更新提示**（2026-09-19 确认本期不做，两档方案待选）：
  - 轻量：启动时请求 GitHub Releases（或自建版本 JSON）比对版本号，Toast/Modal 提示「前往下载」，无新依赖；
  - 完整：electron-updater + GitHub Releases，应用内自动下载与一键安装（引入 electron-updater 依赖，发布流程固定走 GitHub Releases）。
- 系统托盘与全局快捷键
- 导出历史记录
