export type DeviceId = 'desktop' | 'laptop' | 'tablet' | 'mobile';

/**
 * 截图采集倍率，与设置里的「导出倍率 1x/2x/3x」是两件事：
 * 这里固定按 2 倍设备像素比采集，得到的是清晰的源图；导出倍率是在合成排版时
 * 对整张画布做的放大。两者相乘才是最终像素，所以调导出倍率不会改变源图锐度。
 */
export const CAPTURE_DEVICE_SCALE = 2;

/** 设备 UA：桌面 Chrome / iPad / iPhone */
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** 壳体附加部件（画布基准坐标） */
export interface ShellPart {
  kind: 'neck' | 'base' | 'notch' | 'camera';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
}

/** 内屏之上的开孔（灵动岛一类），坐标与机身同一基准，由内屏裁剪层负责切边 */
export interface ScreenIsland {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** CSS 设备壳规格：机身 + 附加部件 + 配色，几何随 frame.width 等比折算 */
export interface DeviceShellSpec {
  /** 机身（包裹内屏的外壳） */
  body: { x: number; y: number; w: number; h: number; r: number };
  /** 绘制在机身之下的部件（支架 / 底座） */
  under: ShellPart[];
  /** 绘制在机身之上的部件（刘海 / 摄像头） */
  over: ShellPart[];
  /** 内屏之上的开孔，缺省表示无 */
  island?: ScreenIsland;
  /** 机身渐变（深色边框机身） */
  bodyGradient: [string, string];
  /** 金属部件渐变（支架 / 底座） */
  metalGradient: [string, string];
}

export interface DevicePreset {
  id: DeviceId;
  label: string;
  ua: string;
  isMobile: boolean;
  hasTouch: boolean;
  /** 截图视口（css px），高度 = round(width × inner.height / inner.width)，保证内容不变形 */
  viewport: { width: number; height: number };
  /** 设备壳：显示宽基准（画布 1120 坐标系）、整体宽高比、内屏偏移与尺寸、内屏圆角、壳体规格 */
  frame: {
    width: number;
    aspect: number;
    inner: { x: number; y: number; width: number; height: number };
    screenRadius: number;
    shell: DeviceShellSpec;
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
      aspect: 620 / 478,
      inner: { x: 10, y: 10, width: 600, height: 396 },
      screenRadius: 8,
      shell: {
        body: { x: 0, y: 0, w: 620, h: 426, r: 16 },
        under: [
          { kind: 'neck', x: 282, y: 424, w: 56, h: 42, r: 4 },
          { kind: 'base', x: 236, y: 466, w: 148, h: 12, r: 6 }
        ],
        over: [{ kind: 'camera', x: 304, y: 4, w: 12, h: 4, r: 2 }],
        bodyGradient: ['#2f2f38', '#17171d'],
        metalGradient: ['#b9bdc4', '#6f747c']
      }
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
      aspect: 520 / 304,
      inner: { x: 56, y: 12, width: 408, height: 266 },
      screenRadius: 8,
      shell: {
        body: { x: 44, y: 0, w: 432, h: 290, r: 16 },
        under: [{ kind: 'base', x: 0, y: 290, w: 520, h: 14, r: 7 }],
        over: [
          { kind: 'notch', x: 230, y: 290, w: 60, h: 5, r: 2 },
          { kind: 'camera', x: 256, y: 4, w: 8, h: 3, r: 1.5 }
        ],
        bodyGradient: ['#2f2f38', '#17171d'],
        metalGradient: ['#b9bdc4', '#6f747c']
      }
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
      aspect: 300 / 396,
      inner: { x: 10, y: 12, width: 280, height: 372 },
      screenRadius: 16,
      shell: {
        body: { x: 0, y: 0, w: 300, h: 396, r: 24 },
        under: [],
        over: [{ kind: 'camera', x: 147, y: 3.5, w: 6, h: 6, r: 3 }],
        bodyGradient: ['#2f2f38', '#17171d'],
        metalGradient: ['#b9bdc4', '#6f747c']
      }
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
      aspect: 138 / 279,
      inner: { x: 7, y: 6, width: 124, height: 267 },
      screenRadius: 18,
      shell: {
        body: { x: 0, y: 0, w: 138, h: 279, r: 26 },
        under: [],
        over: [],
        island: { x: 52, y: 15, w: 34, h: 9, r: 4.5 },
        bodyGradient: ['#2f2f38', '#17171d'],
        metalGradient: ['#b9bdc4', '#6f747c']
      }
    }
  }
};

export const deviceIds: DeviceId[] = ['desktop', 'laptop', 'tablet', 'mobile'];
