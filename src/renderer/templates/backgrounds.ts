export type BackgroundGroup = 'gradient' | 'solid' | 'dark';

export const groupNames: Record<BackgroundGroup, string> = {
  gradient: '渐变',
  solid: '纯色',
  dark: '深色'
};

export interface BackgroundPreset {
  key: string;
  name: string;
  /** CSS background 值：多层以逗号分隔，先写的层压在上方 */
  value: string;
  /**
   * 代表色（可被 parseColor 解析的 hex）。ColorSwatchPicker 以选中色的 hexa
   * 作为唯一 key 并据此画选中描边、判定勾号深浅，故渐变底也必须给一个纯色代表。
   */
  color: string;
  group: BackgroundGroup;
}

/** 左上高光：给纯色/渐变底加一点光源方向，避免整块底像一张色纸 */
const GLOW = 'radial-gradient(120% 100% at 8% 0%, rgba(255, 255, 255, 0.38), transparent 52%)';
const GLOW_SOFT = 'radial-gradient(120% 100% at 8% 0%, rgba(255, 255, 255, 0.10), transparent 55%)';

export const backgrounds: BackgroundPreset[] = [
  {
    key: 'sunset-flare',
    name: '落日熔金',
    group: 'gradient',
    color: '#f42c7a',
    value: `${GLOW}, linear-gradient(135deg, #ff9a3d 0%, #f42c7a 52%, #7b2ff7 100%)`
  },
  {
    key: 'coral-pop',
    name: '珊瑚气泡',
    group: 'gradient',
    color: '#ff7a3d',
    value: `${GLOW}, linear-gradient(135deg, #ffd45c 0%, #ff7a3d 46%, #f5296b 100%)`
  },
  {
    key: 'grape-soda',
    name: '葡萄汽水',
    group: 'gradient',
    color: '#7c5cfa',
    value: `${GLOW}, linear-gradient(135deg, #c084fc 0%, #7c5cfa 50%, #2f4fd0 100%)`
  },
  {
    key: 'glacier',
    name: '冰川蓝',
    group: 'gradient',
    color: '#38a8f8',
    value: `${GLOW}, linear-gradient(135deg, #7ee8fa 0%, #38a8f8 48%, #4f46e5 100%)`
  },
  {
    key: 'lime-fizz',
    name: '青柠气泡',
    group: 'gradient',
    color: '#35d07f',
    value: `${GLOW}, linear-gradient(135deg, #d8f46a 0%, #35d07f 48%, #0aa5a0 100%)`
  },
  {
    key: 'rose-noir',
    name: '玫红夜幕',
    group: 'gradient',
    color: '#e0479e',
    value: `${GLOW}, linear-gradient(135deg, #ffc4d9 0%, #e0479e 46%, #5b1a6b 100%)`
  },
  {
    key: 'cotton-candy',
    name: '棉花糖',
    group: 'gradient',
    color: '#ded1ff',
    value: `${GLOW_SOFT}, linear-gradient(135deg, #ded1ff 0%, #c7e3ff 50%, #ffd9ef 100%)`
  },
  { key: 'white', name: '纯白', group: 'solid', color: '#ffffff', value: '#ffffff' },
  { key: 'cloud', name: '云灰', group: 'solid', color: '#eef0f4', value: '#eef0f4' },
  { key: 'indigo-mist', name: '淡靛', group: 'solid', color: '#e2e7f4', value: '#e2e7f4' },
  { key: 'sand', name: '米砂', group: 'solid', color: '#f4ece1', value: '#f4ece1' },
  { key: 'transparent', name: '透明', group: 'solid', color: '#6b7280', value: 'transparent' },
  {
    key: 'obsidian',
    name: '曜石黑',
    group: 'dark',
    color: '#1f1f28',
    value: `${GLOW_SOFT}, linear-gradient(180deg, #1f1f28 0%, #0b0b10 100%)`
  },
  {
    key: 'deep-sea',
    name: '深海',
    group: 'dark',
    color: '#203a43',
    value: `${GLOW_SOFT}, linear-gradient(135deg, #0f2027 0%, #203a43 55%, #2c5364 100%)`
  },
  {
    key: 'plum-night',
    name: '乌木紫',
    group: 'dark',
    color: '#4a1e6b',
    value: `${GLOW_SOFT}, linear-gradient(135deg, #1a1030 0%, #4a1e6b 55%, #8b1e5f 100%)`
  }
];

/** 透明背景 key：导出 PNG 时不铺底（JPG 导出会自动垫白） */
export const TRANSPARENT_BG = 'transparent';

export function isTransparentBackground(key: string): boolean {
  return key === TRANSPARENT_BG;
}

/** 透明底的棋盘格展示（预览态用，导出态不铺） */
export const CHECKER_CSS =
  'conic-gradient(#d4d4da 25%, #ffffff 0 50%, #d4d4da 0 75%, #ffffff 0) 0 0 / 16px 16px';

export function getBackground(key: string): BackgroundPreset {
  return backgrounds.find((bg) => bg.key === key) ?? backgrounds[0];
}

/** 按分组顺序（色板数组序）返回 [组, 成员] 列表，供面板分组渲染 */
export function groupedBackgrounds(): [BackgroundGroup, BackgroundPreset[]][] {
  const order: BackgroundGroup[] = ['gradient', 'solid', 'dark'];
  return order
    .map((group): [BackgroundGroup, BackgroundPreset[]] => [group, backgrounds.filter((bg) => bg.group === group)])
    .filter(([, list]) => list.length > 0);
}

/**
 * 解析背景 key 为 CSS background 值。
 * 预设 key 直接取色板；`custom:` 前缀取其余部分为自定义 CSS（渐变）；
 * flattenWhite 时透明底垫白（JPG 导出不支持 alpha）。
 */
export function resolveBackgroundCss(key: string, flattenWhite = false): string {
  if (key.startsWith('custom:')) {
    return key.slice('custom:'.length) || '#ffffff';
  }
  if (isTransparentBackground(key)) {
    return flattenWhite ? '#ffffff' : 'transparent';
  }
  return getBackground(key).value;
}
