import { Enum } from 'enum-plus';

/**
 * @description: 主题
 */
export const THEME = Enum({
  LIGHT: { value: 'light', label: '浅色模式', icon: 'sun' },
  DARK: { value: 'dark', label: '深色模式', icon: 'moon' }
});

/**
 * @description: 设备外壳配置
 */
export const DEVICES = Enum({
  DESKTOP: {
    value: 'desktop',
    label: '电脑',
    icon: 'monitor',
    shell: {
      width: 620,
      aspect: 671 / 629,
    },
    viewport: {
      width: 1440,
    },
    inner: {
      width: 600,
      height: 396
    },
    wrapClassName: 'top-0 left-1/2 translate-x-[calc(-50%+40px)]',
    iframeClassName: 'rounded-3xl top-2.75 left-2.75',
    innerMaskClassName: 'rounded-xl top-2.75 left-2.75'
  },
  LAPTOP: {
    value: 'laptop',
    label: '笔记本',
    icon: 'laptop',
    shell: {
      width: 520,
      aspect: 969 / 579,
    },
    viewport: {
      width: 1366,
    },
    inner: {
      width: 408,
      height: 266
    },
    wrapClassName: 'left-0 top-65',
    iframeClassName: 'rounded-t-3xl rounded-b-2xl top-[10px] left-[56px]',
    innerMaskClassName: 'rounded-t-[6px] rounded-b-[4px] top-[10px] left-[56px]'
  },
  TABLET: {
    value: 'tablet',
    label: '平板',
    icon: 'tablet',
    shell: {
      width: 300,
      aspect: 981 / 1293,
    },
    viewport: {
      width: 768,
    },
    inner: {
      width: 280,
      height: 372
    },
    wrapClassName: 'right-0 top-45',
    iframeClassName: 'rounded-[40px] top-3 left-2.5',
    innerMaskClassName: 'rounded-[12px] top-3 left-2.5'
  },
  MOBILE: {
    value: 'mobile',
    label: '手机',
    icon: 'smartphone',
    shell: {
      width: 138,
      aspect: 1000 / 2025,
    },
    viewport: {
      width: 384,
    },
    inner: {
      width: 124,
      height: 267
    },
    wrapClassName: 'right-65 top-75',
    iframeClassName: 'rounded-[50px] top-[6px] left-[7px]',
    innerMaskClassName: 'rounded-[16px] top-[6px] left-[7px]'
  }
})

/**
 * @description: 当前模式
 */
export const MODE = Enum({
  PREVIEW: { value: 'preview', label: '预览模式', icon: 'eye' },
  EXPORT: { value: 'export', label: '导出模式', icon: 'camera' }
});

/**
 * @description: 导出格式
 */
export const EXPORT_FORMAT = Enum({
  PNG: { value: 'png', label: 'PNG' },
  WEBP: { value: 'webp', label: 'WEBP' },
  JPG: { value: 'jpg', label: 'JPG' }
});