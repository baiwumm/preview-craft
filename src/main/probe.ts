import type { EmbedProbeResult } from '@shared/types';

/**
 * 预览 iframe 能否内嵌的探测。
 *
 * 应用是 file:// 来源，任何要求同源或禁止内嵌的站点都会在 iframe 里留下白屏，
 * 用户会以为程序坏了（截图与导出走真实浏览器，不受影响）。这里在真正渲染前
 * 读一次响应头把结论给出去，让界面能说清「不是坏了，是站点不让嵌」。
 *
 * 探测本身可能因网络失败，此时结果标记 probed:false 且**不缓存**：一次抖动不该
 * 让占位提示永久消失，也不该被当成「站点允许内嵌」的结论。
 */
const PROBE_TIMEOUT = 8000;
const ATTEMPTS = 2;
const cache = new Map<string, EmbedProbeResult>();

/**
 * 只用 GET，不走 HEAD：实测 Electron 主进程的 fetch 对 github.com 的 HEAD 会挂到超时
 * （代理对 HEAD 的转发不可靠），GET 稳定且响应头齐全。Range 只要首字节，避免拉整页。
 */
async function readHeaders(url: string): Promise<Headers> {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT),
    headers: {
      Range: 'bytes=0-0',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  });
  return response.headers;
}

/** 从 CSP 里取 frame-ancestors 指令值 */
function frameAncestors(headers: Headers): string | null {
  const csp = headers.get('content-security-policy');
  if (!csp) return null;
  for (const directive of csp.split(';')) {
    const [name, ...rest] = directive.trim().split(/\s+/);
    if (name?.toLowerCase() === 'frame-ancestors') return rest.join(' ');
  }
  return null;
}

/**
 * 按响应头判定能否内嵌。应用侧来源是 file://（对站点而言等于 null 源），
 * 因此 SAMEORIGIN 与 'self' 都算被拦，只有显式放行任意来源才可能内嵌。
 */
export function judgeEmbedding(headers: Headers): EmbedProbeResult {
  const xfo = headers.get('x-frame-options')?.toUpperCase() ?? '';
  if (xfo.includes('DENY')) return { probed: true, blocked: true, reason: 'X-Frame-Options: DENY' };
  if (xfo.includes('SAMEORIGIN')) {
    return { probed: true, blocked: true, reason: 'X-Frame-Options: SAMEORIGIN' };
  }

  const ancestors = frameAncestors(headers);
  if (ancestors !== null && (ancestors === "'none'" || !ancestors.includes('*'))) {
    return { probed: true, blocked: true, reason: `CSP frame-ancestors: ${ancestors}` };
  }

  return { probed: true, blocked: false };
}

export async function probeEmbedding(url: string): Promise<EmbedProbeResult> {
  const cached = cache.get(url);
  if (cached) return cached;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const result = judgeEmbedding(await readHeaders(url));
      cache.set(url, result);
      return result;
    } catch {
      // 换下一次尝试；全部失败则按「未探到」返回，不缓存
    }
  }
  return { probed: false, blocked: false };
}
