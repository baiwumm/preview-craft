import { devicePresets } from '@shared/devices';
import type { EmbedProbeResult, Placement } from '@shared/types';
import type { CSSProperties, ReactElement } from 'react';

import { Button } from '@heroui/react';

import DeviceShellArt from './DeviceShell';

interface DeviceFrameProps {
  placement: Placement;
  url: string;
  /** 是否渲染设备投影（会话样式） */
  shadow?: boolean;
  /** 已截取的设备画面（dataURL），存在时替代 iframe 预览（导出态） */
  shot?: string;
  /** 该设备截图失败（true 或具体原因文案） */
  shotError?: string | boolean;
  /** 站点禁止 iframe 内嵌时的说明（预览态用，避免白屏被当成程序故障） */
  embedHint?: EmbedProbeResult;
  /** 单台重试回调 */
  onRetry?: () => void;
}

/**
 * CSS 设备壳 + 内屏显示。
 * 内屏内容统一放入 overflow-hidden 的裁剪层（圆角由壳规格给出），
 * iframe/截图以 viewport 或 inner 实际尺寸铺入，保证永不变形、圆角处不漏底色。
 */
export default function DeviceFrame({
  placement,
  url,
  shadow,
  shot,
  shotError,
  embedHint,
  onRetry
}: DeviceFrameProps): ReactElement {
  const preset = devicePresets[placement.device];
  const { aspect, inner, screenRadius } = preset.frame;

  const displayWidth = placement.width;
  const displayHeight = displayWidth / aspect;
  // 壳内所有相对尺寸的折算系数
  const k = displayWidth / preset.frame.width;
  // iframe 内容缩放：内屏显示宽 / viewport 宽
  const scale = (inner.width * k) / preset.viewport.width;

  const screenStyle: CSSProperties = {
    position: 'absolute',
    left: inner.x * k,
    top: inner.y * k,
    width: inner.width * k,
    height: inner.height * k,
    borderRadius: screenRadius * k,
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  };

  return (
    <div
      className="absolute"
      style={{
        left: placement.x,
        top: placement.y,
        width: displayWidth,
        height: displayHeight,
        transform: placement.rotation ? `rotate(${placement.rotation}deg)` : undefined,
        filter: shadow ? 'drop-shadow(0 18px 32px rgba(0, 0, 0, 0.35))' : undefined
      }}
    >
      <DeviceShellArt device={placement.device} k={k} />
      <div style={screenStyle}>
        {shot ? (
          <img
            src={shot}
            alt={`${preset.label}截图`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : shotError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-danger/15 px-2 text-center">
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
          <>
            <iframe
              src={url}
              title={`${preset.label}预览`}
              scrolling="no"
              loading="lazy"
              className="absolute border-0 bg-white"
              style={{
                width: preset.viewport.width,
                height: preset.viewport.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                pointerEvents: 'none'
              }}
            />
            {embedHint?.blocked ? (
              <div className="bg-background/95 absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                <span className="text-foreground text-[11px] leading-tight font-medium">
                  该站点禁止内嵌预览
                </span>
                <span className="text-muted text-[10px] leading-tight">
                  点「截图」查看真实效果
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
