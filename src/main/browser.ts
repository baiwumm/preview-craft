import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Browser, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';
import { app, BrowserWindow } from 'electron';

import type { BrowserInfo } from '@shared/types';

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

/** 检测本机可用浏览器：常见路径枚举优先（零子进程开销），注册表 App Paths 兜底 */
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

  return found;
}

/** Chromium 下载目录 */
function chromiumCacheDir(): string {
  return join(app.getPath('userData'), 'chromium');
}

function sendDownloadProgress(percent: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('browser:download:progress', { percent });
  }
}

/**
 * 确保存在可用浏览器：优先使用已检测到的本机浏览器，
 * 都没有时下载 Chromium 到 userData/chromium，带进度事件。
 */
export async function ensureBrowser(customPath?: string): Promise<BrowserInfo> {
  if (customPath && existsSync(customPath)) {
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
  sendDownloadProgress(0);
  // @puppeteer/browsers v3 的 install 已移除 progressCallback，进度事件仅上报起止
  const result = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir: chromiumCacheDir()
  });
  sendDownloadProgress(100);
  return { kind: 'chromium', path: result.executablePath };
}
