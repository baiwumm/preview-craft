import type { Template } from '@shared/types';

/** 画布基准 1120 × 870，所有坐标基于此 */
export const CANVAS_BASE = { width: 1120, height: 870 } as const;

export const presets: Template[] = [
  {
    id: 'classic',
    name: '经典全家福',
    subtitle: '四种屏幕，一个好故事',
    canvas: { ...CANVAS_BASE },
    background: 'twilight',
    placements: [
      { device: 'desktop', x: 285, y: 140, width: 620 },
      { device: 'laptop', x: 65, y: 420, width: 510 },
      { device: 'tablet', x: 815, y: 290, width: 240 },
      { device: 'mobile', x: 675, y: 465, width: 135 }
    ]
  },
  {
    id: 'duo',
    name: '双屏聚焦',
    subtitle: '桌面与移动，恰到好处',
    canvas: { ...CANVAS_BASE },
    background: 'sea-salt',
    placements: [
      { device: 'desktop', x: 160, y: 100, width: 760 },
      { device: 'mobile', x: 790, y: 310, width: 170 }
    ]
  },
  {
    id: 'row',
    name: '有序陈列',
    subtitle: '清晰展示每一种尺寸',
    canvas: { ...CANVAS_BASE },
    background: 'mint',
    placements: [
      { device: 'desktop', x: 25, y: 240, width: 390 },
      { device: 'laptop', x: 415, y: 355, width: 335 },
      { device: 'tablet', x: 765, y: 255, width: 180 },
      { device: 'mobile', x: 980, y: 320, width: 115 }
    ]
  },
  {
    id: 'editorial',
    name: '灵感错落',
    subtitle: '轻盈旋转，更有表达',
    canvas: { ...CANVAS_BASE },
    background: 'cream',
    placements: [
      { device: 'laptop', x: 100, y: 255, width: 640, rotation: -8 },
      { device: 'tablet', x: 810, y: 170, width: 240, rotation: 8 },
      { device: 'mobile', x: 700, y: 455, width: 135, rotation: -8 }
    ]
  },
  {
    id: 'focus',
    name: '移动主角',
    subtitle: '为小屏幕留足舞台',
    canvas: { ...CANVAS_BASE },
    background: 'obsidian',
    placements: [
      { device: 'tablet', x: 300, y: 130, width: 355 },
      { device: 'mobile', x: 660, y: 260, width: 205 }
    ]
  }
];

export function getPresetById(id: string): Template | undefined {
  return presets.find((preset) => preset.id === id);
}
