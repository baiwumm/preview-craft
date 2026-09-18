import { join } from 'node:path';
import { BrowserWindow, app } from 'electron';

// 开发环境所在会话 GPU 进程不可用（GPU process isn't usable → 启动即崩），
// 仅在未打包时禁用 GPU 与 Chromium 沙箱；打包版的 GPU/沙箱行为保持默认，待 P5 安装实测验证。
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
