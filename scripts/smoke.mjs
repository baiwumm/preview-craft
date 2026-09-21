/**
 * PreviewCraft 全量冒烟测试（常驻回归基线）。
 *
 * A 段：纯逻辑断言 —— Node 直跑 src 下 TS，无需构建产物与 Electron。
 * B 段：真实应用端到端 —— 起 out/ 产物 + CDP 驱动，覆盖 IPC 契约与界面交互。
 *
 * 用法：
 *   pnpm build && node scripts/smoke.mjs
 *   --only=logic|e2e   只跑一段
 *   --exe=<path>       改打打包产物（如 release/win-unpacked/PreviewCraft.exe），
 *                      用于验证 NSIS 版内链路；默认跑未打包的 out/
 *   --site=<url>       截图/导出站点（默认 https://github.com）
 *   --port=<n>         CDP 端口（默认 9344）
 *   --keep-profile     保留 .smoke-profile（默认每次删除，以便断言默认设置）
 *
 * 隔离：应用以 --user-data-dir 指到 .smoke-profile 启动，不改写用户 %APPDATA%\preview-craft，
 *       末尾比对真实 settings.json 哈希作为兜底断言。唯一共享路径是 %TEMP%\preview-craft
 *       （截图/导出产物），所以清除缓存放在最后，且产物先复制到 .smoke-out/ 供目检。
 */
import { execSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

// 直跑 src 下 .ts 时的无害提示（package.json 无 type 字段），压掉以免淹没日志
process.on('warning', (warning) => {
  if (warning.code !== 'MODULE_TYPELESS_PACKAGE_JSON') console.warn(warning);
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, '.smoke-out');
const PROFILE_DIR = join(ROOT, '.smoke-profile');
const LOG_FILE = join(OUT_DIR, 'smoke.log');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = flag('only', '');
const SITE = flag('site', 'https://github.com');
const PORT = Number(flag('port', 9344));
const EXE = flag('exe', '');
const KEEP_PROFILE = argv.includes('--keep-profile');

const BAD_HOST = 'https://preview-craft-smoke-nonexistent.invalid';
const MOBILE_OVERRIDE_URL = 'https://example.com';
const ALL_DEVICES = ['desktop', 'laptop', 'tablet', 'mobile'];
const CAPTURE_TIMEOUT = 300_000;

/** 本地内嵌探测夹具页：/deny 带 X-Frame-Options，/open 不带 */
const EMBED_FIXTURE_HTML = '<!doctype html><title>embed fixture</title><p>preview-craft smoke embed fixture</p>';

const results = [];
const skips = [];
const pageErrors = [];

function log(line) {
  const clean = String(line).replace(/\0/g, '');
  console.log(clean);
  appendFileSync(LOG_FILE, `${clean}\n`, 'utf8');
}

function check(name, pass, detail = '') {
  results.push({ name, pass: Boolean(pass), detail });
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
}

/**
 * 依赖外部条件的断言走不通时显式记一笔：跳过的断言不进分母，于是「112/112 全绿」
 * 看着像满覆盖，实际那条用户可见的分支这一轮根本没人验过。
 */
function skip(name, reason) {
  skips.push({ name, reason });
  log(`SKIP  ${name} — ${reason}`);
}

function section(title) {
  log(`\n----- ${title} -----`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const human = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${(bytes / 1024).toFixed(0)}KB`);

/** 软执行：等待类操作失败时记日志并返回 null，让后续断言带着真实状态报 FAIL，而不是整轮中止 */
async function soft(label, fn) {
  try {
    return await fn();
  } catch (error) {
    log(`      [soft] ${label} — ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    return null;
  }
}

/* ---------------------------------------------------------------- 图像工具 */

function pngColorType(buf) {
  return buf.readUInt8(25);
}

function pngDims(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const isPng = (buf) => buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
const isJpeg = (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
const isWebp = (buf) => buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';

/**
 * 在渲染进程内解码，拿到真实尺寸与四角/中心采样（用于 alpha 断言）。
 * 用 Image 元素而非 fetch：应用 CSP 的 connect-src 不含 data:，fetch 会被拒（img-src 含 data:）。
 */
async function inspectImage(page, filePath) {
  const buf = await readFile(filePath);
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1);
  const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext];
  return page.evaluate(
    (data) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error('图片解码失败'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const at = (x, y) => {
            const d = ctx.getImageData(x, y, 1, 1).data;
            return { r: d[0], g: d[1], b: d[2], a: d[3] };
          };
          resolve({
            width: img.naturalWidth,
            height: img.naturalHeight,
            corners: [at(0, 0), at(img.naturalWidth - 1, 0), at(0, img.naturalHeight - 1), at(img.naturalWidth - 1, img.naturalHeight - 1)],
            center: at(Math.floor(img.naturalWidth / 2), Math.floor(img.naturalHeight / 2))
          });
        };
        img.src = data;
      }),
    `data:${mime};base64,${buf.toString('base64')}`
  );
}

const minCornerAlpha = (info) => Math.min(...info.corners.map((c) => c.a));

/* ------------------------------------------------------------ 页面交互工具 */

/** 按 CSS 选择器 + 文本定位并返回矩形，供真实指针点击使用（React Aria 不认 element.click） */
function locator(selector, text, exact = true) {
  return `(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = nodes.find((n) => ${
      exact ? `n.textContent.trim() === ${JSON.stringify(text)}` : `n.textContent.includes(${JSON.stringify(text)})`
    } && n.getBoundingClientRect().width > 0);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`;
}

function attrLocator(selector, attr, value) {
  return `(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((n) => (n.getAttribute(${JSON.stringify(attr)}) || '').includes(${JSON.stringify(value)}));
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`;
}

async function tap(page, expr) {
  const box = await page.evaluate(expr);
  if (!box) return false;
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  return true;
}

/**
 * 把窗口拉到系统前台。React Aria 会把「夺焦后的第一下点击」用于聚焦窗口本身而不派发
 * onPress，键入也会落空 —— 冒烟跑在你还在用鼠标的桌面上时，这会让一处交互失败并
 * 引发整段连锁，所以每段 UI 交互前显式前置一次。
 */
async function focusAppWindow(page) {
  await soft('窗口置前', () => page.bringToFront());
  await page.evaluate(() => window.focus());
  await sleep(250);
}

/** 用 Esc 清场：键盘事件经 CDP 直达渲染进程，不受系统焦点影响，比点「取消」可靠 */
async function closeAllDialogs(page) {
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(
      () => [...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0)
    );
    if (!open) return true;
    await page.keyboard.press('Escape');
    await sleep(500);
    // Esc 后节点还挂着，多半是页面掉到 hidden 生命周期导致退场动画从未起跑 —— 就地自救
    const stillUp = await page.evaluate(
      () => [...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0)
    );
    if (stillUp) {
      await reviveHiddenPage(page);
      await forceFinishAnimations(page);
      await sleep(250);
    }
  }
  return page.evaluate(
    () => ![...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0)
  );
}

/**
 * 窗口不可见时的自救。两条独立手段，按现场证据分工：
 * - 页面掉到 hidden 生命周期时 CSS 动画**根本不会被创建**（实测 anims 为空、
 *   而 timeline 仍在推进），所以先经 CDP 把生命周期拉回 active，动画才会起跑；
 * - 已经在飞的退场动画用 finish() 立刻落到终态并派发 animationend
 *   （HeroUI Modal 靠它卸载节点；无限循环动画 finish() 会抛，忽略即可）。
 * 遮罩 .modal__backdrop 不消失会吞掉后续每一次点击，一处卡死就磨出一串假 FAIL。
 */
async function reviveHiddenPage(page) {
  try {
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await cdp.detach().catch(() => undefined);
    await sleep(400);
    return await page.evaluate(() => document.visibilityState);
  } catch {
    return null;
  }
}

async function forceFinishAnimations(page) {
  try {
    return await page.evaluate(() => {
      let n = 0;
      for (const a of document.getAnimations?.() ?? []) {
        try {
          a.finish();
          n += 1;
        } catch {
          /* 无限迭代动画不能 finish，跳过 */
        }
      }
      return n;
    });
  } catch {
    return 0;
  }
}

/**
 * 清空并输入。三击选中在受控 Input 上不可靠（选中没生效时会把新串拼到旧串后面），
 * 改用 focus + Ctrl+A + Backspace，输入后回读校验；不匹配就重试——弹窗挂载动画期间
 * 键入会整批丢失（实测留下空输入框，「保存」被 if (!trimmed) return 挡回、弹窗不关，
 * 后续断言全被遮罩吃掉）。
 */
async function typeInto(page, selector, text) {
  const ready = await soft(`等待输入框 ${selector}`, () => page.waitForSelector(selector, { visible: true, timeout: 10_000 }));
  if (!ready) return null;
  let actual = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await focusAppWindow(page);
    await soft(`聚焦输入框 ${selector}`, () => page.focus(selector));
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    if (text) await soft(`键入 ${text}`, () => page.type(selector, text, { delay: 12 }));
    actual = await page.evaluate((s) => document.querySelector(s)?.value ?? null, selector);
    if (!text || actual === text) return actual;
    log(`      [warn] ${selector} 第 ${attempt} 次输入未生效（实际「${actual}」），重试`);
    await sleep(400);
  }
  return actual;
}

const bodyText = (page) => page.evaluate(() => document.body.innerText);

const canvasState = (page) =>
  page.evaluate(() => ({
    frames: [...document.querySelectorAll('main iframe')].map((f) => ({ title: f.title, src: f.src })),
    images: [...document.querySelectorAll('main img')].map((i) => i.alt),
    retry: [...document.querySelectorAll('main button')].filter((b) => b.textContent.trim() === '重试').length,
    busyMask: Boolean(document.querySelector('[aria-label="任务进度"]')),
    rotated: document.querySelectorAll('main [style*="rotate("]').length
  }));

const canvasBorderRadius = (page) =>
  page.evaluate(() => {
    const box = [...document.querySelectorAll('main div[style]')].find((el) => el.style.borderRadius);
    return box ? getComputedStyle(box).borderRadius : null;
  });

/* ============================================================== A. 纯逻辑 */

async function runLogicSection() {
  section('A. 纯逻辑（URL / 设备几何 / 模板 / 背景 / 会话样式 / 错误归因）');

  const { normalizeUrl } = await import('../src/shared/url.ts');
  const { devicePresets, deviceIds } = await import('../src/shared/devices.ts');
  const { presets, CANVAS_BASE } = await import('../src/renderer/templates/presets.ts');
  const { backgrounds, resolveBackgroundCss, isTransparentBackground } = await import('../src/renderer/templates/backgrounds.ts');
  const { defaultStyle, cloneTemplate, isTemplateModified, buildCustomBackground } = await import('../src/renderer/src/lib/design.ts');
  const { describeCaptureError, formatBytes, describeBrowserKind } = await import('../src/renderer/src/lib/format.ts');
  const { compareVersions } = await import('../src/shared/version.ts');

  check('normalizeUrl 无协议时补 https', normalizeUrl('github.com') === 'https://github.com/', String(normalizeUrl('github.com')));
  check('normalizeUrl 保留路径与哈希', normalizeUrl('https://a.b/c?d=1#e') === 'https://a.b/c?d=1#e');
  check('normalizeUrl 拒绝含空白串', normalizeUrl('not a valid url') === null && normalizeUrl('http://a b.com') === null);
  check('normalizeUrl 拒绝非 http(s) 协议', normalizeUrl('javascript:alert(1)') === null && normalizeUrl('file:///C:/x') === null);
  check('normalizeUrl 拒绝 userinfo', normalizeUrl('https://user:pw@github.com') === null);
  check('normalizeUrl 拒绝无点主机与空串', normalizeUrl('localhost') === null && normalizeUrl('   ') === null);

  const geometry = deviceIds.map((id) => {
    const p = devicePresets[id];
    return { id, got: p.viewport.height, expect: Math.round((p.viewport.width * p.frame.inner.height) / p.frame.inner.width) };
  });
  check('viewport 高度按内屏宽高比换算', geometry.every((g) => g.got === g.expect), geometry.map((g) => `${g.id}:${g.got}/${g.expect}`).join(' '));
  const shotDims = deviceIds.map((id) => {
    const v = devicePresets[id].viewport;
    return `${id} ${v.width * 2}x${v.height * 2}`;
  });
  check(
    '2x 截图尺寸符合预设',
    shotDims.join(' | ') === 'desktop 2880x1900 | laptop 2732x1782 | tablet 1536x2040 | mobile 780x1680',
    shotDims.join(' | ')
  );
  check(
    'UA 与 isMobile/hasTouch 特征正确',
    devicePresets.desktop.isMobile === false && devicePresets.desktop.hasTouch === false && devicePresets.tablet.isMobile === true && devicePresets.tablet.hasTouch === true && /iPad/.test(devicePresets.tablet.ua) && /iPhone/.test(devicePresets.mobile.ua) && /Windows NT/.test(devicePresets.desktop.ua)
  );
  check(
    '内屏几何落在机身范围内',
    deviceIds.every((id) => {
      const { inner, shell } = devicePresets[id].frame;
      return inner.x >= 0 && inner.y >= 0 && inner.x + inner.width <= shell.body.x + shell.body.w + 1 && inner.y + inner.height <= shell.body.y + shell.body.h + 1;
    })
  );
  // 机身之上的部件画在内屏之下、内屏之上的开孔画在内屏裁剪层里，两者落点错了就等于白画
  check(
    '壳体 over 部件不与内屏相交',
    deviceIds.every((id) => {
      const { inner, shell } = devicePresets[id].frame;
      return shell.over.every((p) => p.x >= inner.x + inner.width - 0.5 || p.x + p.w <= inner.x + 0.5 || p.y >= inner.y + inner.height - 0.5 || p.y + p.h <= inner.y + 0.5);
    })
  );
  check(
    '内屏开孔落在内屏内',
    deviceIds.every((id) => {
      const { inner, shell } = devicePresets[id].frame;
      if (!shell.island) return true;
      const i = shell.island;
      return i.x >= inner.x && i.y >= inner.y && i.x + i.w <= inner.x + inner.width && i.y + i.h <= inner.y + inner.height;
    })
  );
  check(
    '支架部件不越出机身外接盒',
    deviceIds.every((id) => {
      const { frame } = devicePresets[id];
      return frame.shell.under.every((p) => p.x >= -0.5 && p.x + p.w <= frame.width + 0.5 && p.y + p.h <= frame.width / frame.aspect + 0.5);
    })
  );

  check('预设 5 套且 id 唯一', presets.length === 5 && new Set(presets.map((t) => t.id)).size === 5, presets.map((t) => t.id).join(','));
  check('画布基准统一 1120×870', presets.every((t) => t.canvas.width === CANVAS_BASE.width && t.canvas.height === CANVAS_BASE.height));
  check('每套预设设备不重复且 ≥2 台', presets.every((t) => new Set(t.placements.map((p) => p.device)).size === t.placements.length && t.placements.length >= 2));

  const overflow = [];
  for (const t of presets) {
    for (const p of t.placements) {
      const h = p.width / devicePresets[p.device].frame.aspect;
      const rad = ((p.rotation ?? 0) * Math.PI) / 180;
      const bw = Math.abs(p.width * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
      const bh = Math.abs(p.width * Math.sin(rad)) + Math.abs(h * Math.cos(rad));
      const cx = p.x + p.width / 2;
      const cy = p.y + h / 2;
      if (cx - bw / 2 < -0.5 || cy - bh / 2 < -0.5 || cx + bw / 2 > CANVAS_BASE.width + 0.5 || cy + bh / 2 > CANVAS_BASE.height + 0.5) {
        overflow.push(`${t.id}/${p.device}`);
      }
    }
  }
  check('设备完整入画（含旋转外接盒）', overflow.length === 0, overflow.join(','));
  check('仅 editorial 使用 rotation', presets.filter((t) => t.placements.some((p) => p.rotation)).map((t) => t.id).join(',') === 'editorial');
  check('背景 key 均有色板', presets.every((t) => backgrounds.some((b) => b.key === t.background)), presets.map((t) => t.background).join(','));

  /* --- 构图口径：光学留白 / 居中 / 画面占比 / 前景遮挡后景屏幕 --- */
  const rectOf = (p, part) => {
    const { frame } = devicePresets[p.device];
    const k = p.width / frame.width;
    const outerH = p.width / frame.aspect;
    const box =
      part === 'screen'
        ? { x: frame.inner.x * k, y: frame.inner.y * k, w: frame.inner.width * k, h: frame.inner.height * k }
        : { x: 0, y: 0, w: p.width, h: outerH };
    return {
      x: p.x + box.x,
      y: p.y + box.y,
      w: box.w,
      h: box.h,
      rot: p.rotation ?? 0,
      // 旋转围绕机身外接盒中心（CSS transform-origin 默认 50% 50%），内屏要按同一轴心折算
      ax: p.x + p.width / 2,
      ay: p.y + outerH / 2
    };
  };
  const aabb = (r) => {
    const rad = (r.rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const dx = r.x + r.w / 2 - r.ax;
    const dy = r.y + r.h / 2 - r.ay;
    const cx = r.ax + dx * Math.cos(rad) - dy * Math.sin(rad);
    const cy = r.ay + dx * Math.sin(rad) + dy * Math.cos(rad);
    const w = r.w * cos + r.h * sin;
    const h = r.w * sin + r.h * cos;
    return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
  };
  const inter = (a, b) => {
    const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    return w <= 0 || h <= 0 ? 0 : w * h;
  };

  const flaws = [];
  for (const t of presets) {
    const boxes = t.placements.map((p) => aabb(rectOf(p, 'outer')));
    const left = Math.min(...boxes.map((b) => b.x1));
    const right = CANVAS_BASE.width - Math.max(...boxes.map((b) => b.x2));
    const top = Math.min(...boxes.map((b) => b.y1));
    const bottom = CANVAS_BASE.height - Math.max(...boxes.map((b) => b.y2));
    if (left < 88 || right < 88 || top < 60 || bottom < 60) {
      flaws.push(`${t.id} 留白不足 L${left.toFixed(0)}/R${right.toFixed(0)}/T${top.toFixed(0)}/B${bottom.toFixed(0)}`);
    }
    const offset = (left - right) / 2;
    if (Math.abs(offset) > 10) flaws.push(`${t.id} 水平偏心 ${offset.toFixed(1)}px`);
    if (Math.abs(top - bottom) > 34) flaws.push(`${t.id} 上下失衡 T${top.toFixed(0)}/B${bottom.toFixed(0)}`);
    const fill = Math.max((CANVAS_BASE.width - left - right) / CANVAS_BASE.width, (CANVAS_BASE.height - top - bottom) / CANVAS_BASE.height);
    if (fill < 0.68) flaws.push(`${t.id} 画面占比仅 ${(fill * 100).toFixed(0)}%`);
    for (let i = 0; i < t.placements.length; i++) {
      for (let j = i + 1; j < t.placements.length; j++) {
        const screen = aabb(rectOf(t.placements[i], 'screen'));
        const cover = aabb(rectOf(t.placements[j], 'outer'));
        const ratio = inter(screen, cover) / ((screen.x2 - screen.x1) * (screen.y2 - screen.y1));
        if (ratio > 0.12) {
          flaws.push(`${t.id} ${t.placements[i].device} 屏幕被 ${t.placements[j].device} 压住 ${(ratio * 100).toFixed(0)}%`);
        }
      }
    }
  }
  check('预设构图口径（留白/居中/占比/遮挡）', flaws.length === 0, flaws.join('；') || '五套全过');

  const rowPreset = presets.find((t) => t.id === 'row');
  const rowBottoms = rowPreset.placements.map((p) => p.y + p.width / devicePresets[p.device].frame.aspect);
  check(
    '有序陈列四台底边同一地平线',
    Math.max(...rowBottoms) - Math.min(...rowBottoms) <= 0.6,
    rowBottoms.map((b) => b.toFixed(1)).join('/')
  );
  const rowBoxes = rowPreset.placements
    .map((p) => ({ x1: p.x, x2: p.x + p.width }))
    .sort((a, b) => a.x1 - b.x1);
  const rowGaps = rowBoxes.slice(1).map((b, i) => b.x1 - rowBoxes[i].x2);
  check('有序陈列相邻设备等距且不相叠', rowGaps.every((g) => Math.abs(g - rowGaps[0]) < 0.6 && g > 0), rowGaps.join('/'));

  check('背景板 15 块含透明底', backgrounds.length === 15 && isTransparentBackground('transparent'));
  // ColorSwatchPicker 用代表色的 hexa 当选中 key，两块撞同色会同时高亮
  check(
    '背景板代表色互不相同',
    new Set(backgrounds.map((b) => b.color)).size === backgrounds.length,
    backgrounds.map((b) => b.color).join(',')
  );
  check('背景板每块都有可解析代表色', backgrounds.every((b) => /^#[0-9a-f]{6}$/i.test(b.color)));
  check('resolveBackgroundCss 渐变底为多层', resolveBackgroundCss('sunset-flare').includes('radial-gradient') && resolveBackgroundCss('sunset-flare').includes('linear-gradient'));
  check('resolveBackgroundCss 纯色底为单值', resolveBackgroundCss('white') === '#ffffff');
  check('resolveBackgroundCss 解析 custom 前缀', resolveBackgroundCss('custom:#111,#222') === '#111,#222');
  check('resolveBackgroundCss 未知 key 回落首块', resolveBackgroundCss('nope') === backgrounds[0].value);
  check('透明底仅 PNG 留空、JPG 垫白', resolveBackgroundCss('transparent') === 'transparent' && resolveBackgroundCss('transparent', true) === '#ffffff');

  const original = presets[0];
  const cloned = cloneTemplate(original);
  cloned.placements[0].x += 7;
  check('cloneTemplate 深拷贝不改源模板', original.placements[0].x !== cloned.placements[0].x && original.canvas !== cloned.canvas);
  check('isTemplateModified 识别排版改动', isTemplateModified(cloned, original) === true && isTemplateModified(cloneTemplate(original), original) === false);
  check('isTemplateModified 无来源时判未改', isTemplateModified(cloned, undefined) === false);
  check('buildCustomBackground 生成 custom 前缀', buildCustomBackground('#aaa', '#bbb') === 'custom:linear-gradient(135deg, #aaa, #bbb)');

  // AGENTS.md 第三节红线：setState 的更新函数里不许发 IPC —— StrictMode 下更新函数双调用，
  // dev 会真发两次写盘。这条没有外部可观测行为（模板 id 是时间戳 upsert，双发只留一条），
  // 所以按旧代码的具体形状做静态判据，能挡住同样的写法被改回去。
  const appSrc = await readFile(join(ROOT, 'src/renderer/src/App.tsx'), 'utf8');
  const ipcInUpdater = [...appSrc.matchAll(/set[A-Za-z]+\(\(prev\) => \{\s*if \(window\.api\)/g)].map((m) => m[0].trim());
  check('setState 更新函数内不发 IPC', ipcInUpdater.length === 0, ipcInUpdater.join(' | '));
  check('会话默认样式基线', defaultStyle.borderRadius === 12 && defaultStyle.shadow === true && defaultStyle.zoom === 1, `圆角=${defaultStyle.borderRadius}`);

  check('错误归因·超时', describeCaptureError('Navigation timeout of 30000 ms exceeded').includes('加载超时'));
  check('错误归因·DNS', describeCaptureError('net::ERR_NAME_NOT_RESOLVED').includes('域名无法解析'));
  check('错误归因·连接中断', describeCaptureError('net::ERR_CONNECTION_RESET').includes('连接被中断'));
  check('错误归因·证书', describeCaptureError('net::ERR_CERT_AUTHORITY_INVALID').includes('证书'));
  check('错误归因·浏览器启动失败', describeCaptureError('Failed to launch the browser process!').includes('浏览器启动失败'));
  check('错误归因·未归类保留错误码', describeCaptureError('net::ERR_SOMETHING_NEW') === '站点不可达（ERR_SOMETHING_NEW）', describeCaptureError('net::ERR_SOMETHING_NEW'));
  check('错误归因·空值与超长兜底', describeCaptureError(undefined) === '截图失败' && describeCaptureError('x'.repeat(200)).endsWith('…'));
  check('浏览器种类中文名', describeBrowserKind('chrome') === 'Chrome' && describeBrowserKind('edge') === 'Edge');
  check('formatBytes 边界', formatBytes(0) === '0 B' && formatBytes(1023) === '1023 B' && /KB$/.test(formatBytes(2048)) && /MB$/.test(formatBytes(111 * 1024 * 1024)), `${formatBytes(0)}|${formatBytes(1023)}|${formatBytes(2048)}|${formatBytes(111 * 1024 * 1024)}`);

  check(
    'compareVersions 按段数字比较',
    compareVersions('2.1.2', '2.1.1') === 1 &&
      compareVersions('2.1.1', '2.1.2') === -1 &&
      compareVersions('2.1.2', '2.1.2') === 0 &&
      compareVersions('v2.2.0', '2.2.0') === 0 &&
      compareVersions('2.10.0', '2.9.9') === 1 &&
      compareVersions('2.1', '2.1.0') === 0
  );

  /* 内嵌判定：应用侧是 file://（对站点等于 null 源），故 SAMEORIGIN / 'self' 都算被拦 */
  const { judgeEmbedding } = await import('../src/main/probe.ts');
  const headers = (init) => new Headers(init);
  check('判定 X-Frame-Options: DENY', judgeEmbedding(headers({ 'x-frame-options': 'deny' })).blocked === true);
  check('判定 X-Frame-Options: SAMEORIGIN', judgeEmbedding(headers({ 'x-frame-options': 'SAMEORIGIN' })).blocked === true);
  check(
    '判定 CSP frame-ancestors: none',
    judgeEmbedding(headers({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" })).blocked === true
  );
  check(
    '判定 CSP frame-ancestors: self 也算拦',
    judgeEmbedding(headers({ 'content-security-policy': "frame-ancestors 'self'" })).blocked === true
  );
  check('判定 frame-ancestors * 放行', judgeEmbedding(headers({ 'content-security-policy': 'frame-ancestors *' })).blocked === false);
  check(
    '判定无相关响应头时放行且视为已探到',
    judgeEmbedding(headers({ 'content-type': 'text/html' })).blocked === false && judgeEmbedding(headers({})).probed === true
  );

  /* 应用图标必须是带 alpha 的 RGBA：曾用 Chrome 截图生成图标时漏了 omitBackground，
     产物退化成 RGB，圆角外变成不透明白底，任务栏与缩略图就带出一圈白方块。 */
  const iconBuf = await readFile(join(ROOT, 'resources', 'icon.png'));
  const iconPng = iconBuf[0] === 0x89 && iconBuf[1] === 0x50;
  check(
    '应用图标为 512×512 带 alpha 的 RGBA',
    iconPng && iconBuf.readUInt8(24) === 8 && iconBuf.readUInt8(25) === 6 && pngDims(iconBuf).width === 512 && pngDims(iconBuf).height === 512,
    `colorType=${iconBuf.readUInt8(25)}（6=RGBA）bitDepth=${iconBuf.readUInt8(24)} ${pngDims(iconBuf).width}x${pngDims(iconBuf).height}`
  );
}

/* ========================================================= B. 真实应用 E2E */

/**
 * 列出「不是本轮冒烟起的」应用进程（命令行里没有 smoke-profile 的那些）。
 * 「未污染用户真实设置」只比对真实 settings.json 的前后哈希，而用户自己开的 dev 实例
 * （`electron .` 不带 --user-data-dir）同样在写这个文件 —— 2.2.0 发布轮就因此假红过一次，
 * 取证是 PID 1900 那个实例在冒烟中途写了真实档案。分不清污染与并发使用的断言不该判红。
 * 脚本内容必须纯 ASCII：PowerShell 5.1 按 GBK 读无 BOM 的 UTF-8，中文会把引号吞掉。
 */
function findForeignAppProcesses() {
  const psFile = join(OUT_DIR, 'foreign-apps.ps1');
  writeFileSync(
    psFile,
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('electron.exe','PreviewCraft.exe') -and $_.CommandLine -notlike '*smoke-profile*' } | ForEach-Object { Write-Output ($_.ProcessId.ToString() + ':' + $_.Name) }\n",
    'utf8'
  );
  try {
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { encoding: 'utf8' });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** 只清理上一轮冒烟自己的实例（按 user-data-dir 特征匹配），不动其他 Electron 应用 */
function killStraySmokeInstances() {
  const psFile = join(OUT_DIR, 'kill-stray.ps1');
  writeFileSync(
    psFile,
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('electron.exe','PreviewCraft.exe') -and $_.CommandLine -like '*smoke-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\n",
    'utf8'
  );
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, { stdio: 'ignore' });
  } catch {
    /* 无残留实例 */
  }
}

async function connectMain(port) {
  let browser = null;
  let page = null;
  let last = '未开始';
  for (let i = 0; i < 75 && !page; i++) {
    await sleep(1000);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const target = list.find((t) => t.type === 'page' && t.url.includes('index.html') && !t.url.includes('#/export'));
      if (!target) {
        last = `未见主窗口 target（${list.length} 个）`;
        continue;
      }
      const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      // Electron 不支持 Target.createTarget，只能枚举既有 page
      browser = await puppeteer.connect({ browserWSEndpoint: ver.webSocketDebuggerUrl, defaultViewport: null });
      page = (await browser.pages()).find((p) => p.url().includes('index.html') && !p.url().includes('#/export'));
      if (!page) {
        last = '已连接但找不到主窗口页面';
        await browser.disconnect();
        browser = null;
      }
    } catch (error) {
      last = `${error.message}${error.cause?.code ? ` / ${error.cause.code}` : ''}`;
    }
    if (i % 10 === 9) log(`[poll ${i + 1}] ${last}`);
  }
  return { browser, page, last };
}

async function runAppSection() {
  section(`B. 真实应用端到端（CDP，站点 ${SITE}，目标 ${EXE || 'out/ 未打包产物'}）`);

  if (!EXE && !existsSync(join(ROOT, 'out', 'main', 'index.js'))) {
    check('构建产物存在', false, '缺少 out/main/index.js，请先 pnpm build');
    return;
  }
  if (EXE && !existsSync(EXE)) {
    check('指定的可执行文件存在', false, `找不到 ${EXE}`);
    return;
  }

  const { devicePresets } = await import('../src/shared/devices.ts');
  const { presets } = await import('../src/renderer/templates/presets.ts');
  const pkgVersion = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
  const classic = presets.find((t) => t.id === 'classic');
  const editorial = presets.find((t) => t.id === 'editorial');
  const electronPath = EXE ? null : (await import('electron')).default;
  const bin = EXE || electronPath;
  // 未打包时用 `electron .` 而非 `electron out/main/index.js`：后者把 app path 定到
  // out/main/（那里没有 package.json），app.getVersion() 会退化成 Electron 版本号。
  //
  // 三个反节流开关是必需的：冒烟跑在你还在用鼠标的桌面上，窗口会被判为 occluded /
  // 后台，Chromium 节流 rAF 后 HeroUI 弹窗的退场动画永不结束 —— 节点不卸载，遮罩
  // 还在，后续每次点击都被吞掉，一处失败就连锁十几条（曾误判为应用缺陷）。
  const ANTI_THROTTLE = [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling'
  ];
  const launchArgs = (debugPort) => [
    ...(EXE ? [] : ['.']),
    ...ANTI_THROTTLE,
    ...(debugPort ? [`--remote-debugging-port=${debugPort}`] : []),
    `--user-data-dir=${PROFILE_DIR}`
  ];

  const appData = process.env.APPDATA ? join(process.env.APPDATA, 'preview-craft') : null;
  const realSettings = appData && existsSync(join(appData, 'settings.json')) ? join(appData, 'settings.json') : null;
  const hashFile = async (p) => (p ? createHash('sha1').update(await readFile(p)).digest('hex') : 'absent');
  const realHashBefore = await hashFile(realSettings);
  const foreignBefore = findForeignAppProcesses();

  killStraySmokeInstances();
  await sleep(1000);
  if (!KEEP_PROFILE) await rm(PROFILE_DIR, { recursive: true, force: true });

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(bin, launchArgs(PORT), {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (d) => {
    const s = d.toString().trim();
    if (s && !s.includes('DevTools')) log(`[electron] ${s}`);
  });

  const { browser, page, last } = await connectMain(PORT);
  if (!page) {
    check('连接主窗口', false, `${last}（若有其他 PreviewCraft 实例在跑会导致单实例锁拦截）`);
    child.kill('SIGKILL');
    return;
  }
  check('连接主窗口', true, page.url().slice(0, 70));
  page.on('pageerror', (error) => pageErrors.push(String(error.message)));

  const calls = [];
  const api = (name, ...args) => {
    calls.push(name);
    return page.evaluate(
      async ({ n, a }) => {
        const fn = window.api?.[n];
        if (typeof fn !== 'function') throw new Error(`bridge 缺少方法 ${n}`);
        return fn(...a);
      },
      { n: name, a: args }
    );
  };

  /** 本地内嵌夹具站点，在 try 内起、finally 关（声明必须在外层，否则 finally 取不到） */
  let embedServer = null;

  try {
    /** 弹窗是否仍在（HeroUI Modal 关闭后节点移除，按可见高度判断） */
    const modalOpen = () =>
      page.evaluate(() => [...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0));

    /**
     * 窗口不再产帧时（锁屏 / 熄屏 / 被最小化），CSS 动画的时间轴冻在原地，
     * animationend 永不到达 —— 已关闭的弹窗节点不卸载，遮罩吞掉后续每一次点击，
     * 一处环境干扰就伪装成十几条应用缺陷（2.1.3 装机收口时踩到 15 条）。连着两次
     * 取证到这种状态就判红收工，别让人去查不存在的 bug。
     * 判据只用 visibilityState：被别的窗口盖住并不会冻结（实测），而空闲页面本来
     * 就可以不推进 timeline，拿它当条件会误杀正常的失败现场。
     */
    let frozenScenes = 0;

    /**
     * 等某个 DOM 条件成立。打包版整体比 out/ 慢（asar 读取 + 真实 GPU 合成），
     * 固定 sleep 会让点击落在页签/弹窗切换的中间态上，后续断言连锁失败。
     * 超时则转储现场（弹窗标题与输入值、活动页签、焦点元素），否则只能看到一串
     * 由同一处卡点引发的连锁 FAIL。
     */
    const waitTrue = async (label, expr, arg, timeout = 10_000) => {
      const hit = await soft(label, () => page.waitForFunction(expr, { timeout, polling: 200 }, arg));
      if (!hit) {
        const scene = await page.evaluate(async () => {
          // 两次采样 animation timeline： currentTime 不推进就说明合成器停发帧，
          // 退场动画的 animationend 永不到达 —— 弹窗节点不卸载，遮罩吞掉后续所有点击。
          const t0 = document.timeline.currentTime;
          await new Promise((r) => setTimeout(r, 600));
          const t1 = document.timeline.currentTime;
          const dialog = document.querySelector('.modal__dialog');
          return {
            dialogs: [...document.querySelectorAll('.modal__dialog')].map((el) => ({
              heading: el.querySelector('h2')?.textContent?.trim(),
              inputs: [...el.querySelectorAll('input')].map((i) => `${i.placeholder || i.type}=${i.value}`),
              buttons: [...el.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean),
              h: Math.round(el.getBoundingClientRect().height)
            })),
            timeline: `${t0}→${t1}`,
            frozen: document.visibilityState !== 'visible',
            vis: document.visibilityState,
            hasFocus: document.hasFocus(),
            anims: document
              .getAnimations()
              .filter((a) => !a.effect?.target?.className?.includes?.('scroll-shadow'))
              .map((a) => {
                const t = a.effect?.target;
                const owned = dialog && t && (dialog === t || dialog.contains(t));
                return `${owned ? 'dialog:' : ''}${a.playState}@${Math.round(a.currentTime ?? -1)}`;
              })
              .slice(0, 6),
            activeTab: [...document.querySelectorAll('aside [role="tab"]')]
              .find((t) => t.getAttribute('aria-selected') === 'true' || t.dataset.selected === 'true')?.textContent?.trim(),
            focus: `${document.activeElement?.tagName}#${document.activeElement?.id || ''} ${(document.activeElement?.getAttribute('placeholder') || document.activeElement?.textContent || '').trim().slice(0, 24)}`,
            topAtAside: (() => {
              const el = document.elementFromPoint(window.innerWidth - 190, window.innerHeight / 2);
              return el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : null;
            })(),
            rotated: document.querySelectorAll('main [style*="rotate("]').length,
            imgs: document.querySelectorAll('main img').length
          };
        });
        log(`      [scene] ${JSON.stringify(scene)}`);
        if (!scene.frozen) {
          frozenScenes = 0;
        } else {
          const revived = await reviveHiddenPage(page);
          const finished = await forceFinishAnimations(page);
          log(`      [recover] ${label} — visibility=${revived ?? 'CDP 不可用'}，强制结束动画 ${finished} 条`);
          const retry = await soft(`${label}（自救后重试）`, () =>
            page.waitForFunction(expr, { timeout: 8_000, polling: 250 }, arg)
          );
          if (retry) {
            frozenScenes = 0;
            return true;
          }
          if (++frozenScenes >= 2) {
            throw new Error(
              `应用窗口已不可见（visibility=${scene.vis}，自救后仍未恢复），弹窗退场动画无法结束 —— ` +
                '后续断言全部不可信，请让窗口保持可见后重跑本轮冒烟'
            );
          }
        }
      }
      await sleep(250);
      return Boolean(hit);
    };
    const tabSelected = (name, scope = 'aside') =>
      `[...document.querySelectorAll(${JSON.stringify(scope)} + ' [role="tab"]')].some((t) => t.textContent.trim() === ${JSON.stringify(name)} && (t.getAttribute('aria-selected') === 'true' || t.dataset.selected === 'true'))`;
    const noDialog = `![...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0)`;

    /* --- 1. bridge / 默认设置 / 浏览器检测 --- */
    const API_METHODS = [
      'browserDetect', 'browserDownload', 'onBrowserDownloadProgress', 'captureStart', 'previewProbe', 'onCaptureProgress',
      'exportCompose', 'exportSave', 'exportClipboard', 'onExportRender', 'onWebpConvert', 'exportReady',
      'exportWebpResult', 'settingsGet', 'settingsSet', 'sessionGet', 'sessionSet', 'appVersion', 'cacheStats', 'cacheClear', 'cacheOpen', 'pickBrowserPath',
      'clipboardReadText', 'shotDataUrl', 'updateCheck', 'updateOpen', 'templatesGet', 'templatesSave', 'templatesDelete'
    ];
    const missing = await page.evaluate((names) => names.filter((n) => typeof window.api?.[n] !== 'function'), API_METHODS);
    check('preload bridge 全方法可用', missing.length === 0, missing.length ? `缺失 ${missing.join(',')}` : `${API_METHODS.length} 个方法齐备`);

    const fresh = await api('settingsGet');
    check('全新档案默认设置', fresh.theme === 'dark' && fresh.format === 'png' && fresh.scale === 2 && !fresh.browserPath, JSON.stringify(fresh));
    check('全新档案无自定义模板', (await api('templatesGet')).length === 0);

    const detection = await api('browserDetect');
    check('browserDetect 命中本机浏览器', detection.found.length > 0 && detection.found.every((b) => existsSync(b.path)), detection.found.map((b) => `${b.kind}:${b.path.slice(-26)}`).join(' '));

    /* --- 1b. 渲染→主进程边界：这几个通道都会真实读文件 / 发请求，越界输入必须被主进程挡下 --- */
    const outside = join(ROOT, 'package.json');
    const rejectMessage = async (name, ...args) => {
      try {
        await api(name, ...args);
        return null;
      } catch (error) {
        return String(error?.message ?? error);
      }
    };
    const deniedRead = await rejectMessage('shotDataUrl', outside);
    check('shotDataUrl 拒绝缓存目录外的路径', deniedRead !== null && /缓存目录/.test(deniedRead), deniedRead ?? '未拒绝');
    const deniedClip = await rejectMessage('exportClipboard', { path: outside });
    check('exportClipboard 拒绝缓存目录外的路径', deniedClip !== null && /缓存目录/.test(deniedClip), deniedClip ?? '未拒绝');
    const deniedCapture = await rejectMessage('captureStart', {
      url: 'file:///C:/Windows/win.ini',
      deviceUrls: {},
      devices: ['desktop']
    });
    check(
      'captureStart 主进程侧拒绝非 http(s) 地址',
      deniedCapture !== null && /地址无效/.test(deniedCapture),
      deniedCapture ?? '未拒绝'
    );
    const deniedProbe = await rejectMessage('previewProbe', 'file:///C:/Windows/win.ini');
    check('previewProbe 主进程侧拒绝非 http(s) 地址', deniedProbe !== null && /地址无效/.test(deniedProbe), deniedProbe ?? '未拒绝');
    // 设备屏里嵌的是任意远程站点：子帧 window.open 弹出的窗口会继承本窗口 webPreferences
    // （含 preload），一旦放行就等于把整套 window.api 交给外部页面。这里要求它开不出来。
    const popup = await page.evaluate(() => window.open('https://example.com'));
    check('顶层 window.open 被拦截（不产生带 bridge 的新窗口）', popup === null, String(popup));

    /* --- 1c. 浏览器实例生命周期：一次 launch 失败不能把之后所有截图永久锁死 ---
       指向一个存在但不是浏览器的可执行文件 → launch 必然失败；改回自动检测后必须还能截出来。
       旧实现在这里会把 rejected promise 缓存住，之后每次截图都返回同一个错误，只能重启应用。 */
    const notABrowser = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe');
    await api('settingsSet', { browserPath: notABrowser });
    const launchFailure = await rejectMessage('captureStart', { url: SITE, deviceUrls: {}, devices: ['desktop'] });
    check('浏览器启动失败会如实报错', launchFailure !== null, launchFailure?.slice(0, 90) ?? '未报错');
    await api('settingsSet', { browserPath: '' });
    const afterBadLaunch = await soft('launch 失败后重新截图', () =>
      api('captureStart', { url: SITE, deviceUrls: {}, devices: ['desktop'] })
    );
    check(
      'launch 失败不锁死引擎，下一次截图仍成功',
      Boolean(afterBadLaunch?.shots?.desktop),
      JSON.stringify(afterBadLaunch?.errors ?? {})
    );

    /* 单台重试没有遮罩可挡，主进程必须拦住并发的第二轮：两条 captureStart 共用一个浏览器
       实例并发导航，后完成的那台会覆盖先完成的结果，画布拿到的是错位的截图。 */
    const [firstShot, secondShot] = await page.evaluate(async (site) => {
      const run = (device) =>
        window.api
          .captureStart({ url: site, deviceUrls: {}, devices: [device] })
          .then(() => 'ok', (error) => String(error.message ?? error));
      return Promise.all([run('desktop'), run('mobile')]);
    }, SITE);
    check('并发 captureStart 被主进程互斥挡下', firstShot === 'ok' && /还在进行中/.test(secondShot), `${firstShot} | ${secondShot}`);

    /* --- 2. 预览：非法 URL / 主 URL / 分设备覆盖 --- */
    // 本地可控的「拒绝内嵌 / 允许内嵌」站点。这两条分支原先借外站真实响应头，
    // 本机网络一抖就整轮 SKIP、覆盖率被静默吞掉；判定逻辑在 A 段有 6 条纯逻辑断言，
    // 这里要补的是「探测 → embedHints → 占位渲染」那段端到端接线。
    // 可行性依据：normalizeUrl 只要求 hostname 含点（127.0.0.1 过），CSP 是 frame-src http: https:。
    embedServer = createServer((req, res) => {
      const blocked = String(req.url).startsWith('/deny');
      const body = EMBED_FIXTURE_HTML;
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        ...(blocked ? { 'X-Frame-Options': 'DENY' } : {})
      });
      res.end(body);
    });
    await new Promise((resolve) => embedServer.listen(0, '127.0.0.1', resolve));
    const embedBase = `http://127.0.0.1:${embedServer.address().port}`;
    const DENY_URL = `${embedBase}/deny`;
    const OPEN_URL = `${embedBase}/open`;
    log(`本地内嵌夹具站点 ${embedBase}（/deny 带 XFO，/open 不带）`);

    await page.bringToFront();
    const urlInput = 'input[placeholder^="输入网址"]';
    await typeInto(page, urlInput, 'not a valid url');
    await page.keyboard.press('Enter');
    await sleep(600);
    const invalidState = await canvasState(page);
    check(
      '非法 URL 中文提示且不渲染预览',
      (await bodyText(page)).includes('请输入有效的 http/https 网址') && invalidState.frames.length === 0
    );

    await typeInto(page, urlInput, SITE.replace(/^https?:\/\//, ''));
    await page.keyboard.press('Enter');
    await soft('等待预览 iframe 出现', () => page.waitForFunction(() => document.querySelectorAll('main iframe').length > 0, { timeout: 30_000 }));
    let state = await canvasState(page);
    check('主 URL 回车渲染 4 台预览 iframe', state.frames.length === 4, state.frames.map((f) => f.title).join(','));
    check('预览 iframe 指向主地址', state.frames.every((f) => f.src.includes('github.com')));

    /* 3b. 内嵌可行性探测：走本地夹具站点，结论确定、不依赖外网。 */
    const probeDeny = await api('previewProbe', DENY_URL);
    check(
      'previewProbe 判定拒绝内嵌站点（本地夹具）',
      probeDeny?.probed === true && probeDeny?.blocked === true && probeDeny?.reason === 'X-Frame-Options: DENY',
      JSON.stringify(probeDeny)
    );
    const probeOpen = await api('previewProbe', OPEN_URL);
    check(
      'previewProbe 放行可内嵌站点（本地夹具）',
      probeOpen?.probed === true && probeOpen?.blocked === false,
      JSON.stringify(probeOpen)
    );

    // 占位渲染：把被拦地址贴进地址栏，画布该给说明而不是四片白
    await typeInto(page, urlInput, DENY_URL);
    await page.keyboard.press('Enter');
    check(
      '被拦站点在画布上给出占位说明',
      await waitTrue('等拦截占位出现', `document.body.innerText.includes('该站点禁止内嵌预览')`, undefined, 25_000)
    );
    // 复位到主站点：后面的分设备覆盖 / 截图 / 导出用例仍按 SITE 跑
    await typeInto(page, urlInput, SITE.replace(/^https?:\/\//, ''));
    await page.keyboard.press('Enter');
    await soft('等预览回到主站点', () =>
      page.waitForFunction(() => document.querySelectorAll('main iframe').length === 4, { timeout: 30_000 })
    );

    await tap(page, locator('span', '分设备 URL', false));
    await sleep(800);
    await typeInto(page, 'input[placeholder^="手机"]', MOBILE_OVERRIDE_URL);
    await page.keyboard.press('Enter');
    await sleep(1500);
    state = await canvasState(page);
    const mobileFrame = state.frames.find((f) => f.title.includes('手机'));
    check(
      '分设备 URL 仅覆盖该台',
      Boolean(mobileFrame?.src.includes('example.com')) && state.frames.filter((f) => !f.title.includes('手机')).every((f) => f.src.includes('github.com')),
      mobileFrame?.src
    );
    await typeInto(page, 'input[placeholder^="手机"]', '');
    await page.keyboard.press('Enter');
    await sleep(1200);
    state = await canvasState(page);
    check('清空分设备 URL 回落主地址', state.frames.length === 4 && state.frames.every((f) => f.src.includes('github.com')));

    /* --- 3. 截图引擎：4 台出图 + 尺寸 + 进度事件 --- */
    await page.evaluate(() => {
      window.__smokeProgress = [];
      window.api.onCaptureProgress((p) => window.__smokeProgress.push({ device: p.device, status: p.status }));
    });
    const t0 = Date.now();
    const cap = (await soft('captureStart 四台截图', () => api('captureStart', { url: SITE, deviceUrls: {}, devices: ALL_DEVICES }))) ?? { shots: {}, errors: {} };
    const capSec = ((Date.now() - t0) / 1000).toFixed(1);
    check('captureStart 四台全部出图', Object.keys(cap.shots).length === 4, `${Object.keys(cap.shots).length}/4 用时 ${capSec}s ${Object.entries(cap.errors).map(([k, v]) => `${k}:${v}`).join(' ')}`);

    for (const device of ALL_DEVICES) {
      const path = cap.shots[device];
      if (!path) {
        check(`截图 ${device} 尺寸符合 2x 预设`, false, '该台未出图');
        continue;
      }
      const buf = await readFile(path);
      const d = pngDims(buf);
      const v = devicePresets[device].viewport;
      check(`截图 ${device} 尺寸符合 2x 预设`, isPng(buf) && d.width === v.width * 2 && d.height === v.height * 2 && buf.length > 20_000, `${d.width}x${d.height} ${human(buf.length)}`);
      await copyFile(path, join(OUT_DIR, `shot-${device}.png`));
    }

    const events = await page.evaluate(() => window.__smokeProgress);
    check('capture:progress 先 4 台 pending', events.filter((e) => e.status === 'pending').length === 4 && events.slice(0, 4).every((e) => e.status === 'pending'), events.map((e) => `${e.device}:${e.status}`).join(' '));
    check('capture:progress 收尾 4 台 done', events.length === 8 && events.filter((e) => e.status === 'done').length === 4);

    const dataUrl = cap.shots.mobile ? await soft('shotDataUrl', () => api('shotDataUrl', cap.shots.mobile)) : null;
    check('shotDataUrl 返回 PNG dataURL', Boolean(dataUrl?.startsWith('data:image/png;base64,')) && dataUrl.length > 10_000, dataUrl ? `${(dataUrl.length / 1024).toFixed(0)}KB` : '无 mobile 截图');

    /* --- 4. 导出合成：格式 × 倍率 × 透明底 × 样式 --- */
    const compose = (template, scale, format, extra = {}) =>
      api('exportCompose', {
        template,
        shots: cap.shots,
        scale,
        format,
        quality: 90,
        style: { borderRadius: 0, shadow: true, zoom: 1 },
        ...extra
      });

    const cases = [
      ['classic 2x PNG', classic, 2, 'png', 2240, 1740, isPng],
      ['classic 2x JPG', classic, 2, 'jpg', 2240, 1740, isJpeg],
      ['classic 2x WebP', classic, 2, 'webp', 2240, 1740, isWebp],
      ['classic 1x PNG', classic, 1, 'png', 1120, 870, isPng],
      ['classic 3x PNG', classic, 3, 'png', 3360, 2610, isPng],
      ['editorial 2x PNG', editorial, 2, 'png', 2240, 1740, isPng]
    ];
    let firstPng = null;
    for (const [name, template, scale, format, w, h, magic] of cases) {
      let info = null;
      try {
        const { path } = await compose(template, scale, format);
        const buf = await readFile(path);
        await copyFile(path, join(OUT_DIR, `${name.replace(/ /g, '-')}.${format}`));
        if (!firstPng && format === 'png' && scale === 2) firstPng = path;
        info = await inspectImage(page, path);
        check(`导出 ${name}`, magic(buf) && info.width === w && info.height === h && buf.length > 25_000, `${info.width}x${info.height} ${human(buf.length)}`);
      } catch (error) {
        check(`导出 ${name}`, false, error instanceof Error ? error.message : String(error));
      }
    }

    let transparentInfo = null;
    let transparentBuf = null;
    try {
      const { path } = await compose({ ...classic, background: 'transparent' }, 2, 'png');
      transparentBuf = await readFile(path);
      await copyFile(path, join(OUT_DIR, 'transparent.png'));
      transparentInfo = await inspectImage(page, path);
      check(
        '透明底 PNG 保留 alpha 通道',
        pngColorType(transparentBuf) === 6 && minCornerAlpha(transparentInfo) === 0 && transparentInfo.center.a > 240,
        `colorType=${pngColorType(transparentBuf)} 四角alpha=${transparentInfo.corners.map((c) => c.a).join(',')} 中心alpha=${transparentInfo.center.a}`
      );
    } catch (error) {
      check('透明底 PNG 保留 alpha 通道', false, error instanceof Error ? error.message : String(error));
    }

    try {
      const { path } = await compose({ ...classic, background: 'transparent' }, 2, 'jpg');
      await copyFile(path, join(OUT_DIR, 'transparent-flatten.jpg'));
      const info = await inspectImage(page, path);
      check('透明底 JPG 自动垫白', info.corners.every((c) => c.r > 250 && c.g > 250 && c.b > 250), `左上=${JSON.stringify(info.corners[0])}`);
    } catch (error) {
      check('透明底 JPG 自动垫白', false, error instanceof Error ? error.message : String(error));
    }

    try {
      const { path } = await compose(classic, 2, 'png', { style: { borderRadius: 32, shadow: false, zoom: 0.8 } });
      await copyFile(path, join(OUT_DIR, 'styled.png'));
      const info = await inspectImage(page, path);
      check('样式（圆角/无阴影/缩放）导出成功', info.width === 2240 && info.height === 1740 && (await readFile(path)).length > 25_000, `${info.width}x${info.height}`);
    } catch (error) {
      check('样式（圆角/无阴影/缩放）导出成功', false, error instanceof Error ? error.message : String(error));
    }

    // 默认圆角 12 之后，画布四角是裁掉的透明区；JPG 没有 alpha，页面底色不铺白就会渲染成黑角。
    // 阈值取 235 而非 250：圆角边缘紧邻渐变，JPG 色度抽样会让最暗通道掉到 247 左右。
    try {
      const { path } = await compose(classic, 2, 'jpg', { style: { borderRadius: 32, shadow: true, zoom: 1 } });
      await copyFile(path, join(OUT_DIR, 'rounded-flatten.jpg'));
      const info = await inspectImage(page, path);
      check(
        '画布圆角 + JPG 四角垫白不露黑',
        info.corners.every((c) => c.r > 235 && c.g > 235 && c.b > 235),
        info.corners.map((c) => `${c.r},${c.g},${c.b}`).join(' | ')
      );
    } catch (error) {
      check('画布圆角 + JPG 四角垫白不露黑', false, error instanceof Error ? error.message : String(error));
    }

    try {
      const { path } = await compose(classic, 2, 'png', { shots: { desktop: cap.shots.desktop, mobile: cap.shots.mobile } });
      const info = await inspectImage(page, path);
      check('部分设备缺图时仍能合成（空屏占位）', info.width === 2240 && info.height === 1740, `${info.width}x${info.height}`);
    } catch (error) {
      check('部分设备缺图时仍能合成（空屏占位）', false, error instanceof Error ? error.message : String(error));
    }

    /* --- 5. 剪贴板 --- */
    if (firstPng) {
      await soft('exportClipboard', () => api('exportClipboard', { path: firstPng }));
      await sleep(800);
      let containsImage = '';
      try {
        containsImage = execSync('powershell -STA -NoProfile -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()"').toString().trim();
      } catch (error) {
        containsImage = `error ${error.message}`;
      }
      check('剪贴板写入位图', containsImage === 'True', `ContainsImage=${containsImage}`);
    } else {
      check('剪贴板写入位图', false, '无可用导出 PNG');
    }

    /* --- 6. UI：Ctrl+Enter 截图 → 画布换成真实截图 --- */
    // 窗口被遮挡时 Chromium 会节流 rAF，弹窗退场与页签切换可能卡在中间态；
    // 曾导致一次「保存后弹窗未关」的偶发失败，UI 阶段前显式拉到前台。
    await focusAppWindow(page);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await sleep(400);
    check('Ctrl+Enter 触发截图并出现任务遮罩', await page.evaluate(() => Boolean(document.querySelector('[aria-label="任务进度"]'))));
    const imgCount = await page
      .waitForFunction(() => document.querySelectorAll('main img').length, { timeout: CAPTURE_TIMEOUT, polling: 2000 })
      .then((h) => h.jsonValue())
      .catch(() => 0);
    state = await canvasState(page);
    check('Ctrl+Enter 后画布显示真实截图', imgCount === 4 && state.frames.length === 0, `img ${imgCount}/4，iframe ${state.frames.length}`);
    check('截图 alt 标出设备名', state.images.length === 4 && state.images.every((a) => a.endsWith('截图')), state.images.join(','));

    /* --- 7. UI：模板切换 / 样式微调 / 另存自定义模板 --- */
    await focusAppWindow(page);
    await tap(page, locator('[role="tab"]', '模板'));
    await waitTrue('切到模板页签', tabSelected('模板'));
    const galleryCount = await page.evaluate(() => document.querySelectorAll('aside [role="button"]').length);
    check('模板画廊渲染 5 套预设', galleryCount === 5, `${galleryCount} 项`);

    await tap(page, locator('[role="button"]', '灵感错落', false));
    await waitTrue('等旋转排版生效', `document.querySelectorAll('main [style*="rotate("]').length === 3`);
    state = await canvasState(page);
    check('切「灵感错落」后 3 台带旋转', state.rotated === 3, `rotate 节点 ${state.rotated}`);
    check('选中模板有 ring 高亮', (await page.evaluate(() => document.querySelectorAll('aside [role="button"].ring-2').length)) === 1);
    const editorialImages = state.images.length;
    check('切模板后截图数量随 placements 变化', editorialImages === 3, `img ${editorialImages}/3`);

    await tap(page, locator('[role="button"]', '经典全家福', false));
    await waitTrue('等无旋转排版生效', `document.querySelectorAll('main [style*="rotate("]').length === 0 && document.querySelectorAll('main img').length === 4`);
    state = await canvasState(page);
    check('切回「经典全家福」恢复 4 台无旋转', state.rotated === 0 && state.images.length === 4, `rotate=${state.rotated} img=${state.images.length}`);

    await tap(page, locator('[role="tab"]', '样式'));
    await waitTrue('切到样式页签', tabSelected('样式'));
    const styleText = await bodyText(page);
    check('样式页含背景板与圆角/阴影控件', styleText.includes('背景') && styleText.includes('圆角') && styleText.includes('阴影'));
    // 背景板走 HeroUI 内置 ColorSwatchPicker：选中态以代表色的 hexa 为唯一 key，
    // 每组各一个 picker，故跨组互斥要靠「点选后全页只有一个 selected」来兜。
    const picker = await page.evaluate(() => ({
      groups: document.querySelectorAll('[data-slot="color-swatch-picker"]').length,
      items: document.querySelectorAll('[data-slot="color-swatch-picker-item"]').length,
      selected: document.querySelector('[data-slot="color-swatch-picker-item"][data-selected="true"]')?.getAttribute('aria-label') ?? null
    }));
    check('背景板为内置色板三组 15 块', picker.groups === 3 && picker.items === 15, `${picker.groups} 组 / ${picker.items} 块`);
    check('色板初始选中模板自带背景', picker.selected === '落日熔金', String(picker.selected));
    await tap(page, attrLocator('[data-slot="color-swatch-picker-item"]', 'aria-label', '曜石黑'));
    await waitTrue(
      '点选深色底后全页仅一项选中',
      `document.querySelectorAll('[data-slot="color-swatch-picker-item"][data-selected="true"]').length === 1 && document.querySelector('[data-slot="color-swatch-picker-item"][data-selected="true"]')?.getAttribute('aria-label') === '曜石黑'`
    );
    const pickedBg = await page.evaluate(() => ({
      hint: [...document.querySelectorAll('aside p')].map((e) => e.textContent?.trim()).find((t) => t?.startsWith('当前：')) ?? '',
      board: (() => {
        const box = [...document.querySelectorAll('main div[style]')].find((el) => el.style.borderRadius);
        return box ? getComputedStyle(box).background : '';
      })()
    }));
    check(
      '点选色板即时改画布底色并回显名称',
      pickedBg.hint === '当前：曜石黑' && pickedBg.board.includes('rgb(31, 31, 40)'),
      `${pickedBg.hint} / ${pickedBg.board.slice(0, 60)}…`
    );
    await tap(page, attrLocator('[data-slot="color-swatch-picker-item"]', 'aria-label', '落日熔金'));
    await waitTrue('切回模板自带背景', `document.querySelector('[data-slot="color-swatch-picker-item"][data-selected="true"]')?.getAttribute('aria-label') === '落日熔金'`);
    // HeroUI v3 Slider 的可聚焦控件是 input[type=range]（wrapper 只有 role=group），
    // 焦点若留在页签上按方向键会切换页签，必须先聚焦滑杆。
    const sliderFocused = await page.evaluate(() => {
      const el = document.querySelector('aside input[type="range"]');
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    });
    check('样式页滑杆可聚焦', sliderFocused);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await sleep(700);
    const radius = await canvasBorderRadius(page);
    check('圆角 Slider 即时作用于画布', Boolean(radius) && radius !== '0px', String(radius));

    const openedSave = await tap(page, locator('button', '另存为模板'));
    if (openedSave) {
      await waitTrue('等另存弹窗打开', `document.body.innerText.includes('模板名称')`);
      const typed = await typeInto(page, 'input[placeholder^="如：我的首页排版"]', '冒烟模板');
      if (typed !== '冒烟模板') {
        // 名称没落进输入框就别点保存（空名会被挡回、弹窗不关，会把后面整段断言全拖崩）
        check('另存为模板写入存储', false, `模板名未写入（实际「${typed}」），已跳过后续避免连锁`);
        await closeAllDialogs(page);
      } else {
        await tap(page, locator('button', '保存'));
        await waitTrue('等另存弹窗关闭', noDialog);
        const list = await api('templatesGet');
        check('另存为模板写入存储', list.length === 1 && list[0].name === '冒烟模板', list.map((t) => `${t.id}/${t.name}`).join(','));
        // 画廊在「模板」页签，另存后仍停在「样式」页签，需切过去才看得到自定义项
        await tap(page, locator('[role="tab"]', '模板'));
        await waitTrue('等自定义项进画廊', `document.body.innerText.includes('冒烟模板')`);
        check('自定义模板出现在画廊', (await bodyText(page)).includes('冒烟模板'));
        const tappedDelete = await tap(page, attrLocator('aside button', 'aria-label', '删除模板'));
        await waitTrue('等画廊回到空态', `document.body.innerText.includes('还没有自定义模板')`);
        const rest = await api('templatesGet');
        check('删除自定义模板', tappedDelete && rest.length === 0, `点击=${tappedDelete} 剩余 ${rest.length}`);
        check('删空后画廊回到空态', (await bodyText(page)).includes('还没有自定义模板'));
      }
    } else {
      check('另存为模板写入存储', false, '未找到「另存为模板」按钮');
    }

    /* 换地址必须清掉上一轮的截图：DeviceFrame 优先渲染 shot，留着就是旧站画面盖住新预览，
       此时直接导出会把 A 站的图配上新排版、还全程不报错。放在第 7 段之后，避免打掉
       「切模板后截图数量随 placements 变化」那组依赖画布截图的断言。 */
    await typeInto(page, urlInput, 'example.com');
    await page.keyboard.press('Enter');
    await waitTrue(
      '等换地址后旧截图让位',
      () => document.querySelectorAll('main img').length === 0 && document.querySelectorAll('main iframe').length === 4,
      undefined,
      20_000
    );
    state = await canvasState(page);
    check(
      '改地址后旧截图让位给新预览',
      state.images.length === 0 && state.frames.length === 4 && state.frames.every((f) => f.src.includes('example.com')),
      `img ${state.images.length}，iframe ${state.frames.length}/4`
    );
    await typeInto(page, urlInput, SITE.replace(/^https:\/\//, ''));
    await page.keyboard.press('Enter');
    await waitTrue(
      '等预览回到主站点',
      () =>
        document.querySelectorAll('main iframe').length === 4 &&
        [...document.querySelectorAll('main iframe')].every((f) => f.src.includes('github.com')),
      undefined,
      30_000
    );

    /* --- 8. UI：设置弹窗 / 主题 / 设置持久化 --- */
    await closeAllDialogs(page);
    await focusAppWindow(page);
    await tap(page, locator('button', '设置'));
    await waitTrue('等设置弹窗打开', `[...document.querySelectorAll('.modal__dialog h2')].some((h) => h.textContent.trim() === '设置')`);
    const modalTabs = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')]
        .map((t) => t.textContent.trim())
        .filter((t) => ['浏览器', '默认值', '缓存', '关于'].includes(t))
    );
    check('设置弹窗含浏览器/默认值/缓存/关于四页签', modalTabs.length === 4, modalTabs.join(','));

    // 下载 Chromium 是两段式确认（一旦开始无法中断），冒烟只验确认态、绝不真的开始下载
    await tap(page, locator('[role="tab"]', '浏览器'));
    await waitTrue('切到浏览器页签', `[...document.querySelectorAll('.modal__dialog [role="tab"]')].some((t) => t.textContent.trim() === '浏览器' && (t.getAttribute('aria-selected') === 'true' || t.dataset.selected === 'true'))`);
    await tap(page, locator('button', '下载 Chromium'));
    await waitTrue('等确认态出现', `document.body.innerText.includes('确认下载')`);
    check(
      '下载 Chromium 需二次确认且未直接开始',
      (await bodyText(page)).includes('无法中途取消') && !(await bodyText(page)).includes('下载中…')
    );
    await tap(page, locator('button', '取消'));
    await waitTrue('确认态收回', `!document.body.innerText.includes('确认下载')`);
    check('取消回到未确认态', (await bodyText(page)).includes('下载 Chromium') && !(await bodyText(page)).includes('确认下载'));

    await tap(page, locator('[role="tab"]', '缓存'));
    await waitTrue('等缓存统计出数', `/(\\d+) 个文件/.test(document.body.innerText)`);
    // 只验入口存在，不点：点了会真开一个资源管理器窗口，本环境里属不可靠副作用
    check(
      '缓存页含「打开缓存目录」入口',
      await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('打开缓存目录')))
    );
    const cacheFiles = await page.evaluate(() => document.body.innerText.match(/(\d+) 个文件/)?.[1] ?? null);
    check('缓存页签显示临时产物统计', cacheFiles !== null && Number(cacheFiles) > 0, `${cacheFiles} 个文件`);
    await tap(page, locator('[role="tab"]', '关于'));
    await waitTrue('切到关于页签', tabSelected('关于', '.modal__dialog'));
    check('关于页显示运行版本', (await bodyText(page)).includes(`PreviewCraft ${pkgVersion}`), pkgVersion);
    const clickedCheckUpdate = await tap(page, locator('button', '检查更新'));
    const updateSettled = await waitTrue(
      '等检查结果落地',
      `/已是最新版本|发现新版本|检查失败/.test(document.body.innerText)`,
      undefined,
      25_000
    );
    const updateLine = await page.evaluate(() =>
      document.body.innerText.split('\n').find((l) => /已是最新版本|发现新版本|检查失败/.test(l))?.trim()
    );
    check('检查更新给出结果文案', clickedCheckUpdate && updateSettled && Boolean(updateLine), updateLine ?? '无结果文案');

    const tappedClose = await tap(page, locator('button', '关闭'));
    const closedByButton = tappedClose && (await waitTrue('等设置弹窗关闭', noDialog));
    check('设置弹窗「关闭」按钮可收', closedByButton, `点击=${tappedClose} 弹窗仍开=${await modalOpen()}`);
    if (!closedByButton) {
      await page.keyboard.press('Escape');
      const escClosed = await waitTrue('等 Esc 收弹窗', noDialog);
      check('Esc 可收设置弹窗', escClosed);
    }

    const themeBtn = attrLocator('button', 'aria-label', '切换明暗主题');
    await tap(page, themeBtn);
    await waitTrue('等浅色类挂上', `document.documentElement.classList.contains('light') && document.documentElement.getAttribute('data-theme') === 'light'`);
    const isLight = await page.evaluate(() => document.documentElement.classList.contains('light') && document.documentElement.getAttribute('data-theme') === 'light');
    const themeSetting = await api('settingsGet');
    check('主题切换即时生效并落库', isLight && themeSetting.theme === 'light', `class=${isLight} settings=${themeSetting.theme}`);
    await tap(page, themeBtn);
    await waitTrue('等回到暗色类', `document.documentElement.classList.contains('dark')`);
    check('主题切回暗色', (await api('settingsGet')).theme === 'dark');

    await api('settingsSet', { format: 'webp', scale: 3 });
    const persisted = await api('settingsGet');
    await api('settingsSet', { format: 'png', scale: 2 });
    check('导出格式/倍率设置可回读', persisted.format === 'webp' && persisted.scale === 3, JSON.stringify(persisted));

    /* --- 9. 错误路径：不可达域名 → 重试占位 → 恢复 --- */
    await typeInto(page, urlInput, BAD_HOST);
    await page.keyboard.press('Enter');
    await sleep(500);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.down('Control');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Control');
    await page
      .waitForFunction(() => [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === '重试'), { timeout: 150_000, polling: 1500 })
      .catch(() => undefined);
    await sleep(1500);
    const errText = await bodyText(page);
    const errLine = errText.split('\n').find((l) => /域名无法解析|站点不可达|连接/.test(l));
    check('不可达站点给出中文归因提示', Boolean(errLine), errLine?.trim() ?? '未命中归因文案');
    state = await canvasState(page);
    check('失败设备露出「重试」占位', state.retry === 4 && state.images.length === 0, `重试 ${state.retry}/4，残留 img ${state.images.length}`);
    const tappedRetry = await tap(page, locator('button', '重试'));
    await sleep(2500);
    check('单台重试按钮可点（仍失败则保留占位）', tappedRetry && (await canvasState(page)).retry >= 1, `点击=${tappedRetry}`);

    await typeInto(page, urlInput, SITE.replace(/^https:\/\//, ''));
    await page.keyboard.press('Enter');
    await soft('等待改地址后预览恢复', () => page.waitForFunction(() => document.querySelectorAll('main iframe').length === 4, { timeout: 30_000 }));
    state = await canvasState(page);
    check('改地址后失败占位让位给新预览', state.frames.length === 4 && state.retry === 0, `iframe ${state.frames.length}/4，重试占位 ${state.retry}`);

    /* --- 10. UI 导出闭环（原生保存对话框为人工项，只断言到 temp 产物） --- */
    await closeAllDialogs(page);
    await focusAppWindow(page);
    await tap(page, locator('[role="tab"]', '导出'));
    await waitTrue('切到导出页签', tabSelected('导出'));
    const tempDir = join(process.env.TEMP, 'preview-craft');
    const before = existsSync(tempDir) ? new Set(await readdir(tempDir)) : new Set();
    check('导出页可点「导出」', await tap(page, locator('button', '导出')));
    let newExport = null;
    let exportMaskSeen = false;
    for (let i = 0; i < 150 && !newExport; i++) {
      await sleep(2000);
      if (!exportMaskSeen) exportMaskSeen = await page.evaluate(() => Boolean(document.querySelector('[aria-label="任务进度"]')));
      const now = existsSync(tempDir) ? await readdir(tempDir) : [];
      newExport = now.find((f) => f.startsWith('export-') && !before.has(f)) ?? null;
    }
    check('UI 导出期间出现进度遮罩', exportMaskSeen);
    check('UI 导出产出合成文件', Boolean(newExport), newExport ?? '300s 内未产出');
    if (newExport) await copyFile(join(tempDir, newExport), join(OUT_DIR, `ui-${newExport}`));

    /* --- 10b. 会话快照落盘（防抖 800ms，等一轮再读） --- */
    await sleep(1400);
    const snap = await api('sessionGet');
    check(
      '会话快照会落盘（URL / 模板 / 圆角）',
      Boolean(snap?.mainUrl && snap.template?.id && typeof snap.style?.borderRadius === 'number'),
      snap ? `url=${snap.mainUrl} template=${snap.template.id} radius=${snap.style.borderRadius}` : 'null'
    );

    /* --- 11. 单实例锁 --- */
    const second = await new Promise((resolve) => {
      const proc = spawn(bin, launchArgs(null), { cwd: ROOT, stdio: 'ignore' });
      const timer = setTimeout(() => resolve({ exited: false, code: null, proc }), 20_000);
      proc.once('exit', (code) => {
        clearTimeout(timer);
        resolve({ exited: true, code, proc });
      });
    });
    check('单实例锁拦截二次启动', second.exited, second.exited ? `第二实例退出码 ${second.code}` : '第二实例 20s 未退出');
    if (!second.exited) second.proc.kill('SIGKILL');

    /* --- 12. 隔离性 + 缓存清理（最后一步，会删光 temp 产物） --- */
    const isolated = [join(PROFILE_DIR, 'settings.json'), join(PROFILE_DIR, 'preview-craft', 'settings.json')].find((p) => existsSync(p));
    check('冒烟实例数据落在隔离档案', Boolean(isolated), isolated?.replace(ROOT, '.') ?? '.smoke-profile 内未见 settings.json');
    const realHashAfter = await hashFile(realSettings);
    const foreign = [...new Set([...foreignBefore, ...findForeignAppProcesses()])];
    if (realHashBefore === realHashAfter) {
      check('未污染用户真实设置', true, `${String(realHashBefore).slice(0, 8)} 未变`);
    } else if (foreign.length > 0) {
      // 有别人的实例在用真实档案，哈希变了也不能算到冒烟头上
      skip(
        '未污染用户真实设置',
        `非冒烟实例在用真实档案（${foreign.join(', ')}），哈希 ${String(realHashBefore).slice(0, 8)}→${String(realHashAfter).slice(0, 8)} 无法归因于冒烟`
      );
    } else {
      check(
        '未污染用户真实设置',
        false,
        `${String(realHashBefore).slice(0, 8)} → ${String(realHashAfter).slice(0, 8)}${realSettings ? '' : '（用户尚无 settings.json）'}`
      );
    }

    /* --- 缓存回收：必须放在所有导出断言之后，否则会删掉它们还要用的截图文件 --- */
    const capA = await api('captureStart', { url: SITE, deviceUrls: {}, devices: ALL_DEVICES });
    const cacheMid = await api('cacheStats');
    const capB = await api('captureStart', {
      url: SITE,
      deviceUrls: {},
      devices: ALL_DEVICES,
      replace: capA.shots
    });
    const cacheAfter = await api('cacheStats');
    const oldGone = await page.evaluate(async (p) => {
      try {
        await window.api.shotDataUrl(p);
        return false;
      } catch {
        return true;
      }
    }, capA.shots.desktop);
    check(
      '重截会删掉被替换的旧截图（缓存不累积）',
      Object.keys(capB.shots).length === 4 && oldGone && cacheAfter.files <= cacheMid.files,
      `重截前 ${cacheMid.files} 个 → 带 replace 重截后 ${cacheAfter.files} 个，旧 desktop 图已回收=${oldGone}`
    );

    const statsBefore = await api('cacheStats');
    check('cacheStats 统计到临时产物', statsBefore.files > 0 && statsBefore.bytes > 0, `${statsBefore.files} 个 / ${human(statsBefore.bytes)}`);
    const cleared = await api('cacheClear');
    const statsAfter = await api('cacheStats');
    check('cacheClear 清空临时目录', cleared.files > 0 && statsAfter.files === 0, `removed=${cleared.files} after=${statsAfter.files}`);

    check('无未捕获脚本异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    log(`      IPC 调用 ${calls.length} 次，覆盖 ${[...new Set(calls)].length} 个通道`);
  } finally {
    try {
      embedServer?.closeAllConnections?.();
      embedServer?.close();
    } catch {
      /* 夹具站点没起来或已关 */
    }
    try {
      await browser?.disconnect();
    } catch {
      /* ignore */
    }
    child.kill();
    const exited = await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(5000).then(() => undefined)
    ]);
    if (exited === undefined) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

/* ================================================================== 入口 */

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  writeFileSync(LOG_FILE, `==== PreviewCraft smoke ${new Date().toISOString()} site=${SITE} only=${ONLY || 'all'} ====\n`, 'utf8');

  if (ONLY !== 'e2e') await runLogicSection();
  if (ONLY !== 'logic') await runAppSection();

  const failed = results.filter((r) => !r.pass);
  section('汇总');
  log(`${results.length - failed.length}/${results.length} PASS${skips.length ? ` + ${skips.length} SKIP（本轮未验到）` : ''}`);
  for (const f of failed) log(`  FAIL  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  for (const s of skips) log(`  SKIP  ${s.name} — ${s.reason}`);
  await writeFile(join(OUT_DIR, 'smoke-results.json'), JSON.stringify(results, null, 2), 'utf8');
}

main().catch(async (error) => {
  const text = `FATAL ${error?.stack ?? error}`;
  console.error(text);
  try {
    appendFileSync(LOG_FILE, `${text}\n`, 'utf8');
  } catch {
    /* ignore */
  }
  process.exit(1);
});
