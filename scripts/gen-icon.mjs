/**
 * resources/icon.svg → resources/icon.png（512×512 RGBA）
 *
 * electron-builder 在构建期把这张 png 转成 exe 的 ICO，dev 态窗口直接读 png，
 * 所以改完 svg 必须重新生成一次：`pnpm gen:icon`
 * 产物合格与否由冒烟 A 段「应用图标为 512×512 带 alpha 的 RGBA」把关。
 *
 * 用法：node scripts/gen-icon.mjs [--browser=<chrome.exe 或 msedge.exe 路径>]
 */
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'resources', 'icon.svg');
const OUT = join(ROOT, 'resources', 'icon.png');
const SIZE = 512;

/** 出图尺寸取 svg 自己的 width/height，不写死在脚本里，否则改了画布会静默裁切 */
function svgSize(markup) {
  const width = Number(markup.match(/<svg[^>]*\bwidth="(\d+)"/i)?.[1]);
  const height = Number(markup.match(/<svg[^>]*\bheight="(\d+)"/i)?.[1]);
  if (!width || !height) throw new Error('icon.svg 缺少显式 width/height，无法确定出图尺寸');
  return { width, height };
}

/**
 * channel 解析依赖 @puppeteer/browsers 读 ProgramFiles(x86) 之类的环境变量，
 * Git Bash 不透出带括号的环境变量名，于是 msedge 档会直接抛错（实测撞过），
 * 所以再兜一层常见安装路径。
 */
const FALLBACK_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];

async function launch() {
  const explicit = process.argv.find((a) => a.startsWith('--browser='))?.slice('--browser='.length);
  const attempts = explicit
    ? [{ executablePath: explicit }]
    : [
        { channel: 'chrome' },
        { channel: 'msedge' },
        ...FALLBACK_PATHS.filter((p) => existsSync(p)).map((p) => ({ executablePath: p }))
      ];
  const errors = [];
  for (const options of attempts) {
    try {
      return await puppeteer.launch({
        ...options,
        headless: true,
        args: ['--disable-gpu', '--hide-scrollbars']
      });
    } catch (error) {
      errors.push(`${options.channel ?? options.executablePath} — ${error.message.split('\n')[0]}`);
    }
  }
  throw new Error(`起不来 Chromium 内核浏览器，用 --browser=<chrome.exe 路径> 指定：\n${errors.join('\n')}`);
}

const markup = readFileSync(SVG, 'utf8');
const { width, height } = svgSize(markup);
if (width !== SIZE || height !== SIZE) {
  throw new Error(`icon.svg 是 ${width}×${height}，打包要求 ${SIZE}×${SIZE}`);
}

const browser = await launch();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });
  // 直接以 svg 为文档根渲染，不套 <img>（省掉 file:// 授权那一步）。
  // omitBackground 是必须的：不关掉默认白底，圆角外那四个角会被垫成不透明白，
  // 任务栏与开始菜单上就带出一圈白方块。
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:none}</style>${markup}`,
    { waitUntil: 'load' }
  );
  const png = await page.screenshot({
    type: 'png',
    omitBackground: true,
    clip: { x: 0, y: 0, width: SIZE, height: SIZE }
  });
  await writeFile(OUT, png);
  console.log(`已生成 ${relative(ROOT, OUT).replace(/\\/g, '/')} ${width}×${height}，${png.length} 字节`);
} finally {
  await browser.close();
}
