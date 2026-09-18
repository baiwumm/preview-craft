/// <reference lib="dom" />

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import puppeteer, { type Browser } from 'puppeteer-core';
import { app } from 'electron';

import type { CaptureProgress, CaptureResult, CaptureStartInput, DeviceId } from '@shared/types';

import { devicePresets, deviceIds } from '@shared/devices';

import { detectBrowsers } from './browser';

/** 浏览器实例复用：连续截图不重复 launch */
let browserPromise: Promise<Browser> | null = null;

export function launchBrowser(executablePath: string): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio']
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    await browser?.close().catch(() => undefined);
    browserPromise = null;
  }
}

/** 带超时兜底的 Promise.race，超时返回 undefined 不中断流程 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))
  ]);
}

/** 单台设备的完整等待策略与截图 */
async function captureDevice(
  browser: Browser,
  input: CaptureStartInput,
  device: DeviceId,
  outDir: string
): Promise<string> {
  const preset = devicePresets[device];
  const url = input.deviceUrls[device] || input.url;

  const page = await browser.newPage();
  try {
    // 在任何页面脚本前挂捕获阶段监听，为每个 iframe 打加载完成标记（跨域 iframe 也可行）
    await page.evaluateOnNewDocument(() => {
      document.addEventListener(
        'load',
        (event) => {
          const target = event.target as HTMLElement | null;
          if (target && target.tagName === 'IFRAME') {
            target.setAttribute('data-pc-loaded', 'true');
          }
        },
        true
      );
    });

    await page.setViewport({
      width: preset.viewport.width,
      height: preset.viewport.height,
      deviceScaleFactor: 2,
      isMobile: preset.isMobile,
      hasTouch: preset.hasTouch
    });
    await page.setUserAgent(preset.ua);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // 等待字体就绪
    await withTimeout(
      page.evaluate(() => document.fonts.ready.then(() => undefined)),
      10_000
    );

    // 等待所有 iframe load（标记法）+ 2s
    await withTimeout(
      page.evaluate(
        () =>
          Promise.all(
            Array.from(document.querySelectorAll('iframe')).map(
              (frame) =>
                new Promise<void>((resolve) => {
                  if (frame.getAttribute('data-pc-loaded') === 'true') {
                    resolve();
                    return;
                  }
                  frame.addEventListener('load', () => resolve(), { once: true });
                })
            )
          )
      ),
      20_000
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 等待所有图片 complete
    await withTimeout(
      page.evaluate(() =>
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise<void>((resolve) => {
                  img.addEventListener('load', () => resolve(), { once: true });
                  img.addEventListener('error', () => resolve(), { once: true });
                })
            )
        )
      ),
      15_000
    );

    // 注入冻结动画 CSS
    await page.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'
    });

    // requestAnimationFrame 稳两帧，保证冻结样式生效且渲染完成
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );

    const buffer = await page.screenshot({ type: 'png', captureBeyondViewport: false });
    const path = join(outDir, `${randomUUID()}.png`);
    await writeFile(path, buffer);
    return path;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** 4 设备并行截图，单台失败不拖垮其他台（allSettled 语义） */
export async function captureStart(
  executablePath: string,
  input: CaptureStartInput,
  onProgress: (progress: CaptureProgress) => void
): Promise<CaptureResult> {
  const browser = await launchBrowser(executablePath);
  const outDir = join(app.getPath('temp'), 'preview-craft');
  await mkdir(outDir, { recursive: true });

  const devices = input.devices.length > 0 ? input.devices : deviceIds;
  const result: CaptureResult = { shots: {}, errors: {} };

  await Promise.all(
    devices.map(async (device) => {
      onProgress({ device, status: 'pending' });
      try {
        const path = await captureDevice(browser, input, device, outDir);
        result.shots[device] = path;
        onProgress({ device, status: 'done', path });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors[device] = message;
        onProgress({ device, status: 'error', error: message });
      }
    })
  );

  return result;
}

/** P1 自验钩子：PC_CAPTURE_TEST=<url> 时对 4 设备截图并打印结果，P5 移除 */
export async function runCaptureSelfTest(url: string): Promise<void> {
  const detected = await detectBrowsers();
  if (detected.length === 0) {
    console.log('[P1 self-test] 未检测到可用浏览器');
    return;
  }
  console.log(`[P1 self-test] browser: ${detected[0].path}`);
  const result = await captureStart(detected[0].path, { url, deviceUrls: {}, devices: [] }, (p) => {
    console.log(`[P1 self-test] ${p.device} -> ${p.status}${p.error ? ` (${p.error})` : ''}`);
  });
  for (const [device, path] of Object.entries(result.shots)) {
    console.log(`[P1 self-test] shot ${device}: ${path}`);
  }
  for (const [device, error] of Object.entries(result.errors)) {
    console.log(`[P1 self-test] error ${device}: ${error}`);
  }
  await closeBrowser();
}
