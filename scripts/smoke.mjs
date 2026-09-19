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

const results = [];
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
 * 清空并输入。三击选中在受控 Input 上不可靠（选中没生效时会把新串拼到旧串后面），
 * 改用 focus + Ctrl+A + Backspace，输入后回读校验实际值。
 */
async function typeInto(page, selector, text) {
  const ready = await soft(`等待输入框 ${selector}`, () => page.waitForSelector(selector, { visible: true, timeout: 10_000 }));
  if (!ready) return null;
  await soft(`聚焦输入框 ${selector}`, () => page.focus(selector));
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (text) await soft(`键入 ${text}`, () => page.type(selector, text, { delay: 12 }));
  const actual = await page.evaluate((s) => document.querySelector(s)?.value ?? null, selector);
  if (text && actual !== text) {
    log(`      [warn] ${selector} 实际值「${actual}」≠ 期望「${text}」`);
    return actual;
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

  check('背景板 7 块含透明底', backgrounds.length === 7 && isTransparentBackground('transparent'));
  check('resolveBackgroundCss 预设取色板', resolveBackgroundCss('twilight').startsWith('linear-gradient'));
  check('resolveBackgroundCss 解析 custom 前缀', resolveBackgroundCss('custom:#111,#222') === '#111,#222');
  check('resolveBackgroundCss 未知 key 回落首块', resolveBackgroundCss('nope') === backgrounds[0].value);
  check('透明底仅 PNG 留空、JPG 垫白', resolveBackgroundCss('transparent') === 'transparent' && resolveBackgroundCss('transparent', true) === '#ffffff');

  const original = presets[0];
  const cloned = cloneTemplate(original);
  cloned.placements[0].x += 7;
  check('cloneTemplate 深拷贝不改源模板', original.placements[0].x !== cloned.placements[0].x && original.canvas !== cloned.canvas);
  check('isTemplateModified 识别排版改动', isTemplateModified(cloned, original) === true && isTemplateModified(cloneTemplate(original), original) === false);
  check('isTemplateModified 无来源时判未改', isTemplateModified(cloned, undefined) === false);
  check('buildCustomBackground 生成 custom 前缀', buildCustomBackground('#aaa', '#bbb') === 'custom:linear-gradient(180deg, #aaa, #bbb)');
  check('会话默认样式基线', defaultStyle.borderRadius === 0 && defaultStyle.shadow === true && defaultStyle.zoom === 1);

  check('错误归因·超时', describeCaptureError('Navigation timeout of 30000 ms exceeded').includes('加载超时'));
  check('错误归因·DNS', describeCaptureError('net::ERR_NAME_NOT_RESOLVED').includes('域名无法解析'));
  check('错误归因·连接中断', describeCaptureError('net::ERR_CONNECTION_RESET').includes('连接被中断'));
  check('错误归因·证书', describeCaptureError('net::ERR_CERT_AUTHORITY_INVALID').includes('证书'));
  check('错误归因·浏览器启动失败', describeCaptureError('Failed to launch the browser process!').includes('浏览器启动失败'));
  check('错误归因·未归类保留错误码', describeCaptureError('net::ERR_SOMETHING_NEW') === '站点不可达（ERR_SOMETHING_NEW）', describeCaptureError('net::ERR_SOMETHING_NEW'));
  check('错误归因·空值与超长兜底', describeCaptureError(undefined) === '截图失败' && describeCaptureError('x'.repeat(200)).endsWith('…'));
  check('浏览器种类中文名', describeBrowserKind('chrome') === 'Chrome' && describeBrowserKind('edge') === 'Edge');
  check('formatBytes 边界', formatBytes(0) === '0 B' && formatBytes(1023) === '1023 B' && /KB$/.test(formatBytes(2048)) && /MB$/.test(formatBytes(111 * 1024 * 1024)), `${formatBytes(0)}|${formatBytes(1023)}|${formatBytes(2048)}|${formatBytes(111 * 1024 * 1024)}`);
}

/* ========================================================= B. 真实应用 E2E */

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
  const classic = presets.find((t) => t.id === 'classic');
  const editorial = presets.find((t) => t.id === 'editorial');
  const electronPath = EXE ? null : (await import('electron')).default;
  const bin = EXE || electronPath;
  const launchArgs = (debugPort) => [
    ...(EXE ? [] : [join('out', 'main', 'index.js')]),
    ...(debugPort ? [`--remote-debugging-port=${debugPort}`] : []),
    `--user-data-dir=${PROFILE_DIR}`
  ];

  const appData = process.env.APPDATA ? join(process.env.APPDATA, 'preview-craft') : null;
  const realSettings = appData && existsSync(join(appData, 'settings.json')) ? join(appData, 'settings.json') : null;
  const hashFile = async (p) => (p ? createHash('sha1').update(await readFile(p)).digest('hex') : 'absent');
  const realHashBefore = await hashFile(realSettings);

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

  try {
    /** 弹窗是否仍在（HeroUI Modal 关闭后节点移除，按可见高度判断） */
    const modalOpen = () =>
      page.evaluate(() => [...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0));

    /**
     * 等某个 DOM 条件成立。打包版整体比 out/ 慢（asar 读取 + 真实 GPU 合成），
     * 固定 sleep 会让点击落在页签/弹窗切换的中间态上，后续断言连锁失败。
     */
    const waitTrue = async (label, expr, arg, timeout = 10_000) => {
      const hit = await soft(label, () => page.waitForFunction(expr, { timeout, polling: 200 }, arg));
      await sleep(250);
      return Boolean(hit);
    };
    const tabSelected = (name) =>
      `[...document.querySelectorAll('aside [role="tab"]')].some((t) => t.textContent.trim() === ${JSON.stringify(name)} && (t.getAttribute('aria-selected') === 'true' || t.dataset.selected === 'true'))`;
    const noDialog = `![...document.querySelectorAll('.modal__dialog')].some((el) => el.getBoundingClientRect().height > 0)`;

    /* --- 1. bridge / 默认设置 / 浏览器检测 --- */
    const API_METHODS = [
      'browserDetect', 'browserDownload', 'onBrowserDownloadProgress', 'captureStart', 'onCaptureProgress',
      'exportCompose', 'exportSave', 'exportClipboard', 'onExportRender', 'onWebpConvert', 'exportReady',
      'exportWebpResult', 'settingsGet', 'settingsSet', 'cacheStats', 'cacheClear', 'pickBrowserPath',
      'clipboardReadText', 'shotDataUrl', 'templatesGet', 'templatesSave', 'templatesDelete'
    ];
    const missing = await page.evaluate((names) => names.filter((n) => typeof window.api?.[n] !== 'function'), API_METHODS);
    check('preload bridge 全方法可用', missing.length === 0, missing.length ? `缺失 ${missing.join(',')}` : `${API_METHODS.length} 个方法齐备`);

    const fresh = await api('settingsGet');
    check('全新档案默认设置', fresh.theme === 'dark' && fresh.format === 'png' && fresh.scale === 2 && !fresh.browserPath, JSON.stringify(fresh));
    check('全新档案无自定义模板', (await api('templatesGet')).length === 0);

    const detection = await api('browserDetect');
    check('browserDetect 命中本机浏览器', detection.found.length > 0 && detection.found.every((b) => existsSync(b.path)), detection.found.map((b) => `${b.kind}:${b.path.slice(-26)}`).join(' '));

    /* --- 2. 预览：非法 URL / 主 URL / 分设备覆盖 --- */
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
      await typeInto(page, 'input[placeholder^="如：我的首页排版"]', '冒烟模板');
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
    } else {
      check('另存为模板写入存储', false, '未找到「另存为模板」按钮');
    }

    /* --- 8. UI：设置弹窗 / 主题 / 设置持久化 --- */
    await tap(page, locator('button', '设置'));
    await waitTrue('等设置弹窗打开', `[...document.querySelectorAll('.modal__dialog h2')].some((h) => h.textContent.trim() === '设置')`);
    const modalTabs = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()).filter((t) => ['浏览器', '默认值', '缓存'].includes(t)));
    check('设置弹窗含浏览器/默认值/缓存三页签', modalTabs.length === 3, modalTabs.join(','));
    await tap(page, locator('[role="tab"]', '缓存'));
    await waitTrue('等缓存统计出数', `/(\\d+) 个文件/.test(document.body.innerText)`);
    const cacheFiles = await page.evaluate(() => document.body.innerText.match(/(\d+) 个文件/)?.[1] ?? null);
    check('缓存页签显示临时产物统计', cacheFiles !== null && Number(cacheFiles) > 0, `${cacheFiles} 个文件`);
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
    check('未污染用户真实设置', realHashBefore === realHashAfter, `${realHashBefore.slice(0, 8)} → ${realHashAfter.slice(0, 8)}${realSettings ? '' : '（用户尚无 settings.json）'}`);

    const statsBefore = await api('cacheStats');
    check('cacheStats 统计到临时产物', statsBefore.files > 0 && statsBefore.bytes > 0, `${statsBefore.files} 个 / ${human(statsBefore.bytes)}`);
    const cleared = await api('cacheClear');
    const statsAfter = await api('cacheStats');
    check('cacheClear 清空临时目录', cleared.files > 0 && statsAfter.files === 0, `removed=${cleared.files} after=${statsAfter.files}`);

    check('无未捕获脚本异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    log(`      IPC 调用 ${calls.length} 次，覆盖 ${[...new Set(calls)].length} 个通道`);
  } finally {
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
  log(`${results.length - failed.length}/${results.length} PASS`);
  for (const f of failed) log(`  FAIL  ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
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
