import { devicePresets } from '@shared/devices';
import type { Template } from '@shared/types';
import type { ReactElement } from 'react';

import { deviceShadow } from '@/lib/design';

import DeviceShellArt from './DeviceShell';

import { resolveBackgroundCss } from '@templates/backgrounds';

interface ThumbCanvasProps {
  template: Template;
  /** 相对画布基准的缩放（1/4 → 280×217.5） */
  scale?: number;
  className?: string;
}

/** 静态缩略图：按模板 placements 渲染 CSS 设备壳 + 占位色块，无 iframe */
export default function ThumbCanvas({
  template,
  scale = 0.25,
  className
}: ThumbCanvasProps): ReactElement {
  return (
    <div
      className={`overflow-hidden ${className ?? ''}`}
      style={{
        width: template.canvas.width * scale,
        height: template.canvas.height * scale
      }}
    >
      <div
        className="relative origin-top-left"
        style={{
          width: template.canvas.width,
          height: template.canvas.height,
          background: resolveBackgroundCss(template.background),
          transform: `scale(${scale})`
        }}
      >
        {template.placements.map((placement) => {
          const preset = devicePresets[placement.device];
          const { aspect, inner, screenRadius, shell } = preset.frame;
          const k = placement.width / preset.frame.width;
          return (
            <div
              key={placement.device}
              className="absolute"
              style={{
                left: placement.x,
                top: placement.y,
                width: placement.width,
                height: placement.width / aspect,
                transform: placement.rotation ? `rotate(${placement.rotation}deg)` : undefined,
                filter: deviceShadow(placement.width)
              }}
            >
              <DeviceShellArt device={placement.device} k={k} />
              <div
                className="absolute"
                style={{
                  left: inner.x * k,
                  top: inner.y * k,
                  width: inner.width * k,
                  height: inner.height * k,
                  borderRadius: screenRadius * k,
                  overflow: 'hidden',
                  background: 'linear-gradient(180deg, #f7f8fa, #e9ebf0)'
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    borderRadius: screenRadius * k,
                    boxShadow: `inset 0 0 0 ${Math.max(0.6, k)}px rgba(0, 0, 0, 0.55)`
                  }}
                />
                {shell.island ? (
                  <div
                    aria-hidden
                    className="absolute"
                    style={{
                      left: (shell.island.x - inner.x) * k,
                      top: (shell.island.y - inner.y) * k,
                      width: shell.island.w * k,
                      height: shell.island.h * k,
                      borderRadius: shell.island.r * k,
                      background: 'linear-gradient(180deg, #1b1b22, #0a0a0e)'
                    }}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
