function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.length > 0) return v
  }
}

/** Extract an error / message string from an unknown JSON response object. */
export function extractErrorMessage(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return
  return pickString(json as Record<string, unknown>, [
    'message',
    'error',
    'msg',
    'detail',
  ])
}
