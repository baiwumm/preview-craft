import type { DeviceId, Template } from '@shared/types';
import type { ReactElement } from 'react';

import { getBackground, resolveBackgroundCss } from '@templates/backgrounds';

import DeviceFrame from './DeviceFrame';

import { useFitScale } from '@/hooks/useFitScale';
import type { StyleState } from '@/lib/design';

interface CanvasProps {
  template: Template;
  mainUrl: string;
  deviceUrls: Partial<Record<DeviceId, string>>;
  style: StyleState;
}

/** 中央画布：按模板 placements 绝对定位摆放设备壳，画布外铺背景板 */
export default function Canvas({ template, mainUrl, deviceUrls, style }: CanvasProps): ReactElement {
  const { borderRadius, shadow, zoom } = style;
  const { ref, scale } = useFitScale(template.canvas.width, template.canvas.height);
  const totalScale = scale * zoom;

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="overflow-hidden"
        style={{
          width: template.canvas.width * totalScale,
          height: template.canvas.height * totalScale,
          borderRadius
        }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: template.canvas.width,
            height: template.canvas.height,
            background: resolveBackgroundCss(template.background),
            transform: `scale(${totalScale})`
          }}
        >
          {template.placements.map((placement) => (
            <DeviceFrame
              key={placement.device}
              placement={placement}
              url={deviceUrls[placement.device] || mainUrl}
              shadow={shadow}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export { getBackground };
