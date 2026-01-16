/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-13 17:48:31
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-16 15:09:23
 * @Description: 设备框架
 */
import { DEVICES, MODE } from '@/enums';
import { getInitialTheme } from "@/lib/theme";
import { cn } from '@/lib/utils';

interface DeviceFrameProps {
  type: App.DeviceType;
  url: string;
  mode: App.Mode;
}

export default function DeviceFrame({ type, url, mode }: DeviceFrameProps) {
  const device = DEVICES.raw(type);

  // 内屏区域
  const innerWidth = device.inner.width;
  const innerHeight = device.inner.height;

  // inner 决定比例
  const innerAspect = innerWidth / innerHeight;

  // viewport 只是等比画布
  const viewportWidth = device.viewport.width;
  const viewportHeight = Math.round(viewportWidth / innerAspect);

  // iframe 缩放比例（单一 scale，永不变形）
  const scale = innerWidth / viewportWidth;

  // 壳子高度
  const shellHeight = device.shell.width / device.shell.aspect;

  // 使用第三方 API 
  function buildScreenshotUrl() {
    const params = new URLSearchParams({
      url,
      screenshot: 'true',
      embed: 'screenshot.url',
      meta: 'false',
      colorScheme: getInitialTheme(),
      'viewport.width': String(viewportWidth),
      'viewport.height': String(viewportHeight),
      'viewport.isMobile': type === DEVICES.MOBILE ? 'true' : 'false',
      'viewport.deviceScaleFactor': '1',
    })

    return `https://api.microlink.io/?${params.toString()}`
  }
  return (
    <div
      id={type}
      className={cn("absolute bg-no-repeat bg-contain", device.wrapClassName)}
      style={{
        width: device.shell.width,
        height: shellHeight,
        backgroundImage: `url(${type}.png)`,
      }}
    >
      {mode === MODE.PREVIEW ? (
        <iframe
          src={url}
          frameBorder="0"
          scrolling="no"
          width={viewportWidth}
          height={viewportHeight}
          className={cn("absolute origin-top-left", device.iframeClassName)}
          style={{ transform: `scale(${scale})`, }}
        />
      ) : (
        <div
          className={cn("absolute origin-top-left overflow-hidden flex justify-center items-center", device.innerMaskClassName)}
          style={{ width: innerWidth, height: innerHeight }}>
          <img
            src={buildScreenshotUrl()}
            className="w-full h-full block"
            alt={device.label}
          />
        </div>
      )}
    </div>
  );
}

