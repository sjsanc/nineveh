import { useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

export function useResizablePanel(width: number, onWidthChange: (w: number) => void) {
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  return function handleMouseDown(e: ReactMouseEvent) {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = width

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current) return
      const delta = startX.current - ev.clientX
      onWidthChange(Math.max(200, Math.min(600, startWidth.current + delta)))
    }

    function onMouseUp() {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }
}
