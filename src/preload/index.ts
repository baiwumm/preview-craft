import { contextBridge, ipcRenderer } from 'electron';

import type {
  Api,
  BrowserInfo,
  CaptureProgress,
  CaptureStartInput,
  CaptureResult,
  ExportComposeInput,
  ExportFormat,
  AppSettings
} from '@shared/types';

type Listener<T> = (payload: T) => void;

function subscribe<T>(channel: string, listener: Listener<T>): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

export type { BrowserInfo, CaptureProgress, CaptureStartInput, CaptureResult, ExportComposeInput, ExportFormat, AppSettings };

const api: Api = {
  browserDetect: () => ipcRenderer.invoke('browser:detect'),
  browserDownload: () => ipcRenderer.invoke('browser:download'),
  onBrowserDownloadProgress: (listener) => subscribe('browser:download:progress', listener),
  captureStart: (input) => ipcRenderer.invoke('capture:start', input),
  onCaptureProgress: (listener) => subscribe('capture:progress', listener),
  exportCompose: (input) => ipcRenderer.invoke('export:compose', input),
  exportSave: (input) => ipcRenderer.invoke('export:save', input),
  exportClipboard: (input) => ipcRenderer.invoke('export:clipboard', input),
  onExportRender: (listener) => subscribe('export:render', listener),
  onWebpConvert: (listener) => subscribe('export:webp:convert', listener),
  exportReady: () => ipcRenderer.send('export:ready'),
  exportWebpResult: (data) => ipcRenderer.send('export:webp:result', data),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  shotDataUrl: (path) => ipcRenderer.invoke('shot:dataurl', path),
  templatesGet: () => ipcRenderer.invoke('templates:get'),
  templatesSave: (template) => ipcRenderer.invoke('templates:save', template),
  templatesDelete: (id) => ipcRenderer.invoke('templates:delete', id)
};

contextBridge.exposeInMainWorld('api', api);
