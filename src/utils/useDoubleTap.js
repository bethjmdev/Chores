import { useCallback, useRef } from 'react'

export function useDoubleTap(onDoubleTap, delay = 350) {
  const lastTapRef = useRef(0)
  const callbackRef = useRef(onDoubleTap)
  callbackRef.current = onDoubleTap

  return useCallback(
    (e) => {
      const now = Date.now()

      if (now - lastTapRef.current < delay) {
        e.preventDefault()
        lastTapRef.current = 0
        callbackRef.current(e)
        return
      }

      lastTapRef.current = now
    },
    [delay],
  )
}
