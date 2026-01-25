import { useEffect, useState } from 'react'

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function useLocalStorageState(key, defaultValue) {
  const [state, setState] = useState(() => {
    if (typeof window === 'undefined') {
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
    }

    const raw = window.localStorage.getItem(key)
    if (raw == null) {
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
    }

    const parsed = safeJsonParse(raw)
    if (parsed === undefined || parsed === null) {
      return typeof defaultValue === 'function' ? defaultValue() : defaultValue
    }

    return parsed
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, JSON.stringify(state))
  }, [key, state])

  return [state, setState]
}
