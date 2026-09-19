import { basename, join } from 'node:path';
import { copyFile, readFile } from 'node:fs/promises';
import { ClipboardItem, clipboard, dialog, BrowserWindow, app, ipcMain } from 'electron';

import { detectBrowsers, ensureBrowser } from './browser';
import { cacheClear, cacheStats, captureStart, closeBrowser } from './capture';
import { exportCompose, shotToDataUrl } from './export';
import { probeEmbedding } from './probe';
import { checkForUpdate, openReleasePage } from './update';
import {
  deleteCustomTemplate,
  getCustomTemplates,
  getSettings,
  saveCustomTemplate,
  setSettings
} from './store';

// 开发环境所在会话 GPU 进程不可用（GPU process isn't usable → 启动即崩），
// 仅在未打包时禁用 GPU 与 Chromium 沙箱；打包版走默认路径（P5 安装实测待确认，见 PLAN「待确认」）。
if (!app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'PreviewCraft',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#171720',
    // 打包版的图标由 electron-builder 烤进 exe；未打包运行时若不显式给 icon，
    // Windows 会退回 Electron 默认图标（dev 下「Logo 不对」的原因）。
    ...(!app.isPackaged ? { icon: join(__dirname, '../../resources/icon.png') } : null),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.on('ready-to-show', () => win.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function broadcastProgress(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function registerIpc(): void {
  ipcMain.handle('browser:detect', () => {
    const found = detectBrowsers();
    return found.then((list) => ({ found: list, active: list[0] }));
  });

  ipcMain.handle('browser:download', async () => {
    const info = await ensureBrowser();
    return { path: info.path };
  });

  ipcMain.handle('capture:start', async (_event, input) => {
    const { browserPath } = getSettings();
    const browser = await ensureBrowser(browserPath);
    return captureStart(browser.path, input, (progress) => {
      broadcastProgress('capture:progress', progress);
    });
  });

  ipcMain.handle('preview:probe', (_event, url: string) => probeEmbedding(url));

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_event, patch) => setSettings(patch));

  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.handle('cache:stats', () => cacheStats());

  ipcMain.handle('cache:clear', () => cacheClear());

  ipcMain.handle('dialog:pick-browser', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(win, {
      title: '选择浏览器可执行文件',
      buttonLabel: '使用此文件',
      filters: [{ name: '浏览器可执行文件', extensions: ['exe'] }],
      properties: ['openFile']
    });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  });

  // renderer 无 clipboard 读权限，Ctrl+V 到 URL 输入由主进程代读系统剪贴板
  ipcMain.handle('clipboard:read-text', () => clipboard.readText());

  ipcMain.handle('templates:get', () => getCustomTemplates());

  ipcMain.handle('templates:save', (_event, template) => saveCustomTemplate(template));

  ipcMain.handle('templates:delete', (_event, id) => deleteCustomTemplate(id));

  ipcMain.handle('shot:dataurl', (_event, path: string) => shotToDataUrl(path));

  ipcMain.handle('update:check', () => checkForUpdate());

  ipcMain.handle('update:open', (_event, url: string) => openReleasePage(url));

  ipcMain.handle('export:compose', (_event, input) => exportCompose(input));

  ipcMain.handle('export:save', async (_event, input: { path: string; defaultName?: string }) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const result = await dialog.showSaveDialog(win, {
      defaultPath: join(app.getPath('downloads'), input.defaultName ?? basename(input.path))
    });
    if (result.canceled || !result.filePath) {
      return { saved: false };
    }
    await copyFile(input.path, result.filePath);
    return { saved: true };
  });

  // Electron 44：clipboard.writeImage 已移除，走 W3C ClipboardItem（PNG → 系统位图）
  ipcMain.handle('export:clipboard', async (_event, input: { path: string }) => {
    const buffer = await readFile(input.path);
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([buffer], { type: 'image/png' }) })]);
  });
}

// 单实例：再次启动时聚焦已开窗口而不是开新实例
const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // Windows 任务栏/通知归属：与 NSIS 快捷方式的应用模型 ID 保持一致
    app.setAppUserModelId('com.previewcraft.desktop');
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  void closeBrowser();
});
