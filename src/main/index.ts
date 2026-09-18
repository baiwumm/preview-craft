import { basename, join } from 'node:path';
import { copyFile, readFile } from 'node:fs/promises';
import { ClipboardItem, clipboard, dialog, BrowserWindow, app, ipcMain } from 'electron';

import { detectBrowsers, ensureBrowser } from './browser';
import { captureStart, closeBrowser, runCaptureSelfTest } from './capture';
import { exportCompose, shotToDataUrl } from './export';
import {
  deleteCustomTemplate,
  getCustomTemplates,
  getSettings,
  saveCustomTemplate,
  setSettings
} from './store';

// 开发环境所在会话 GPU 进程不可用（GPU process isn't usable → 启动即崩），
// 仅在未打包时禁用 GPU 与 Chromium 沙箱；打包版的 GPU/沙箱行为保持默认，待 P5 安装实测验证。
if (!app.isPackaged) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
}
// 自验钩子（P5 随 PC_CAPTURE_TEST 一并移除）：环境变量传入端口，供 p4-verify.mjs CDP 驱动
if (process.env.PC_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.PC_REMOTE_DEBUGGING_PORT);
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

  ipcMain.handle('settings:get', () => getSettings());

  ipcMain.handle('settings:set', (_event, patch) => setSettings(patch));

  ipcMain.handle('templates:get', () => getCustomTemplates());

  ipcMain.handle('templates:save', (_event, template) => saveCustomTemplate(template));

  ipcMain.handle('templates:delete', (_event, id) => deleteCustomTemplate(id));

  ipcMain.handle('shot:dataurl', (_event, path: string) => shotToDataUrl(path));

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

app.whenReady().then(async () => {
  registerIpc();
  createWindow();

  // P1 自验：PC_CAPTURE_TEST=<url> 时执行截图自检后退出，P5 移除
  const selfTestUrl = process.env.PC_CAPTURE_TEST;
  if (selfTestUrl) {
    await runCaptureSelfTest(selfTestUrl);
    app.exit(0);
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  void closeBrowser();
});
