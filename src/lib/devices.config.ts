export type DeviceType = "desktop" | "laptop" | "tablet" | "mobile";

export interface DeviceConfig {
  shell: {
    width: number;        // 壳子显示宽度（px）
    aspect: number;       // 壳子宽高比
  };
  viewport: {
    width: number;        // iframe 真实宽
  };
  inner: {
    width: number;        // 内容区宽
    height: number;       // 内容区高
  },
  wrapClassName?: string; // 容器的 className
  iframeClassName?: string; // iframe 的 className
}

export const DEVICES: Record<DeviceType, DeviceConfig> = {
  desktop: {
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
  laptop: {
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
  tablet: {
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
  mobile: {
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
};

