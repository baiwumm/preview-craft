/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-13 17:48:31
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-15 15:33:49
 * @Description: 设备框架
 */
import { DEVICES } from '@/enums';
import { cn } from '@/lib/utils';

interface DeviceFrameProps {
  type: typeof DEVICES.valueType;
  url: string;
}

export default function DeviceFrame({ type, url }: DeviceFrameProps) {
  const device = DEVICES.raw(type);

  // inner 决定比例
  const innerAspect = device.inner.width / device.inner.height;

  // viewport 只是等比画布
  const viewportWidth = device.viewport.width;
  const viewportHeight = Math.round(viewportWidth / innerAspect);

  // iframe 缩放比例（单一 scale，永不变形）
  const scale = device.inner.width / viewportWidth;

  // 壳子高度
  const shellHeight = device.shell.width / device.shell.aspect;
  return (
    <div
      className={cn("absolute bg-no-repeat bg-contain", device.wrapClassName)}
      style={{
        width: device.shell.width,
        height: shellHeight,
        backgroundImage: `url(${type}.png)`,
      }}
    >
      <iframe
        src={url}
        frameBorder="0"
        scrolling="no"
        width={viewportWidth}
        height={viewportHeight}
        className={cn("absolute origin-top-left", device.iframeClassName)}
        style={{ transform: `scale(${scale})`, }}
      />
    </div>
  );
}

