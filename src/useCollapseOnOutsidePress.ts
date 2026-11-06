import { useEffect, useRef } from 'react'

export function useCollapseOnOutsidePress() {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    let pressedOutside = false
    function collapse() {
      if (detailsRef.current?.open) detailsRef.current.open = false
    }
    function handlePointerDown(event: PointerEvent) {
      pressedOutside = !(event.target instanceof Node && detailsRef.current?.contains(event.target))
    }
    // Collapse after the click: shrinking on press can move a centered dialog out from under the pointer.
    function handleClick() {
      if (pressedOutside) collapse()
      pressedOutside = false
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') collapse()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return detailsRef
}
