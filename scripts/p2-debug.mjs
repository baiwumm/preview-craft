import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

try {
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('[console]', msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message, '\n', err.stack?.slice(0, 800)));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${process.env.PC_PORT ?? '5174'}`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await new Promise((r) => setTimeout(r, 1500));

  const handle = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('浅色'))
  );
  const box = await handle.asElement().boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 1000));
  console.log('root class:', await page.evaluate(() => document.documentElement.className));
} finally {
  await browser.close();
}
