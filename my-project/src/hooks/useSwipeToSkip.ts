import { useEffect } from 'react'

type UseSwipeToSkipArgs = {
  container: HTMLElement | null
  enabled: boolean
  onSwipe: () => void
  threshold?: number
}

export function useSwipeToSkip({
  container,
  enabled,
  onSwipe,
  threshold = 100,
}: UseSwipeToSkipArgs) {
  useEffect(() => {
    if (!container || !enabled) return

    let startX: number | null = null
    let startY: number | null = null

    const onTouchStart = (event: TouchEvent) => {
      startX = event.touches[0]?.clientX ?? null
      startY = event.touches[0]?.clientY ?? null
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (startX === null || startY === null) return
      const endX = event.changedTouches[0]?.clientX ?? startX
      const endY = event.changedTouches[0]?.clientY ?? startY

      const deltaY = startY - endY
      const deltaX = Math.abs(startX - endX)
      if (deltaX < 30 && deltaY > threshold) {
        onSwipe()
      }

      startX = null
      startY = null
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [container, enabled, onSwipe, threshold])
}
