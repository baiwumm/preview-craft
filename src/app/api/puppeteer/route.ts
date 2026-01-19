/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 16:03:33
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 17:20:18
 * @Description: puppeteer 生成截图
 */
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { url, selector = '#preview', scale = 1 } = await req.json();
    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    }

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath:
        process.platform === 'win32'
          ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
          : undefined,
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1440,
      height: 3000,
      deviceScaleFactor: scale,
    });

    // 1️⃣ 打开页面
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // 2️⃣ 等字体
    await page.evaluate(() => document.fonts.ready);

    // 3️⃣ 等 iframe
    await page.evaluate(async () => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      await Promise.all(
        frames.map(
          iframe =>
            new Promise<void>(resolve => {
              if (!iframe.src) return resolve();
              iframe.addEventListener('load', () => setTimeout(resolve, 2000), { once: true });
            })
        )
      );
    });

    // 4️⃣ 等 loading / 图片
    await page.waitForFunction(() => {
      const imgs = Array.from(document.images);
      if (imgs.some(img => !img.complete)) return false;

      return true;
    });

    // 5️⃣ 禁动画 + 去背景
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }

        html, body {
          background: transparent !important;
        }

        ${selector}, ${selector} * {
          background-color: transparent !important;
          box-shadow: none !important;
        }
      `,
    });

    // 6️⃣ 稳定一帧
    await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));

    const el = await page.$(selector);
    if (!el) throw new Error('selector not found');

    const box = await el.boundingBox();
    if (!box) throw new Error('invalid bounding box');

    const png = await page.screenshot({
      type: 'png',
      omitBackground: true,
      clip: {
        x: Math.floor(box.x),
        y: Math.floor(box.y),
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      },
    });

    await browser.close();

    return new NextResponse(Buffer.from(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="preview.png"',
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'export failed' },
      { status: 500 }
    );
  }
}



