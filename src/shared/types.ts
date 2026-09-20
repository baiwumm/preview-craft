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
  /**
   * 本轮即将被替换掉的旧截图路径，主进程在开截前删掉这些文件。
   * 不传就是只增不减 —— 每轮重截都会留一批没人再引用的 PNG 在临时目录里。
   */
  replace?: Partial<Record<DeviceId, string>>;
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

/** 会话级样式（不属于模板 schema，另存模板时不携带） */
export interface StyleState {
  /** 画布圆角 px */
  borderRadius: number;
  /** 设备阴影 */
  shadow: boolean;
  /** 画布整体缩放（视觉系数，1 = 适配铺满） */
  zoom: number;
  /** 自定义渐变起止色（hex） */
  customFrom: string;
  customTo: string;
}

/**
 * 上次会话快照：重启后接着用。落盘的是排版与地址，不含截图本身
 * （临时文件可能已被清理，恢复后由预览 iframe 重新渲染地址）。
 */
export interface SessionSnapshot {
  mainUrl: string;
  deviceUrls: Partial<Record<DeviceId, string>>;
  /** 完整排版快照（含微调与背景），恢复时直接采用 */
  template: Template;
  /** 排版来源模板 id，用于「还原预设」与画廊选中态 */
  sourceTemplateId?: string;
  style: StyleState;
}

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
  /** 透明底垫白（JPG 导出不支持 alpha） */
  flattenWhite?: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  browserPath?: string;
  format: ExportFormat;
  scale: 1 | 2 | 3;
  defaultTemplate?: string;
  defaultBackground?: string;
}

export interface CacheStats {
  files: number;
  bytes: number;
}

export interface BrowserDownloadProgress {
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
}

/** 预览 iframe 内嵌可行性探测结果（file:// 来源下读响应头判定） */
export interface EmbedProbeResult {
  /** 是否成功取到响应头；false 表示网络原因未探到，不代表站点允许内嵌 */
  probed: boolean;
  blocked: boolean;
  /** 拦截依据，如 "X-Frame-Options: DENY" / "CSP frame-ancestors: 'none'" */
  reason?: string;
}

/** 检查更新结果（只提示与跳转下载，不做应用内自动更新） */
export interface UpdateCheckResult {
  ok: boolean;
  /** 当前版本（app.getVersion()） */
  current: string;
  latest?: string;
  hasUpdate?: boolean;
  /** 安装包或 Release 页链接，仅 https://github.com */
  url?: string;
  error?: string;
}

export interface Api {
  browserDetect(): Promise<{ found: BrowserInfo[]; active?: BrowserInfo }>;
  browserDownload(): Promise<{ path: string }>;
  onBrowserDownloadProgress(listener: (progress: BrowserDownloadProgress) => void): () => void;
  captureStart(input: CaptureStartInput): Promise<CaptureResult>;
  /** 探测某地址能否被 iframe 内嵌（预览态占位提示用） */
  previewProbe(url: string): Promise<EmbedProbeResult>;
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
  /** 上次会话快照（无则 null）；写入失败不抛错，静默丢弃即可 */
  sessionGet(): Promise<SessionSnapshot | null>;
  sessionSet(snapshot: SessionSnapshot): Promise<void>;
  /** 运行中的版本号（app.getVersion()），「关于」页展示用 */
  appVersion(): Promise<string>;
  /** 截图/导出临时缓存（temp/preview-craft）统计与清理 */
  cacheStats(): Promise<CacheStats>;
  cacheClear(): Promise<CacheStats>;
  /** 在系统文件管理器里打开截图/导出缓存目录 */
  cacheOpen(): Promise<{ opened: boolean }>;
  /** 主进程文件对话框选择浏览器可执行文件，取消返回 null */
  pickBrowserPath(): Promise<{ path: string | null }>;
  /** 主进程读取系统剪贴板文本（Ctrl+V 到 URL 输入用） */
  clipboardReadText(): Promise<string>;
  /** 读取截图文件转 dataURL（预览态 Canvas 显示用） */
  shotDataUrl(path: string): Promise<string>;
  /** 检查 GitHub Releases 是否有新版本 */
  updateCheck(): Promise<UpdateCheckResult>;
  /** 用系统浏览器打开 Release / 下载链接（仅放行 github.com https） */
  updateOpen(url: string): Promise<{ opened: boolean }>;
  templatesGet(): Promise<Template[]>;
  templatesSave(template: Template): Promise<Template[]>;
  templatesDelete(id: string): Promise<Template[]>;
}
