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
  customFrom: '#ede6ff',
  customTo: '#b5aff2'
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

export function buildCustomBackground(from: string, to: string): string {
  return `custom:linear-gradient(180deg, ${from}, ${to})`;
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
