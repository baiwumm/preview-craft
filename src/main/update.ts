import { app, shell } from 'electron';

import { compareVersions } from '@shared/version';

import type { UpdateCheckResult } from '@shared/types';

/**
 * 检查更新（只提示，不自动安装）。
 *
 * 仓库是 public，匿名打 GitHub Releases API 即可，不需要 token；比较版本号自己拆三段，
 * 不引入 semver，也不引入 electron-updater —— 后者会把发布流程绑死在代码签名与固定
 * 更新源上，对单用户本地工具是净负担。用户点「前往下载」时交给系统浏览器装。
 */
const RELEASE_API = 'https://api.github.com/repos/baiwumm/preview-craft/releases/latest';
const REQUEST_TIMEOUT = 8_000;

interface ReleaseJson {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
}

/** 把 fetch 的原始报错归因成中文提示 */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted|TimeoutError/i.test(message)) return '检查超时，网络可能不可达';
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) return '无法解析 api.github.com';
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message)) return '连接 GitHub 失败，请稍后再试';
  return message.slice(0, 120);
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const current = app.getVersion();

  let release: ReleaseJson;
  try {
    const response = await fetch(RELEASE_API, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'PreviewCraft' }
    });
    if (!response.ok) {
      return { ok: false, current, error: `GitHub 返回 HTTP ${response.status}` };
    }
    release = (await response.json()) as ReleaseJson;
  } catch (error) {
    return { ok: false, current, error: describeError(error) };
  }

  const latest = String(release.tag_name ?? '').trim();
  if (!latest) return { ok: false, current, error: '未取到最新版本号' };

  const asset = (release.assets ?? []).find((item) => /\.exe$/i.test(item.name ?? ''));
  return {
    ok: true,
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    url: asset?.browser_download_url ?? release.html_url ?? ''
  };
}

/**
 * 只允许打 github.com 的 https 链接：URL 来自远端接口返回，不能原样交给 shell。
 */
export async function openReleasePage(url: string): Promise<{ opened: boolean }> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { opened: false };
  }
  if (target.protocol !== 'https:' || !/(^|\.)github\.com$/.test(target.hostname)) {
    return { opened: false };
  }
  await shell.openExternal(target.toString());
  return { opened: true };
}
