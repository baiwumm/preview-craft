import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import Canvas from './Canvas';

import type { ExportRenderPayload } from '@shared/types';

/** 导出隐藏窗口专用页面：接收载荷 → 渲染画布 → 通知就绪 → WebP 编码回调 */
export default function ExportPage(): ReactElement {
  const [payload, setPayload] = useState<ExportRenderPayload | null>(null);

  useEffect(() => window.api.onExportRender(setPayload), []);

  // 导出窗口页面必须透明（透明背景板导出无底 PNG），覆盖 index.html 的 bg-background
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

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
    const check = (): void => {
      const imgs = Array.from(document.images);
      if (imgs.every((i) => i.complete && i.naturalWidth > 0)) {
        window.api.exportReady();
      } else {
        setTimeout(check, 60);
      }
    };
    check();
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
