import type { DeviceId, Template } from '@shared/types';
import type { ReactElement } from 'react';

import { getBackground } from '@templates/backgrounds';

import DeviceFrame from './DeviceFrame';

import { useFitScale } from '@/hooks/useFitScale';

interface CanvasProps {
  template: Template;
  mainUrl: string;
  deviceUrls: Partial<Record<DeviceId, string>>;
}

/** 中央画布：按模板 placements 绝对定位摆放设备壳，画布外铺背景板 */
export default function Canvas({ template, mainUrl, deviceUrls }: CanvasProps): ReactElement {
  const background = getBackground(template.background);
  const { ref, scale } = useFitScale(template.canvas.width, template.canvas.height);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="shadow-surface overflow-hidden"
        style={{ width: template.canvas.width * scale, height: template.canvas.height * scale }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: template.canvas.width,
            height: template.canvas.height,
            background: background.value,
            transform: `scale(${scale})`
          }}
        >
          {template.placements.map((placement) => (
            <DeviceFrame
              key={placement.device}
              placement={placement}
              url={deviceUrls[placement.device] || mainUrl}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
