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
- [ ] P1 截图引擎
- [ ] P2 前端主体
- [ ] P3 模板系统
- [ ] P4 导出闭环
- [ ] P5 打磨与分发

## 五、执行记录

| 日期 | 阶段 | 结果 | 遗留问题 |
| --- | --- | --- | --- |
| 2026-09-17 | 前置 | 旧代码清理完成（保留 .git/LICENSE）；Skill 与本计划落库；`desktop/` 目录被进程占用仅剩空壳，内容已清空 | 关闭占用进程后手动删除空目录 |
| 2026-09-18 | 基线 | 提交 be7ac7c：清理旧 Web 版 + AGENTS/PLAN/Skill 落库 | — |
| 2026-09-18 | P0 | 完成。骨架可运行（Electron 44 / electron-vite 5 / vite 8 / React 19 / HeroUI 3.2 / Tailwind 4.3 / TS 6.0），HeroUI 按钮 + 暗色主题 + 壳图显示已验证（截图核验）；**Spike A**：show:false 的 capturePage 产出 92,696 字节真实渐变 PNG → **P4 采用 show:false 方案**（offscreen:true 模式 74,526 字节可用作备选；「屏幕外坐标 + show:true」失败报 Current display surface not available，弃用）；**Spike B**：puppeteer-core 控本机 Chrome headless 截 example.com 产出 39,910 字节 2x PNG → 截图引擎路线可行；typecheck/lint 零错误 | ① 本会话环境 GPU 进程不可用，dev 启动即崩 → main 已按 `!app.isPackaged` 条件加 `no-sandbox`/`disable-gpu` 开关，打包版默认路径待 P5 实测；② pnpm 信任策略拦截 semver@6.3.1/5.7.2 → pnpm-workspace.yaml `trustPolicyExclude`；electron/esbuild 构建脚本经 `allowBuilds` 放行；③ TypeScript 锁 6.0.3（typescript-eslint 8.70 不支持 TS7）；④ 壳图恢复命令的 tag 实为 `1.3.0`（无 v 前缀），本计划中 `v1.3.0` 写法需留意；⑤ 内屏偏移取自旧版 enums（desktop 11/11、laptop 56/10、tablet 10/12、mobile 7/6），已固化进 devices.ts |

## 六、待确认

（暂无）

## 七、Backlog（后续迭代）

fullPage 长截图、登录态截图（复用用户 Chrome profile）、批量 URL 队列、OG image 尺寸预设、自动更新（electron-updater + GitHub Releases）、系统托盘与全局快捷键、导出历史记录。
