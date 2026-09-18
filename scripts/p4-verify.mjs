/**
 * P4 自验脚本：真实应用内验证导出闭环。
 * 流程：spawn electron(out/) --remote-debugging-port=9333 → CDP 连接主窗口 →
 *  1) window.api 直调（真实 IPC 链路）：captureStart(github/bilibili) → exportCompose 2x png/jpg/webp + 3x png
 *  2) 文件断言：存在/魔数/尺寸（PNG IHDR、JPEG SOF）/大小合理，并复制到 scripts/p4-out/ 供人工目检
 *  3) 剪贴板：exportClipboard → PowerShell STA 验证 ContainsImage
 *  4) UI 编排：填 URL → 切导出 Tab → 点导出按钮 → 断言进度条出现且 temp 产出新 export 文件
 *  5) 保存对话框（原生 UI）不自动化，留待 P5 安装实测
 */
import { spawn, execSync } from 'node:child_process';
import { mkdir, copyFile, readFile, readdir } from 'node:fs/promises';
import { existsSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'scripts', 'p4-out');
const PORT = 9333;
const results = [];
const LOG = join(ROOT, 'scripts', 'p4-run.log');
const log = (line) => {
  const clean = String(line).replace(/\0/g, '');
  console.log(clean);
  appendFileSync(LOG, `${clean}\n`, 'utf8');
};
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) process.exitCode = 1;
};

const CLASSIC = {
  id: 'classic',
  name: '经典全家福',
  subtitle: '四种屏幕，一个好故事',
  canvas: { width: 1120, height: 870 },
  background: 'twilight',
  placements: [
    { device: 'desktop', x: 320, y: 140, width: 620 },
    { device: 'laptop', x: 100, y: 420, width: 510 },
    { device: 'tablet', x: 850, y: 290, width: 240 },
    { device: 'mobile', x: 710, y: 465, width: 135 }
  ]
};

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
async function assertImage(name, path, fmt, scale) {
  if (!existsSync(path)) return ok(name, false, '文件不存在');
  const buf = await readFile(path);
  const size = buf.length;
  if (fmt === 'png') {
    const magic = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const { w, h } = pngSize(buf);
    const expect = { w: 1120 * scale, h: 870 * scale };
    ok(name, magic && w === expect.w && h === expect.h && size > 100_000, `${w}x${h} ${(size / 1024).toFixed(0)}KB`);
  } else if (fmt === 'jpg') {
    const magic = buf[0] === 0xff && buf[1] === 0xd8;
    const dim = jpegSize(buf);
    const expect = { w: 1120 * scale, h: 870 * scale };
    ok(name, magic && dim && dim.w === expect.w && dim.h === expect.h && size > 30_000, `${dim ? `${dim.w}x${dim.h}` : '?'} ${(size / 1024).toFixed(0)}KB`);
  } else {
    const magic = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
    ok(name, magic && size > 30_000, `${(size / 1024).toFixed(0)}KB`);
  }
  await copyFile(path, join(OUT_DIR, `${name}.${fmt}`));
}

async function main() {
  writeFileSync(LOG, `==== P4 verify ${new Date().toISOString()} ====\n`, 'utf8');
  await mkdir(OUT_DIR, { recursive: true });

  // 1. 清理残留 electron（避免缓存/配置目录冲突导致 GPU cache 报错与 viz 不稳定）
  try { execSync('taskkill /F /IM electron.exe /T 2>nul', { stdio: 'ignore' }); } catch { /* 无残留 */ }
  await new Promise((r) => setTimeout(r, 800));

  // 1. 启动真实应用
  const electronPath = (await import('electron')).default;
  const env = { ...process.env, PC_REMOTE_DEBUGGING_PORT: String(PORT) };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronPath, ['out/main/index.js'], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (d) => { const s = d.toString(); if (!s.includes('DevTools')) console.log('[electron]', s.trim()); });

  // 2. 等待 CDP 与主窗口（排除 #/export 隐藏窗口）
  let browser = null;
  let page = null;
  let lastErr = '';
  for (let i = 0; i < 60 && !page; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = list.find((t) => t.type === 'page' && t.url.includes('index.html') && !t.url.includes('#/export'));
      if (!target) { lastErr = `no target in ${list.length} (urls: ${list.map((t) => t.url.slice(0, 50)).join(' | ')})`; continue; }
      const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      browser = await puppeteer.connect({ browserWSEndpoint: ver.webSocketDebuggerUrl, defaultViewport: null });
      // Electron 不支持 Target.createTarget（newPage 会报 Not supported），直接枚举现有 page
      page = (await browser.pages()).find((p) => p.url().includes('index.html') && !p.url().includes('#/export'));
      if (!page) {
        lastErr = 'connected but main page not found';
        await browser.disconnect();
        browser = null;
      }
      if (!page) lastErr = 'connected but main page not found';
    } catch (e) { lastErr = `${e.message}${e.cause ? ` / ${e.cause.code ?? e.cause.message}` : ''}`; }
    if (i % 10 === 9) log(`[poll ${i + 1}] ${lastErr}`);
  }
  if (!page) { ok('连接主窗口', false, 'CDP 连接失败'); child.kill(); return; }
  ok('连接主窗口', true, page.url().slice(0, 60));

  try {
    // 3. bridge 存在性
    ok('preload bridge', await page.evaluate(() => typeof window.api?.captureStart === 'function' && typeof window.api?.exportCompose === 'function'));

    // 4. 两站点 × 引擎直调导出
    const sites = [
      { name: 'github', url: 'https://github.com', cases: [['png', 2], ['jpg', 2], ['webp', 2], ['png', 3]] },
      { name: 'bilibili', url: 'https://www.bilibili.com', cases: [['png', 2], ['jpg', 2], ['webp', 2]] }
    ];
    let clipboardPng = null;
    for (const site of sites) {
      log(`--- capture ${site.url} ---`);
      const cap = await page.evaluate(async (input) => window.api.captureStart(input),
        { url: site.url, deviceUrls: {}, devices: ['desktop', 'laptop', 'tablet', 'mobile'] });
      const shotCount = Object.keys(cap.shots || {}).length;
      ok(`截图 ${site.name}`, shotCount === 4, `${shotCount}/4 台 ${Object.entries(cap.errors).map(([k, v]) => `${k}:${v}`).join(' ') || ''}`);
      if (shotCount !== 4) continue;

      for (const [fmt, scale] of site.cases) {
        const { path } = await page.evaluate(async (input) => window.api.exportCompose(input),
          { template: CLASSIC, shots: cap.shots, scale, format: fmt, quality: 90 });
        await assertImage(`导出 ${site.name} ${fmt} ${scale}x`, path, fmt, scale);
        if (site.name === 'github' && fmt === 'png' && scale === 2) clipboardPng = path;
      }
    }

    // 5. 剪贴板验证
    if (clipboardPng) {
      await page.evaluate(async (p) => window.api.exportClipboard({ path: p }), clipboardPng);
      await new Promise((r) => setTimeout(r, 500));
      const cmd = 'powershell -STA -NoProfile -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::ContainsImage()"';
      const out = execSync(cmd).toString().trim();
      ok('剪贴板含位图', out === 'True', `ContainsImage=${out}`);
    }

    // 6. UI 编排：填 URL → 切导出 Tab → 点导出 → 进度条 + temp 新文件
    const before = new Set(existsSync(join(process.env.TEMP, 'preview-craft'))
      ? await readdir(join(process.env.TEMP, 'preview-craft')) : []);
    await page.bringToFront();
    const urlInput = await page.waitForSelector('input[placeholder*="输入网址"]', { timeout: 5000 });
    await urlInput.click({ clickCount: 3 });
    await urlInput.type('https://github.com');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('iframe').length > 0, { timeout: 20000 });

    // 切到导出 Tab（role=tab 中文本为"导出"的）
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '导出');
      if (tab) tab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 600));

    // 点导出按钮（Button 文本"导出"，与 Tab 同文案，取 Button 元素）
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].filter((el) => el.textContent.trim() === '导出' && !el.disabled).pop();
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    });
    ok('点击导出按钮', clicked);
    if (clicked) {
      const hasProgress = await page
        .waitForSelector('[aria-label="导出进度"]', { timeout: 10000 })
        .then(() => true).catch(() => false);
      ok('导出进度条出现', hasProgress);
      // 等 handleExport 走完截图+合成（保存对话框弹出前文件已产出）
      let produced = false;
      for (let i = 0; i < 90 && !produced; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const now = await readdir(join(process.env.TEMP, 'preview-craft'));
        produced = now.some((f) => f.startsWith('export-') && !before.has(f));
      }
      ok('UI 导出产出新文件', produced, produced ? 'temp/preview-craft 出现 export-*' : '90s 内未产出（可能对话框阻塞前失败）');
    }
  } finally {
    try { await browser?.disconnect(); } catch { /* ignore */ }
    // 优雅退出（will-quit 会 closeBrowser），3s 未退再强杀
    child.kill();
    const exited = await Promise.race([
      new Promise((r) => child.once('exit', r)),
      new Promise((r) => setTimeout(r, 3000))
    ]);
    if (exited === undefined) {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n==== ${results.length - failed}/${results.length} PASS ====`);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
