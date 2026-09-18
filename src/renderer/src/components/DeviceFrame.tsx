import { devicePresets } from '@shared/devices';
import type { DeviceId, Placement } from '@shared/types';
import type { ReactElement } from 'react';

import { Button } from '@heroui/react';

import desktopFrame from '@frames/desktop.png';
import laptopFrame from '@frames/laptop.png';
import mobileFrame from '@frames/mobile.png';
import tabletFrame from '@frames/tablet.png';

export const frameImages: Record<DeviceId, string> = {
  desktop: desktopFrame,
  laptop: laptopFrame,
  tablet: tabletFrame,
  mobile: mobileFrame
};

/** 各设备内屏圆角（壳显示宽 100% 基准下的 px，随缩放系数折算） */
const innerRadius: Record<DeviceId, number> = { desktop: 24, laptop: 20, tablet: 16, mobile: 24 };

interface DeviceFrameProps {
  placement: Placement;
  url: string;
  /** 是否渲染设备投影（会话样式） */
  shadow?: boolean;
  /** 已截取的设备画面（dataURL），存在时替代 iframe 预览（导出态） */
  shot?: string;
  /** 该设备截图失败（true 或具体原因文案） */
  shotError?: string | boolean;
  /** 单台重试回调 */
  onRetry?: () => void;
}

/**
 * 设备壳 + 内屏显示。
 * 壳图按 placement.width 显示，内屏绝对定位在 inner 区域，
 * iframe/截图以 viewport 或 inner 实际尺寸铺入，保证永不变形。
 */
export default function DeviceFrame({
  placement,
  url,
  shadow,
  shot,
  shotError,
  onRetry
}: DeviceFrameProps): ReactElement {
  const preset = devicePresets[placement.device];
  const { aspect, inner } = preset.frame;

  const displayWidth = placement.width;
  const displayHeight = displayWidth / aspect;
  // 壳内所有相对尺寸的折算系数
  const k = displayWidth / preset.frame.width;
  // iframe 内容缩放：内屏显示宽 / viewport 宽
  const scale = (inner.width * k) / preset.viewport.width;

  const innerStyle = {
    left: inner.x * k,
    top: inner.y * k,
    width: inner.width * k,
    height: inner.height * k,
    borderRadius: innerRadius[placement.device] * k
  } as const;

  return (
    <div
      className="absolute"
      style={{
        left: placement.x,
        top: placement.y,
        width: displayWidth,
        height: displayHeight,
        backgroundImage: `url(${frameImages[placement.device]})`,
        backgroundSize: '100% 100%',
        transform: placement.rotation ? `rotate(${placement.rotation}deg)` : undefined,
        filter: shadow ? 'drop-shadow(0 18px 32px rgba(0, 0, 0, 0.35))' : undefined
      }}
    >
      {shot ? (
        <img
          src={shot}
          alt={`${preset.label}截图`}
          className="absolute object-cover"
          style={innerStyle}
          draggable={false}
        />
      ) : shotError ? (
        <div
          className="absolute flex flex-col items-center justify-center gap-2 bg-danger/15 px-2 text-center"
          style={innerStyle}
        >
          <span className="text-danger text-[10px] leading-tight break-words">
            {typeof shotError === 'string' && shotError ? shotError : '截图失败'}
          </span>
          {onRetry ? (
            <Button size="sm" variant="primary" onPress={onRetry}>
              重试
            </Button>
          ) : null}
        </div>
      ) : url ? (
        <iframe
          src={url}
          title={`${preset.label}预览`}
          scrolling="no"
          loading="lazy"
          className="absolute overflow-hidden border-0 bg-white"
          style={{
            ...innerStyle,
            width: preset.viewport.width,
            height: preset.viewport.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none'
          }}
        />
      ) : null}
    </div>
  );
}
