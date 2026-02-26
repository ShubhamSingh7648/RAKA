import { useCallback, useMemo, useRef, useState } from 'react'

export type ToastType = 'info' | 'success' | 'error'

export type ToastItem = {
  id: string
  message: string
  type: ToastType
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Record<string, number>>({})

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timerId = timersRef.current[id]
    if (timerId) {
      window.clearTimeout(timerId)
      delete timersRef.current[id]
    }
  }, [])

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev, { id, message, type }])
      timersRef.current[id] = window.setTimeout(() => {
        removeToast(id)
      }, duration)
      return id
    },
    [removeToast],
  )

  const api = useMemo(
    () => ({
      toasts,
      addToast,
      removeToast,
    }),
    [addToast, removeToast, toasts],
  )

  return api
}
