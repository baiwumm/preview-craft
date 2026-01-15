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
    wrapClassName: 'top-0 left-1/2 -translate-x-1/2',
    iframeClassName: 'rounded-3xl top-2.75 left-2.75'
  },
  LAPTOP: {
    value: 'laptop',
    label: '笔记本',
    shell: {
      width: 520,
      aspect: 969 / 579,
    },
    viewport: {
      width: 1280,
    },
    inner: {
      width: 408,
      height: 266
    },
    wrapClassName: 'left-0 top-65',
    iframeClassName: 'rounded-t-3xl rounded-b-2xl top-[10px] left-[56px]'
  },
  TABLET: {
    value: 'tablet',
    label: '平板',
    shell: {
      width: 300,
      aspect: 981 / 1293,
    },
    viewport: {
      width: 834,
    },
    inner: {
      width: 280,
      height: 372
    },
    wrapClassName: 'right-8 top-40',
    iframeClassName: 'rounded-[40px] top-3 left-2.5'
  },
  MOBILE: {
    value: 'mobile',
    label: '手机',
    shell: {
      width: 160,
      aspect: 1000 / 2025,
    },
    viewport: {
      width: 384,
    },
    inner: {
      width: 142,
      height: 310
    },
    wrapClassName: 'right-80 top-60',
    iframeClassName: 'rounded-[60px] top-2 left-2.5'
  }
})