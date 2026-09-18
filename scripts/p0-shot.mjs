/**
 * P0 自验辅助：用本机 Chrome 无头截取 renderer dev server 页面。
 * 临时脚本，P5 打磨阶段删除。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:5173', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const outDir = join(tmpdir(), 'preview-craft');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'pc-p0-renderer.png');
  const buffer = await page.screenshot({ type: 'png' });
  await writeFile(outPath, buffer);
  console.log(`captured ${buffer.length} bytes -> ${outPath}`);
} finally {
  await browser.close();
}
