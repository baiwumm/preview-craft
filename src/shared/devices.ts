export type DeviceId = 'desktop' | 'laptop' | 'tablet' | 'mobile';

/** 设备 UA：桌面 Chrome / iPad / iPhone */
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface DevicePreset {
  id: DeviceId;
  label: string;
  ua: string;
  isMobile: boolean;
  hasTouch: boolean;
  /** 截图视口（css px），高度 = round(width × inner.height / inner.width)，保证内容不变形 */
  viewport: { width: number; height: number };
  /** 设备壳：画布基准 1120 下的显示宽、壳图宽高比 w/h、内屏在壳内的偏移与尺寸 */
  frame: {
    width: number;
    aspect: number;
    inner: { x: number; y: number; width: number; height: number };
  };
}

export const devicePresets: Record<DeviceId, DevicePreset> = {
  desktop: {
    id: 'desktop',
    label: '电脑',
    ua: DESKTOP_UA,
    isMobile: false,
    hasTouch: false,
    viewport: { width: 1440, height: 950 },
    frame: {
      width: 620,
      aspect: 671 / 629,
      inner: { x: 11, y: 11, width: 600, height: 396 }
    }
  },
  laptop: {
    id: 'laptop',
    label: '笔记本',
    ua: DESKTOP_UA,
    isMobile: false,
    hasTouch: false,
    viewport: { width: 1366, height: 891 },
    frame: {
      width: 520,
      aspect: 969 / 579,
      inner: { x: 56, y: 10, width: 408, height: 266 }
    }
  },
  tablet: {
    id: 'tablet',
    label: '平板',
    ua: IPAD_UA,
    isMobile: true,
    hasTouch: true,
    viewport: { width: 768, height: 1020 },
    frame: {
      width: 300,
      aspect: 981 / 1293,
      inner: { x: 10, y: 12, width: 280, height: 372 }
    }
  },
  mobile: {
    id: 'mobile',
    label: '手机',
    ua: IPHONE_UA,
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 840 },
    frame: {
      width: 138,
      aspect: 1000 / 2025,
      inner: { x: 7, y: 6, width: 124, height: 267 }
    }
  }
};

export const deviceIds: DeviceId[] = ['desktop', 'laptop', 'tablet', 'mobile'];
