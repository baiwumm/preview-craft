import type { BrowserInfo } from '@shared/types';

const BROWSER_LABELS: Record<BrowserInfo['kind'], string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  chromium: 'Chromium'
};

/** 截图失败的原始报错 → 中文可操作提示 */
const CAPTURE_ERROR_RULES: Array<[RegExp, string]> = [
  [/Navigation timeout of \d+ ms exceeded/i, '加载超时（30 秒未响应），站点可能不可达'],
  [/ERR_NAME_NOT_RESOLVED/i, '域名无法解析，请检查地址是否正确'],
  [/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_PROXY_CONNECTION_FAILED/i, '网络不可用，请检查网络连接'],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/i, '连接超时，站点可能不可达'],
  [/ERR_CONNECTION_REFUSED/i, '站点拒绝连接'],
  [/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_ABORTED|ERR_EMPTY_RESPONSE/i, '连接被中断，站点可能不可达'],
  [/ERR_CERT|ERR_SSL/i, '站点证书校验失败'],
  [/ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_RESPONSE/i, '请求被拦截'],
  [/ERR_TOO_MANY_REDIRECTS/i, '重定向次数过多'],
  [/Failed (?:to )?launch|browser is not|executable path|spawn/i, '浏览器启动失败，请在设置中检查浏览器路径'],
  [/Target closed|Session closed|Protocol error/i, '浏览器实例已断开，请重试']
];

/** 未单独归类的 net::ERR_* 保留原始错误码，便于排查 */
const GENERIC_NET_ERROR = /net::(ERR_[A-Z0-9_]+)/i;

export function describeBrowserKind(kind: BrowserInfo['kind']): string {
  return BROWSER_LABELS[kind] ?? kind;
}

export function describeCaptureError(raw: string | undefined): string {
  if (!raw) return '截图失败';
  for (const [pattern, message] of CAPTURE_ERROR_RULES) {
    if (pattern.test(raw)) return message;
  }
  const netError = GENERIC_NET_ERROR.exec(raw);
  if (netError) return `站点不可达（${netError[1]}）`;
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${index === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
