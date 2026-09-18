import type { DeviceId, Template } from '@shared/types';
import type { ReactElement } from 'react';

import { resolveBackgroundCss } from '@templates/backgrounds';

import DeviceFrame from './DeviceFrame';

import { useFitScale } from '@/hooks/useFitScale';
import type { StyleState } from '@/lib/design';

interface CanvasProps {
  template: Template;
  mainUrl: string;
  deviceUrls: Partial<Record<DeviceId, string>>;
  style: StyleState;
  /** 固定缩放（导出态用 scale，跳过自适应） */
  fixedScale?: number;
  /** 已截取画面（dataURL，键为设备） */
  shots?: Partial<Record<DeviceId, string>>;
  /** 截图失败标记 */
  shotErrors?: Partial<Record<DeviceId, string | boolean>>;
  /** 单台重试 */
  onRetry?: (device: DeviceId) => void;
}

/**
 * 中央画布：背景板铺底（board 层），设备 placements 在内容层按 zoom 缩放，
 * 预览态 iframe / 导出态真实截图所见即所得。
 */
export default function Canvas({
  template,
  mainUrl,
  deviceUrls,
  style,
  fixedScale,
  shots,
  shotErrors,
  onRetry
}: CanvasProps): ReactElement {
  const { borderRadius, shadow, zoom } = style;
  const { ref, scale } = useFitScale(template.canvas.width, template.canvas.height);
  const fit = fixedScale ?? scale;
  const total = fit * zoom;

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="relative overflow-hidden"
        style={{
          width: template.canvas.width * fit,
          height: template.canvas.height * fit,
          background: resolveBackgroundCss(template.background),
          borderRadius
        }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: template.canvas.width,
            height: template.canvas.height,
            transform: `scale(${total})`
          }}
        >
          {template.placements.map((placement) => (
            <DeviceFrame
              key={placement.device}
              placement={placement}
              url={deviceUrls[placement.device] || mainUrl}
              shadow={shadow}
              shot={shots?.[placement.device]}
              shotError={Boolean(shotErrors?.[placement.device])}
              onRetry={onRetry ? () => onRetry(placement.device) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
