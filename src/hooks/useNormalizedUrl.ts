import { useCallback, useMemo, useState } from 'react'

function looksLikeUrl(input: string) {
  const v = input.trim()
  if (!v) return false
  if (v.includes(' ')) return false
  if (!v.includes('.') && !v.startsWith('http')) return false
  return true
}

function normalizeUrl(input: string) {
  if (/^https?:\/\//i.test(input)) return input
  return `https://${input}`
}

function normalizeAndValidate(input: string): string | null {
  if (!looksLikeUrl(input)) return null

  try {
    const u = new URL(normalizeUrl(input))
    if (!['http:', 'https:'].includes(u.protocol)) return null
    if (!u.hostname.includes('.')) return null
    return u.href
  } catch {
    return null
  }
}

export function useNormalizedUrl(initial?: string) {
  const [raw, setRaw] = useState(initial ?? '')

  // 只读派生状态（不会 set）
  const normalized = useMemo(
    () => normalizeAndValidate(raw),
    [raw]
  )

  const isValid = normalized !== null

  /**
   * 仅在「明确动作」时调用（submit / blur）
   */
  const commit = useCallback(() => {
    if (!normalized) return false

    // ⚠️ 关键：只在值变化时才 set
    if (normalized !== raw) {
      setRaw(normalized)
    }

    return true
  }, [normalized, raw])

  return {
    value: raw,
    setValue: setRaw,
    isValid,
    normalized, // 最终可用值（只读）
    commit,     // 手动触发 normalize
  }
}
