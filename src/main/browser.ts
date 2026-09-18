import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  Browser,
  detectBrowserPlatform,
  getInstalledBrowsers,
  install,
  resolveBuildId
} from '@puppeteer/browsers';
import { app, BrowserWindow } from 'electron';

import type { BrowserDownloadProgress, BrowserInfo } from '@shared/types';

const execFileAsync = promisify(execFile);

/** 常见安装路径枚举（registry 之外的兜底） */
function commonPaths(): Array<{ kind: BrowserInfo['kind']; path: string }> {
  const localAppData = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local');
  return [
    { kind: 'chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { kind: 'chrome', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    { kind: 'chrome', path: join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') },
    { kind: 'edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { kind: 'edge', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' }
  ];
}

/** 从注册表 App Paths 解析浏览器路径 */
async function registryLookup(kind: BrowserInfo['kind'], exeName: string): Promise<BrowserInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      'reg',
      ['query', `HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exeName}`, '/ve'],
      { timeout: 5000 }
    );
    const match = stdout.match(/REG_SZ\s+(\S.+\.exe)/i);
    if (match && existsSync(match[1].trim())) {
      return { kind, path: match[1].trim() };
    }
  } catch {
    // 注册表不存在或查询失败，忽略
  }
  return null;
}

/** 检测可用浏览器：本机路径枚举优先（零子进程开销）、注册表 App Paths 兜底，最后带上已下载的 Chromium */
export async function detectBrowsers(): Promise<BrowserInfo[]> {
  const found: BrowserInfo[] = [];
  const seen = new Set<string>();

  for (const { kind, path } of commonPaths()) {
    if (existsSync(path)) {
      seen.add(path);
      found.push({ kind, path });
    }
  }

  // 仍有遗漏的 kind 时才走注册表查询
  const missingKinds = new Set<BrowserInfo['kind']>(['chrome', 'edge']);
  for (const info of found) {
    missingKinds.delete(info.kind);
  }
  if (missingKinds.size > 0) {
    const registry = await Promise.all(
      Array.from(missingKinds).map((kind) =>
        registryLookup(kind, kind === 'chrome' ? 'chrome.exe' : 'msedge.exe')
      )
    );
    for (const info of registry) {
      if (info && !seen.has(info.path)) {
        seen.add(info.path);
        found.push(info);
      }
    }
  }

  const cached = await installedChromium();
  if (cached && !seen.has(cached.path)) {
    found.push(cached);
  }

  return found;
}

/** Chromium 下载目录 */
export function chromiumCacheDir(): string {
  return join(app.getPath('userData'), 'chromium');
}

function sendDownloadProgress(progress: BrowserDownloadProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('browser:download:progress', progress);
  }
}

/** userData/chromium 下已有可用 Chromium 时直接复用，避免重复下载 */
export async function installedChromium(): Promise<BrowserInfo | null> {
  const dir = chromiumCacheDir();
  if (!existsSync(dir)) return null;
  try {
    const installed = await getInstalledBrowsers({ cacheDir: dir });
    const usable = installed.find(
      (item) =>
        (item.browser === Browser.CHROME || item.browser === Browser.CHROMIUM) &&
        existsSync(item.executablePath)
    );
    return usable ? { kind: 'chromium', path: usable.executablePath } : null;
  } catch {
    return null;
  }
}

/**
 * 确保存在可用浏览器：优先自定义路径，其次本机浏览器与已下载的 Chromium，
 * 都没有时下载 Chromium（带进度事件）。
 */
export async function ensureBrowser(customPath?: string): Promise<BrowserInfo> {
  if (customPath) {
    if (!existsSync(customPath)) {
      throw new Error(`自定义浏览器路径不存在：${customPath}`);
    }
    return { kind: 'chromium', path: customPath };
  }

  const detected = await detectBrowsers();
  if (detected.length > 0) {
    return detected[0];
  }

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error('无法识别当前平台，无法下载 Chromium');
  }
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  sendDownloadProgress({ percent: 0 });
  let lastSent = 0;
  const result = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir: chromiumCacheDir(),
    // 下载阶段上报真实进度（整数百分比变化才发，避免 IPC 刷屏）；解包阶段完成后补发 100%
    downloadProgressCallback: (downloadedBytes, totalBytes) => {
      const percent = totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
      if (percent === lastSent) return;
      lastSent = percent;
      sendDownloadProgress({ percent, downloadedBytes, totalBytes });
    }
  });
  sendDownloadProgress({ percent: 100 });
  return { kind: 'chromium', path: result.executablePath };
}
