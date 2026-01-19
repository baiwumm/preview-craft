/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-13 17:48:31
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 09:30:36
 * @Description: 设备框架
 */
import { TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Alert, AlertContent, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Spinner } from "@/components/ui/spinner";
import { DEVICES, MODE, SCREEN_STATUS } from '@/enums';
import { getInitialTheme } from "@/lib/theme";
import { cn } from '@/lib/utils';

interface DeviceFrameProps {
  type: App.DeviceType;
  url: string;
  mode: App.Mode;
}

export default function DeviceFrame({ type, url, mode }: DeviceFrameProps) {
  const device = DEVICES.raw(type);
  const [status, setStatus] = useState<typeof SCREEN_STATUS.valueType>(SCREEN_STATUS.LOADING)

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
  const screenshotUrl = useMemo(() => {
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
  }, [url, viewportWidth, viewportHeight, type])
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
          {/* loading 状态 */}
          {status === SCREEN_STATUS.LOADING ? (
            <div className="absolute inset-0 flex w-full h-full justify-center items-center flex-col z-999 overflow-hidden">
              <div className="flex flex-col items-center gap-2">
                <Spinner className="size-5" />
                <span className="font-bold text-xs">{SCREEN_STATUS.label(SCREEN_STATUS.LOADING)}</span>
              </div>
            </div>
          ) : null}
          {/* error 状态 */}
          {status === SCREEN_STATUS.ERROR && (
            <div className="absolute inset-0 flex flex-col justify-center items-center gap-2 bg-default-100 text-default-foreground">
              <Alert variant="destructive" className="size-max">
                <AlertIcon>
                  <TriangleAlert />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>{SCREEN_STATUS.label(SCREEN_STATUS.ERROR)}</AlertTitle>
                </AlertContent>
              </Alert>
            </div>
          )}
          {/* 加载成功 */}
          {status !== SCREEN_STATUS.ERROR && (
            <img
              key={screenshotUrl}
              src={screenshotUrl}
              alt={device.label}
              className="w-full h-full block"
              onLoadStart={() => setStatus(SCREEN_STATUS.LOADING)}
              onLoad={() => setStatus(SCREEN_STATUS.SUCCESS)}
              onError={() => setStatus(SCREEN_STATUS.ERROR)}
            />
          )}
        </div>
      )}
    </div>
  );
}

