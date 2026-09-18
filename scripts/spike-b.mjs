/**
 * Spike B：验证 puppeteer-core 控制本机 Chrome headless 截图。
 * 结论写入 PLAN.md 执行记录。P5 打磨阶段删除本脚本。
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
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  await page.goto('https://example.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.evaluate(() => document.fonts.ready);

  const outDir = join(tmpdir(), 'preview-craft');
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'pc-spike-b.png');
  const buffer = await page.screenshot({ type: 'png' });
  await writeFile(outPath, buffer);
  console.log(`[Spike B] captured ${buffer.length} bytes -> ${outPath}`);
} finally {
  await browser.close();
}
