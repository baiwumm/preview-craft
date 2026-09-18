import { devicePresets } from '@shared/devices';
import type { DeviceId } from '@shared/types';
import type { CSSProperties, ReactElement } from 'react';

/**
 * CSS 设备壳：金属支架/底座 → 机身 → 刘海/摄像头，纯 div 绘制。
 * 几何全部来自 shared/devices 壳规格，k 为壳显示宽 / 基准宽的折算系数。
 * 不含内屏内容（由 DeviceFrame / ThumbCanvas 自行填充）。
 */
export default function DeviceShellArt({ device, k }: { device: DeviceId; k: number }): ReactElement {
  const { shell } = devicePresets[device].frame;

  const partStyle = (p: (typeof shell.under)[number]): CSSProperties => ({
    position: 'absolute',
    left: p.x * k,
    top: p.y * k,
    width: p.w * k,
    height: p.h * k,
    borderRadius: (p.r ?? 0) * k,
    background: `linear-gradient(180deg, ${shell.metalGradient[0]}, ${shell.metalGradient[1]})`
  });

  return (
    <>
      {shell.under.map((p) => (
        <div key={p.kind} style={partStyle(p)} aria-hidden />
      ))}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: shell.body.x * k,
          top: shell.body.y * k,
          width: shell.body.w * k,
          height: shell.body.h * k,
          borderRadius: shell.body.r * k,
          background: `linear-gradient(180deg, ${shell.bodyGradient[0]}, ${shell.bodyGradient[1]})`,
          boxShadow: `inset 0 0 0 ${Math.max(1, k)}px rgba(255, 255, 255, 0.08)`
        }}
      />
      {shell.over.map((p) => (
        <div
          key={p.kind}
          aria-hidden
          style={{
            position: 'absolute',
            left: p.x * k,
            top: p.y * k,
            width: p.w * k,
            height: p.h * k,
            borderRadius: (p.r ?? 0) * k,
            background:
              p.kind === 'notch'
                ? `linear-gradient(180deg, ${shell.metalGradient[0]}, ${shell.metalGradient[1]})`
                : 'rgba(255, 255, 255, 0.35)'
          }}
        />
      ))}
    </>
  );
}
