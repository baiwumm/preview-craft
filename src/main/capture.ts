/// <reference lib="dom" />

import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import puppeteer, { type Browser } from 'puppeteer-core';
import { app } from 'electron';

import type { CacheStats, CaptureProgress, CaptureResult, CaptureStartInput, DeviceId } from '@shared/types';

import { devicePresets, deviceIds } from '@shared/devices';

/** 截图与导出产物的临时目录（设置页「清除缓存」的作用域） */
export function shotCacheDir(): string {
  return join(app.getPath('temp'), 'preview-craft');
}

export async function cacheStats(): Promise<CacheStats> {
  const dir = shotCacheDir();
  let files = 0;
  let bytes = 0;
  try {
    for (const name of await readdir(dir)) {
      try {
        const info = await stat(join(dir, name));
        if (info.isFile()) {
          files += 1;
          bytes += info.size;
        }
      } catch {
        // 读取单个文件信息失败，忽略
      }
    }
  } catch {
    // 目录尚未创建
  }
  return { files, bytes };
}

/** 清理临时截图/导出产物；被占用的文件跳过不报错 */
export async function cacheClear(): Promise<CacheStats> {
  const dir = shotCacheDir();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return { files: 0, bytes: 0 };
  }
  let removed = 0;
  let bytes = 0;
  for (const name of names) {
    const full = join(dir, name);
    try {
      const info = await stat(full);
      if (!info.isFile()) continue;
      await rm(full, { force: true });
      removed += 1;
      bytes += info.size;
    } catch {
      // 文件被占用或已消失，跳过
    }
  }
  return { files: removed, bytes };
}

/**
 * 浏览器实例复用：连续截图不重复 launch。
 *
 * 三条纪律，缺一条就会把用户困在「只能重启应用」里：
 * - 失败的 promise 不能留着（一次 launch 失败会让之后每次截图都拿到同一个 rejection）
 * - 实例断连（Chrome 崩了 / 被任务管理器杀掉）即清缓存，下一次重新 launch
 * - 缓存要连带路径一起记，否则「设置 → 浏览器」换了路径也不生效
 */
let cached: { path: string; promise: Promise<Browser> } | null = null;

export function launchBrowser(executablePath: string): Promise<Browser> {
  if (cached?.path === executablePath) return cached.promise;

  const previous = cached;
  const entry: { path: string; promise: Promise<Browser> } = {
    path: executablePath,
    promise: (async () => {
      if (previous) {
        const old = await previous.promise.catch(() => null);
        await old?.close().catch(() => undefined);
      }
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio']
      });
      browser.once('disconnected', () => {
        if (cached === entry) cached = null;
      });
      return browser;
    })().catch((error: unknown) => {
      if (cached === entry) cached = null;
      throw error;
    })
  };
  cached = entry;
  return entry.promise;
}

export async function closeBrowser(): Promise<void> {
  const entry = cached;
  cached = null;
  if (!entry) return;
  const browser = await entry.promise.catch(() => null);
  await browser?.close().catch(() => undefined);
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
  const outDir = shotCacheDir();
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
