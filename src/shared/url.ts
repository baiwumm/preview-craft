/**
 * URL 规范化与校验：仅接受 http/https，拒绝 userinfo，
 * 无协议时默认补 https://。非法输入返回 null。
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname || !url.hostname.includes('.')) return null;

  return url.toString();
}
