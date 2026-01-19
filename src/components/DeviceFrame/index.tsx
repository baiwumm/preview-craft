/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-13 17:48:31
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 14:57:31
 * @Description: 设备框架
 */
'use client';
import { TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef } from 'react';

import { Alert, AlertContent, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Spinner } from "@/components/ui/spinner";
import { DEVICES, MODE, THEME } from '@/enums';
import { useScreenshot } from '@/hooks/useScreenshot';
import { cn } from '@/lib/utils';

interface DeviceFrameProps {
  type: App.DeviceType;
  url: string;
  mode: App.Mode;
}

export default function DeviceFrame({ type, url, mode }: DeviceFrameProps) {
  const { theme } = useTheme();
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

  // 使用第三方 API 截图
  const { screenshotUrl, loading, capture } = useScreenshot()

  const handleCapture = useCallback(() => {
    if (loading) return // 防并发
    capture({
      url,
      width: viewportWidth,
      height: viewportHeight,
      device: type,
      theme: theme as typeof THEME.valueType,
    })
  }, [url, viewportWidth, viewportHeight, type, theme, capture, loading])

  const lastUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (mode !== MODE.EXPORT) {
      lastUrlRef.current = null
      return
    }

    if (lastUrlRef.current === url) return

    lastUrlRef.current = url
    handleCapture()
  }, [mode, url, handleCapture])
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
          {loading ? (
            <div className="absolute inset-0 flex w-full h-full justify-center items-center flex-col z-999 overflow-hidden">
              <div className="flex flex-col items-center gap-2">
                <Spinner className="size-5" />
                <span className="font-bold text-xs">生成截图...</span>
              </div>
            </div>
          ) : screenshotUrl ? (
            <Image src={screenshotUrl || ''} alt={device.label} fill unoptimized />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-center items-center gap-2 bg-default-100 text-default-foreground">
              <Alert variant="destructive" className="size-max">
                <AlertIcon>
                  <TriangleAlert />
                </AlertIcon>
                <AlertContent>
                  <AlertTitle>截图失败!</AlertTitle>
                </AlertContent>
              </Alert>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

