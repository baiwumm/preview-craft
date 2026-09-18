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

export interface ExportComposeInput {
  template: Template;
  shots: Record<DeviceId, string>;
  scale: 1 | 2 | 3;
  format: ExportFormat;
  quality?: number;
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
  exportSave(input: { path: string }): Promise<{ saved: boolean }>;
  exportClipboard(input: { path: string }): Promise<void>;
  settingsGet(): Promise<AppSettings>;
  settingsSet(patch: Partial<AppSettings>): Promise<AppSettings>;
}
