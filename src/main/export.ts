import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { BrowserWindow, ipcMain } from 'electron';

import type { DeviceId, ExportComposeInput, ExportRenderPayload } from '@shared/types';

import { deviceIds } from '@shared/devices';

import { shotCacheDir } from './capture';

const EXPORT_HTML = join(__dirname, '../renderer/index.html');

/** 读取截图文件并转为 dataURL */
export async function shotToDataUrl(path: string): Promise<string> {
  const buffer = await readFile(path);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * 隐藏窗口合成导出。
 * 窗口按 1x 画布尺寸创建（任何屏幕都放得下）；真实窗口会被 OS 钳制在工作区内，
 * 因此导出前用 CDP Emulation.setVisibleSize 把布局视口扩到 scale 倍，capturePage
 * 即可拿到完整帧（探针验证：offscreen + setVisibleSize → 2240x1740 全尺寸输出）。
 */
export async function exportCompose(input: ExportComposeInput): Promise<{ path: string }> {
  const { template, shots, scale, format, quality, style } = input;
  const zoom = style?.zoom ?? 1;
  const cssW = Math.round(template.canvas.width * scale);
  const cssH = Math.round(template.canvas.height * scale);

  const shotsData: Partial<Record<DeviceId, string>> = {};
  for (const device of deviceIds) {
    const shotPath = shots[device];
    if (shotPath) shotsData[device] = await shotToDataUrl(shotPath);
  }

  const win = new BrowserWindow({
    show: false,
    width: template.canvas.width,
    height: template.canvas.height,
    useContentSize: true,
    // 透明窗口：透明背景板导出无底 PNG（capturePage 保留 alpha）
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      // offscreen：隐藏窗口持续产帧，capturePage/CDP 均可靠（Spike A 备份路线）
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // ExportPage 依赖 window.api 接收载荷并回传 export:ready / WebP 结果
      preload: join(__dirname, '../preload/index.js')
    }
  });
  win.webContents.setFrameRate(30);

  try {
    // hash 路由：导出专用页面（复用 Canvas 组件，无交互元素）
    await win.loadFile(EXPORT_HTML, { hash: '/export' }).catch(() => undefined);

    const payload: ExportRenderPayload = {
      template,
      scale,
      shots: shotsData as Record<DeviceId, string>,
      style: {
        borderRadius: style?.borderRadius ?? 0,
        shadow: style?.shadow ?? true,
        zoom
      },
      // JPG 不支持 alpha：透明底垫白
      flattenWhite: format === 'jpg'
    };
    win.webContents.send('export:render', payload);

    // 等待页面渲染 + 图片解码完成
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('导出渲染超时')), 20_000);
      ipcMain.once('export:ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 布局视口扩到 scale 倍（真实窗口保持 1x，不受 OS 工作区钳制）
    try {
      const dbg = win.webContents.debugger;
      dbg.attach('1.3');
      await dbg.sendCommand('Page.enable');
      await dbg.sendCommand('Emulation.setVisibleSize', { width: cssW, height: cssH });
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      throw new Error(`导出视口设置失败：${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }

    // 整帧截取；capturePage 偶发 UnknownVizError（合成器瞬态），重试 3 次自愈
    let image: Electron.NativeImage | null = null;
    let lastCaptureError: unknown = null;
    for (let attempt = 0; attempt < 3 && !image; attempt++) {
      try {
        image = await win.webContents.capturePage();
      } catch (error) {
        lastCaptureError = error;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    if (!image) {
      throw new Error(`导出截图失败：${lastCaptureError instanceof Error ? lastCaptureError.message : String(lastCaptureError)}`, { cause: lastCaptureError });
    }

    let buffer: Buffer;
    if (format === 'png') {
      buffer = image.toPNG();
    } else if (format === 'jpg') {
      buffer = image.toJPEG(quality ?? 90);
    } else {
      buffer = await convertWebpInPage(win, image.toPNG(), quality ?? 90);
    }

    const outDir = shotCacheDir();
    await mkdir(outDir, { recursive: true });
    const outPath = join(outDir, `export-${randomUUID()}.${format}`);
    await writeFile(outPath, buffer);
    return { path: outPath };
  } finally {
    try {
      win.webContents.debugger.detach();
    } catch {
      // 未 attach 或已 detach，忽略
    }
    win.destroy();
  }
}

/** WebP：把 PNG 交给导出窗口用 OffscreenCanvas.convertToBlob 编码 */
function convertWebpInPage(win: BrowserWindow, png: Buffer, quality: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebP 编码超时')), 15_000);
    ipcMain.once('export:webp:result', (_event, data: ArrayBuffer) => {
      clearTimeout(timer);
      resolve(Buffer.from(data));
    });
    win.webContents.send('export:webp:convert', {
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      quality
    });
  });
}
