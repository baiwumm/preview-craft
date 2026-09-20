import type { Template } from '@shared/types';

/** 画布基准 1120 × 870，所有坐标基于此 */
export const CANVAS_BASE = { width: 1120, height: 870 } as const;

/**
 * 五套预设共用的光学口径（冒烟 A 段按同一口径断言，改坐标即被校验）：
 * 内容包围盒水平居中偏差 ≤10px、四周留白 ≥ 画布对应边的 7~8%、
 * 后景设备屏幕被前景压住的面积 ≤12% —— 全家福这类多设备构图一旦超过就糊成一团。
 */
export const presets: Template[] = [
  {
    id: 'classic',
    name: '经典全家福',
    subtitle: '四种屏幕，一个好故事',
    canvas: { ...CANVAS_BASE },
    background: 'sunset-flare',
    placements: [
      { device: 'desktop', x: 220, y: 70, width: 660 },
      { device: 'laptop', x: 110, y: 505, width: 470 },
      { device: 'tablet', x: 815, y: 300, width: 210 },
      { device: 'mobile', x: 680, y: 498, width: 140 }
    ]
  },
  {
    id: 'duo',
    name: '双屏聚焦',
    subtitle: '桌面与移动，恰到好处',
    canvas: { ...CANVAS_BASE },
    background: 'grape-soda',
    placements: [
      { device: 'desktop', x: 155, y: 155, width: 700 },
      { device: 'mobile', x: 785, y: 372, width: 170 }
    ]
  },
  {
    id: 'row',
    name: '有序陈列',
    subtitle: '清晰展示每一种尺寸',
    canvas: { ...CANVAS_BASE },
    background: 'glacier',
    placements: [
      { device: 'desktop', x: 92, y: 304, width: 340 },
      { device: 'laptop', x: 454, y: 390.7, width: 300 },
      { device: 'tablet', x: 776, y: 394.5, width: 130 },
      { device: 'mobile', x: 928, y: 368, width: 98 }
    ]
  },
  {
    id: 'editorial',
    name: '灵感错落',
    subtitle: '轻盈旋转，更有表达',
    canvas: { ...CANVAS_BASE },
    background: 'cotton-candy',
    placements: [
      { device: 'laptop', x: 132, y: 230, width: 580, rotation: -8 },
      { device: 'tablet', x: 764, y: 146, width: 225, rotation: 8 },
      { device: 'mobile', x: 642, y: 453, width: 145, rotation: -10 }
    ]
  },
  {
    id: 'focus',
    name: '移动主角',
    subtitle: '为小屏幕留足舞台',
    canvas: { ...CANVAS_BASE },
    background: 'obsidian',
    placements: [
      { device: 'tablet', x: 205, y: 111.6, width: 490 },
      { device: 'mobile', x: 630, y: 162, width: 295 }
    ]
  }
];
