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

export function isValidHttpUrl(input: string): boolean {
  try {
    const u = new URL(input)

    if (!['http:', 'https:'].includes(u.protocol)) return false
    if (!u.hostname.includes('.')) return false

    return true
  } catch {
    return false
  }
}

/**
 * @description: 校验 url
 * @param {string} input
 */
export function normalizeAndValidate(input: string): string | null {
  if (!input.trim()) return null

  const normalized = normalizeUrl(input)

  return isValidHttpUrl(normalized) ? normalized : null
}