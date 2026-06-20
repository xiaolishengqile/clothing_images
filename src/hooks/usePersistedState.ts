import { useCallback, useState } from 'react'

type PersistedValue = string | boolean | number
type WidenPersistedValue<T extends PersistedValue> =
  T extends string ? string :
  T extends boolean ? boolean :
  T extends number ? number :
  never

/**
 * Persist a value in localStorage so it survives page reloads.
 * Works with string values (direct), boolean values ('1' / '0'), and numbers.
 */
export function usePersistedState<T extends PersistedValue>(
  key: string,
  defaultValue: T,
): [WidenPersistedValue<T>, (v: WidenPersistedValue<T>) => void] {
  const isBool = typeof defaultValue === 'boolean'
  const isNumber = typeof defaultValue === 'number'

  const [value, setValue] = useState<WidenPersistedValue<T>>(() => {
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue as unknown as WidenPersistedValue<T>
    if (isBool) return (stored === '1') as WidenPersistedValue<T>
    if (isNumber) {
      const parsed = Number(stored)
      return (Number.isFinite(parsed) ? parsed : defaultValue) as unknown as WidenPersistedValue<T>
    }
    return stored as WidenPersistedValue<T>
  })

  const set = useCallback(
    (next: WidenPersistedValue<T>) => {
      setValue(next)
      localStorage.setItem(key, isBool ? (next ? '1' : '0') : String(next))
    },
    [key, isBool],
  )

  return [value, set]
}
