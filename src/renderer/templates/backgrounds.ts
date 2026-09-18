export interface BackgroundPreset {
  key: string;
  name: string;
  /** CSS background 值（渐变或纯色） */
  value: string;
  /** 用于缩略图/色卡的展示色 */
  swatch: string;
}

export const backgrounds: BackgroundPreset[] = [
  {
    key: 'twilight',
    name: '暮色紫',
    value: 'linear-gradient(180deg, #ede6ff, #b5aff2)',
    swatch: '#d5cbf8'
  },
  {
    key: 'sea-salt',
    name: '海盐蓝',
    value: 'linear-gradient(180deg, #e4f5fb, #9ac6e4)',
    swatch: '#bcdeef'
  },
  {
    key: 'mint',
    name: '薄荷绿',
    value: 'linear-gradient(180deg, #e9f4df, #a4caba)',
    swatch: '#c7e0cc'
  },
  {
    key: 'cream',
    name: '奶油杏',
    value: 'linear-gradient(180deg, #fff2df, #edc6b0)',
    swatch: '#f6dcd0'
  },
  {
    key: 'obsidian',
    name: '曜石黑',
    value: 'linear-gradient(180deg, #3b3b49, #171720)',
    swatch: '#2a2a34'
  },
  {
    key: 'white',
    name: '纯白',
    value: '#ffffff',
    swatch: '#ffffff'
  },
  {
    key: 'transparent',
    name: '透明',
    value: 'transparent',
    swatch: 'transparent'
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

/**
 * 解析背景 key 为 CSS background 值。
 * 预设 key 直接取色板；`custom:` 前缀取其余部分为自定义 CSS（渐变）；
 * flattenWhite 时透明底垫白（JPG 导出）。
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
