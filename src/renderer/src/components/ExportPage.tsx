import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import Canvas from './Canvas';

import type { ExportRenderPayload } from '@shared/types';

/** 导出隐藏窗口专用页面：接收载荷 → 渲染画布 → 通知就绪 → WebP 编码回调 */
export default function ExportPage(): ReactElement {
  const [payload, setPayload] = useState<ExportRenderPayload | null>(null);

  useEffect(() => window.api.onExportRender(setPayload), []);

  // 导出窗口页面必须透明（透明背景板导出无底 PNG），覆盖 index.html 的 bg-background。
  // JPG 无 alpha：画布带圆角时四角是被裁掉的透明区，页面若不铺白会被渲染成黑角，故垫白跟随。
  useEffect(() => {
    const bg = payload?.flattenWhite ? '#ffffff' : 'transparent';
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, [payload?.flattenWhite]);

  // WebP 编码：PNG dataURL → OffscreenCanvas.convertToBlob
  useEffect(
    () =>
      window.api.onWebpConvert(async ({ dataUrl, quality }) => {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('WebP 解码失败'));
          img.src = dataUrl;
        });
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('OffscreenCanvas 2d context 不可用');
        ctx.drawImage(img, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: quality / 100 });
        window.api.exportWebpResult(await blob.arrayBuffer());
      }),
    []
  );

  // 渲染完成后等待所有图片解码，再通知主进程 capturePage
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 15_000;
    const check = (): void => {
      if (cancelled) return;
      const imgs = Array.from(document.images);
      if (imgs.every((i) => i.complete && i.naturalWidth > 0)) {
        window.api.exportReady();
        return;
      }
      // 到点就停：图片永不解码时让主进程的 20s 硬超时把错误抛给用户，
      // 既不在这里无限轮询，也绝不在缺图时谎报就绪
      if (Date.now() > deadline) return;
      timer = setTimeout(check, 60);
    };
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [payload]);

  if (!payload) return <div className="h-screen w-screen" />;

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Canvas
        template={payload.template}
        mainUrl=""
        deviceUrls={{}}
        style={{ ...payload.style, customFrom: '', customTo: '' }}
        fixedScale={payload.scale}
        shots={payload.shots}
        exportMode
        flattenWhite={payload.flattenWhite}
      />
    </div>
  );
}
