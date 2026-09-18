/**
 * P2 自验：主题切换 + 分设备 URL 行为核验。临时脚本，P5 删除。
 * 使用可嵌入站点（example.com / info.cern.ch）；
 * github.com 等带 X-Frame-Options 的站点无法进 iframe，属站点限制。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = process.env.PC_PORT ?? '5173';
const outDir = join(tmpdir(), 'preview-craft');
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // 0. 输入可嵌入站点并回车
  const mainInput = await page.$('header input');
  await mainInput.type('info.cern.ch');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 6000));

  // 1. 四设备 iframe 均加载主地址
  const srcs1 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).map((f) => f.src)
  );
  console.log('[P2] iframes after load:', JSON.stringify(srcs1));
  await page.screenshot({ path: join(outDir, 'p2-dark.png') });

  // 2. 主题切换
  const themeBtn = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('浅色'))
  );
  await themeBtn.asElement().click();
  await new Promise((r) => setTimeout(r, 600));
  const rootClass = await page.evaluate(() => document.documentElement.className);
  console.log('[P2] root class after toggle:', rootClass);
  await page.screenshot({ path: join(outDir, 'p2-light.png') });

  // 3. 分设备 URL：展开折叠区，给电脑填另一地址
  const trigger = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('分设备 URL')
    )
  );
  await trigger.asElement().click();
  await new Promise((r) => setTimeout(r, 600));

  const deviceInput = await page.evaluateHandle(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.find((i) => i.placeholder?.includes('电脑'));
  });
  const inputEl = deviceInput.asElement();
  await inputEl.type('https://example.com');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 6000));

  const srcs2 = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).map((f) => f.src)
  );
  console.log('[P2] iframes after device url:', JSON.stringify(srcs2));
  await page.screenshot({ path: join(outDir, 'p2-deviceurl.png') });
  console.log('[P2] done');
} finally {
  await browser.close();
}
