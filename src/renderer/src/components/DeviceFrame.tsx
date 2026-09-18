import { devicePresets } from '@shared/devices';
import type { DeviceId, Placement } from '@shared/types';
import type { ReactElement } from 'react';

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
}

/**
 * 设备壳 + 内屏预览。
 * 壳图按 placement.width 显示，内屏绝对定位在 inner 区域，
 * iframe 以 viewport 实际尺寸渲染后 scale(inner/viewport) 铺入，保证永不变形。
 */
export default function DeviceFrame({ placement, url, shadow }: DeviceFrameProps): ReactElement {
  const preset = devicePresets[placement.device];
  const { aspect, inner } = preset.frame;

  const displayWidth = placement.width;
  const displayHeight = displayWidth / aspect;
  // 壳内所有相对尺寸的折算系数
  const k = displayWidth / preset.frame.width;
  // iframe 内容缩放：内屏显示宽 / viewport 宽
  const scale = (inner.width * k) / preset.viewport.width;

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
      {url ? (
        <iframe
          src={url}
          title={`${preset.label}预览`}
          scrolling="no"
          loading="lazy"
          className="absolute overflow-hidden border-0 bg-white"
          style={{
            left: inner.x * k,
            top: inner.y * k,
            width: preset.viewport.width,
            height: preset.viewport.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            borderRadius: innerRadius[placement.device] * k,
            pointerEvents: 'none'
          }}
        />
      ) : null}
    </div>
  );
}
