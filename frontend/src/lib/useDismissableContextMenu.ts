import { useEffect, useState } from 'react'

export interface ContextMenuPosition {
  x: number
  y: number
}

// Tracks a {x,y} context-menu position and clears it when the user
// pointerdowns outside the element identified by menuElementId.
export function useDismissableContextMenu(menuElementId: string) {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuPosition | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    function onPointerDown(e: PointerEvent) {
      const menu = document.getElementById(menuElementId)
      if (menu && !menu.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [ctxMenu, menuElementId])

  return [ctxMenu, setCtxMenu] as const
}
