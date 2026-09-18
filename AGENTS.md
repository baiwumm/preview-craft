# AGENTS.md — PreviewCraft Desktop

> 本文件是所有 AI Agent 在本仓库工作的最高约束。与个人习惯冲突时，以本文件为准。
> 开发任务的执行依据是 [docs/PLAN.md](./docs/PLAN.md)，按阶段实施并自验、回写进度。

## 一、项目概述

**PreviewCraft Desktop**：Electron 桌面端「多设备截图排版工具」。粘贴 URL → 多设备真实截图 → 套用排版模板 → 导出高分辨率展示图（PNG/JPG/WebP）。

- 旧 Web 版（Next.js，git tag `v1.0.0` ~ `v1.3.0`）已整体废弃，仅作历史归档，**禁止模仿旧代码结构与风格**；仅两处资产可迁移：设备壳 PNG（`git show v1.3.0:public/<device>.png` 恢复）与排版坐标数据（已收录进 PLAN.md 第二节）。
- 单用户本地工具：无账号、无服务端、离线可用（访问目标网站除外）。
- UI 文案使用简体中文；代码标识符、注释使用英文。

## 二、技术栈（锁定，不得擅自更换）

| 层 | 选型 |
| --- | --- |
| 应用壳 | Electron + electron-vite + electron-builder |
| UI | React 19 + TypeScript (strict) + Tailwind CSS v4 + **@heroui/react v3** |
| 截图引擎 | **puppeteer-core**（控制本机 Chrome/Edge）+ @puppeteer/browsers（缺失时下载 Chromium 到 userData） |
| 持久化 | electron-store（设置 / 自定义模板 / 最近 URL） |
| 包管理 | pnpm |

**禁止引入**：`sonner`（Toast 一律用 HeroUI 内置）、`radix-ui`、`framer-motion` / `motion`（HeroUI v3 动画为 CSS 内置）、任何 Next.js 包、组件库第二选项。

## 三、强制 Skill 规则

本项目所有 React / UI 代码的生成必须同时遵循以下两个本地 Skill，二者位于 `.agents/skills/`：

### 1. heroui-react —— UI 组件规范（HeroUI v3）

- **只用 v3 API，禁止套用 v2 模式**：无需任何 Provider；组件一律用复合写法（`<Card><Card.Header>…`），不用扁平 props；动画为 CSS 内置，不装 framer-motion。
- **布局与控件优先使用 HeroUI 内置组件**（Button / Input / Select / Modal / Tabs / Tooltip / Slider / Toast 等）；只有 HeroUI 确实没有的部件才手写，且手写部分须与 HeroUI 视觉语言一致。
- 实现某个组件前，先用 Skill 脚本查最新文档再写：
  ```bash
  node .agents/skills/heroui-react/scripts/list_components.mjs
  node .agents/skills/heroui-react/scripts/get_component_docs.mjs Button Card Modal
  ```
- 事件用 `onPress`，不用 `onClick`；variant 用语义名（`primary` / `secondary` / `danger` / `ghost`…），禁止裸颜色值。
- Tailwind CSS v4 强制（不兼容 v3）；CSS 中 `@import "tailwindcss"` 必须位于 `@import "@heroui/styles"` 之前。
- 主题：oklch CSS 变量体系，暗色用 `.dark` class + `data-theme="dark"`，参考 `get_theme.mjs` 输出。
- Toast 一律使用 HeroUI 内置组件。

### 2. vercel-react-best-practices —— React 性能规范

完整规则见 `.agents/skills/vercel-react-best-practices/rules/`（40+ 条，按影响分级），**红线条目**：

- 消灭瀑布：相互独立的异步操作一律 `Promise.all` 并行；`await` 下推到真正使用它的分支。
- 包体：禁止裸 barrel import（`lucide-react` 等图标库尤其注意）；重组件/低频功能动态 `import()`。
- 重渲染：禁止在组件内部定义组件；`setState` 依赖旧值时用函数式更新；不要用 `useMemo` 包裹结果为原始值的简单表达式。
- 渲染：交互触发的逻辑放事件处理函数，不建「状态 + effect」回路；effect 依赖收窄到原始值。
- 本地存储：localStorage/electron-store 的 key 带版本号、只存必要字段、读写包 try-catch。

## 四、架构约定

### 目标目录结构

```
preview-craft/
├─ package.json               # electron + electron-vite + electron-builder
├─ electron.vite.config.ts
├─ resources/
│  └─ icon.*                  # 应用图标（P5 添加；设备壳已改为 CSS 绘制，无壳图资源）
├─ src/
│  ├─ main/                   # 主进程（Node 环境）
│  │  ├─ index.ts             # 窗口创建与生命周期
│  │  ├─ browser.ts           # 本机浏览器检测 / Chromium 下载
│  │  ├─ capture.ts           # 截图引擎（puppeteer-core）
│  │  ├─ export.ts            # 隐藏窗口高分辨率合成导出
│  │  └─ store.ts             # electron-store
│  ├─ preload/index.ts        # contextBridge，唯一 IPC 入口
│  └─ renderer/               # React + HeroUI
│     ├─ components/          # UrlBar / DeviceFrame / Canvas / TemplateGallery / StylePanel / ExportPanel
│     ├─ templates/           # 模板 schema + 5 套预设 + 背景板
│     └─ hooks/
├─ docs/PLAN.md               # 开发计划（阶段任务 + 进度追踪）
└─ .agents/skills/            # 强制 Skill（见第三节）
```

### 进程与安全基线

- 主进程 / preload / renderer 三层分离；`contextIsolation: true`、`nodeIntegration: false`、renderer 走 sandbox。
- renderer 只能通过 preload 暴露的 `window.api.*` 调用主进程，禁止在 renderer 直接 require Node/Electron。
- IPC channel 按命名空间：`browser:detect`、`capture:start`、`capture:progress`（事件）、`export:compose`、`export:save`、`export:clipboard`、`settings:get`、`settings:set`。入参出参全部定义 TS 类型，类型文件放 `src/shared/types.ts` 供三层共用。

## 五、工作流约定

- **提交规范**：Conventional Commits，中文描述（`feat: 新增模板画廊`、`fix: 修复截图超时`）；每完成一个阶段任务至少提交一次，禁止把多阶段混进一个 commit。
- **每阶段完成必须**：① `pnpm typecheck` 与 `pnpm lint` 零错误；② 跑通 PLAN.md 中该阶段的「自验」；③ 勾选 PLAN.md「进度追踪」对应项并补一行执行记录。
- **遇到方案级分歧**（技术选型、目录调整、依赖变更）：停下记录到 PLAN.md「待确认」节，不得擅自定夺。
- 依赖安装前先确认 `.npmrc` 的 Electron 镜像配置存在（国内网络环境）。
