export type DeviceId = 'desktop' | 'laptop' | 'tablet' | 'mobile';

export interface BrowserInfo {
  kind: 'chrome' | 'edge' | 'chromium';
  path: string;
}

export type CaptureStatus = 'pending' | 'done' | 'error';

export interface CaptureProgress {
  device: DeviceId;
  status: CaptureStatus;
  path?: string;
  error?: string;
}

export interface CaptureStartInput {
  url: string;
  deviceUrls: Partial<Record<DeviceId, string>>;
  devices: DeviceId[];
}

export interface CaptureResult {
  shots: Partial<Record<DeviceId, string>>;
  errors: Partial<Record<DeviceId, string>>;
}

export interface Placement {
  device: DeviceId;
  x: number;
  y: number;
  width: number;
  rotation?: number;
}

export interface Template {
  id: string;
  name: string;
  subtitle: string;
  canvas: { width: number; height: number };
  placements: Placement[];
  background: string;
}

export type ExportFormat = 'png' | 'jpg' | 'webp';

export interface ExportStyle {
  borderRadius: number;
  shadow: boolean;
  zoom: number;
}

export interface ExportComposeInput {
  template: Template;
  shots: Record<DeviceId, string>;
  scale: 1 | 2 | 3;
  format: ExportFormat;
  quality?: number;
  style?: ExportStyle;
}

/** 导出隐藏窗口渲染载荷（export:render 事件） */
export interface ExportRenderPayload {
  template: Template;
  scale: 1 | 2 | 3;
  shots: Record<DeviceId, string>;
  style: ExportStyle;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  browserPath?: string;
  format: ExportFormat;
  scale: 1 | 2 | 3;
  defaultTemplate?: string;
  defaultBackground?: string;
}

export interface Api {
  browserDetect(): Promise<{ found: BrowserInfo[]; active?: BrowserInfo }>;
  browserDownload(): Promise<{ path: string }>;
  onBrowserDownloadProgress(listener: (progress: { percent: number }) => void): () => void;
  captureStart(input: CaptureStartInput): Promise<CaptureResult>;
  onCaptureProgress(listener: (progress: CaptureProgress) => void): () => void;
  exportCompose(input: ExportComposeInput): Promise<{ path: string }>;
  exportSave(input: { path: string; defaultName?: string }): Promise<{ saved: boolean }>;
  exportClipboard(input: { path: string }): Promise<void>;
  /** 导出隐藏窗口专用：接收渲染载荷 / 通知就绪 / 回传 WebP 编码结果 */
  onExportRender(listener: (payload: ExportRenderPayload) => void): () => void;
  onWebpConvert(listener: (payload: { dataUrl: string; quality: number }) => void): () => void;
  exportReady(): void;
  exportWebpResult(data: ArrayBuffer): void;
  settingsGet(): Promise<AppSettings>;
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>;
  /** 读取截图文件转 dataURL（预览态 Canvas 显示用） */
  shotDataUrl(path: string): Promise<string>;
  templatesGet(): Promise<Template[]>;
  templatesSave(template: Template): Promise<Template[]>;
  templatesDelete(id: string): Promise<Template[]>;
}
