import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


/**
 * @description: 默认 https 协议
 * @param {string} input
 */
export function normalizeUrl(input: string) {
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}

/**
 * @description: 校验 url
 * @param {string} input
 */
export function normalizeAndValidate(input: string): string | null {
  function looksLikeUrl(input: string) {
    const v = input.trim()

    // 最低门槛
    if (!v) return false
    if (v.includes(' ')) return false

    // 有域名特征
    if (v.includes('.') || v.startsWith('http')) {
      return true
    }

    return false
  }

  if (!looksLikeUrl(input)) return null

  const normalized = normalizeUrl(input)

  try {
    const u = new URL(normalized)

    if (!['http:', 'https:'].includes(u.protocol)) {
      return null
    }

    // hostname 至少包含一个 .
    if (!u.hostname.includes('.')) {
      return null
    }

    return u.href
  } catch {
    return null
  }
}