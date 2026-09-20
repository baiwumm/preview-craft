import type { DeviceId, EmbedProbeResult, StyleState, Template } from '@shared/types';
import type { ReactElement } from 'react';

import { isTransparentBackground, resolveBackgroundCss, CHECKER_CSS } from '@templates/backgrounds';

import DeviceFrame from './DeviceFrame';

import { useFitScale } from '@/hooks/useFitScale';

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
  /** 各地址的 iframe 内嵌可行性（预览态拦截提示用） */
  embedHints?: Record<string, EmbedProbeResult>;
  /** 单台重试 */
  onRetry?: (device: DeviceId) => void;
  /** 导出态：透明底不铺棋盘格 */
  exportMode?: boolean;
  /** 透明底垫白（JPG 导出不支持 alpha） */
  flattenWhite?: boolean;
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
  embedHints,
  onRetry,
  exportMode,
  flattenWhite
}: CanvasProps): ReactElement {
  const { borderRadius, shadow, zoom } = style;
  const { ref, scale } = useFitScale(template.canvas.width, template.canvas.height);
  const fit = fixedScale ?? scale;
  const total = fit * zoom;
  const transparentBg = isTransparentBackground(template.background);
  const background = exportMode
    ? resolveBackgroundCss(template.background, flattenWhite)
    : transparentBg
      ? CHECKER_CSS
      : resolveBackgroundCss(template.background);

  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="relative overflow-hidden"
        style={{
          width: template.canvas.width * fit,
          height: template.canvas.height * fit,
          background,
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
          {template.placements.map((placement) => {
            const url = deviceUrls[placement.device] || mainUrl;
            return (
              <DeviceFrame
                key={placement.device}
                placement={placement}
                url={url}
                shadow={shadow}
                shot={shots?.[placement.device]}
                shotError={shotErrors?.[placement.device]}
                embedHint={embedHints?.[url]}
                onRetry={onRetry ? () => onRetry(placement.device) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
