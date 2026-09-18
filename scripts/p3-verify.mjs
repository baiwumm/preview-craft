/**
 * P3 自验：模板切换 / 样式面板 / 另存模板 / 删除。临时脚本，P5 删除。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = join(tmpdir(), 'preview-craft');
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://localhost:${process.env.PC_PORT ?? '5188'}`, {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  await sleep(2000);

  // 1. 画廊默认 5 个预设缩略图
  const thumbCount = await page.evaluate(
    () => document.querySelectorAll('[role="button"][tabindex="0"]').length
  );
  console.log('[P3] preset thumbs:', thumbCount);
  await page.screenshot({ path: join(outDir, 'p3-gallery.png') });

  // 2. 切到「灵感错落」（带 rotation）
  const editorial = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('[role="button"]')).find((b) =>
      b.textContent?.includes('灵感错落')
    )
  );
  await editorial.asElement().click();
  await sleep(800);
  await page.screenshot({ path: join(outDir, 'p3-editorial.png') });

  // 3. 切到样式 Tab
  const styleTab = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('样式')
    )
  );
  await styleTab.asElement().click();
  await sleep(600);
  await page.screenshot({ path: join(outDir, 'p3-style.png') });

  // 4. 点击「海盐蓝」背景板
  const bgSwatch = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button')).find((b) => b.title === '海盐蓝')
  );
  await bgSwatch.asElement().click();
  await sleep(500);

  // 5. 键盘微调：聚焦第一个 Slider Thumb（圆角），按 ArrowRight x5
  const thumb =
    (await page.$('[role="slider"]')) ??
    (await page.$('input[type="range"]')) ??
    (await page.$('[data-slot="slider"], .slider__thumb, [class*="slider"]'));
  if (!thumb) {
    const roles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[role]')).map((e) => e.getAttribute('role'))
    );
    console.log('[P3] roles present:', JSON.stringify([...new Set(roles)]));
    throw new Error('slider thumb not found');
  }
  await thumb.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await sleep(400);
  const borderRadius = await page.evaluate(() => {
    const canvasBox = document.querySelector('main > div > div');
    return canvasBox ? getComputedStyle(canvasBox).borderRadius : 'n/a';
  });
  console.log('[P3] canvas borderRadius after arrows:', borderRadius);

  // 6. 另存为模板
  const saveBtn = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('另存为模板')
    )
  );
  await saveBtn.asElement().click();
  await sleep(600);
  await page.screenshot({ path: join(outDir, 'p3-modal.png') });

  const nameInput = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('input')).find((i) =>
      i.closest('[role="dialog"], .modal, form') || i.placeholder?.includes('排版')
    )
  );
  const nameEl = nameInput.asElement();
  if (nameEl) {
    await nameEl.type('我的测试模板');
    await page.keyboard.press('Enter');
    await sleep(800);
  }

  // 7. 回画廊确认自定义模板出现
  const galleryTab = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('模板')
    )
  );
  await galleryTab.asElement().click();
  await sleep(600);
  const state = await page.evaluate(() => ({
    thumbs: document.querySelectorAll('[role="button"][tabindex="0"]').length,
    hasCustom: Array.from(document.querySelectorAll('p')).some((p) =>
      p.textContent?.includes('我的测试模板')
    ),
    customCount: Array.from(document.querySelectorAll('button[aria-label^="删除模板"]')).length
  }));
  console.log('[P3] after save:', JSON.stringify(state));
  await page.screenshot({ path: join(outDir, 'p3-custom.png') });

  // 8. 删除自定义模板
  const delBtn = await page.$('button[aria-label^="删除模板"]');
  if (delBtn) {
    await delBtn.click();
    await sleep(600);
    const after = await page.evaluate(
      () => document.querySelectorAll('button[aria-label^="删除模板"]').length
    );
    console.log('[P3] custom count after delete:', after);
  }

  console.log('[P3] done');
} finally {
  await browser.close();
}
