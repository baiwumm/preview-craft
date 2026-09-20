import type { DeviceId, Template } from '@shared/types';

/** 会话级样式（不属于模板 schema，另存模板时不携带） */
export interface StyleState {
  /** 画布圆角 px */
  borderRadius: number;
  /** 设备阴影 */
  shadow: boolean;
  /** 画布整体缩放（视觉系数，1 = 适配铺满） */
  zoom: number;
  /** 自定义渐变起止色（hex） */
  customFrom: string;
  customTo: string;
}

export const defaultStyle: StyleState = {
  borderRadius: 0,
  shadow: true,
  zoom: 1,
  customFrom: '#ff9a3d',
  customTo: '#7b2ff7'
};

export function cloneTemplate(template: Template): Template {
  return {
    ...template,
    canvas: { ...template.canvas },
    placements: template.placements.map((p) => ({ ...p }))
  };
}

export function isCustomBackground(key: string): boolean {
  return key.startsWith('custom:');
}

/**
 * 设备投影：按显示宽分级、双层叠加（近距贴合 + 远距扩散）。
 * 固定 blur 半径会让手机这类小尺寸设备"飘"在画布上，故随绝对显示宽折算；
 * 上下限避免超大屏阴影糊成一团、超小屏几乎看不见。
 */
export function deviceShadow(displayWidth: number): string {
  const s = Math.min(1.6, Math.max(0.45, displayWidth / 400));
  const layer = (dy: number, blur: number, alpha: number) =>
    `drop-shadow(0 ${(dy * s).toFixed(1)}px ${(blur * s).toFixed(1)}px rgba(8, 8, 18, ${alpha}))`;
  return `${layer(5, 10, 0.18)} ${layer(18, 34, 0.26)}`;
}

export function buildCustomBackground(from: string, to: string): string {
  return `custom:linear-gradient(135deg, ${from}, ${to})`;
}

/** 会话内排版是否与来源模板一致（用于「还原预设」按钮可用性） */
export function isTemplateModified(current: Template, source: Template | undefined): boolean {
  if (!source) return false;
  if (current.background !== source.background) return true;
  if (current.placements.length !== source.placements.length) return true;
  return current.placements.some((p, i) => {
    const s = source.placements[i];
    if (!s || s.device !== p.device) return true;
    return (
      p.x !== s.x || p.y !== s.y || p.width !== s.width || (p.rotation ?? 0) !== (s.rotation ?? 0)
    );
  });
}

export type { DeviceId };
