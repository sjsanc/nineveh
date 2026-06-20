import type { MouseEvent as ReactMouseEvent } from "react";
import { useRef } from "react";

export function useResizablePanel(
	_initialWidth: number,
	onWidthChange: (w: number) => void,
) {
	const panelRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const startX = useRef(0);
	const startWidth = useRef(0);

	function handleMouseDown(e: ReactMouseEvent) {
		e.preventDefault();
		isDragging.current = true;
		startX.current = e.clientX;
		startWidth.current = panelRef.current?.offsetWidth ?? 288;

		function onMouseMove(ev: MouseEvent) {
			if (!isDragging.current || !panelRef.current) return;
			const delta = startX.current - ev.clientX;
			const w = Math.max(200, Math.min(600, startWidth.current + delta));
			panelRef.current.style.width = `${w}px`;
		}

		function onMouseUp(ev: MouseEvent) {
			isDragging.current = false;
			const delta = startX.current - ev.clientX;
			const w = Math.max(200, Math.min(600, startWidth.current + delta));
			onWidthChange(w);
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		}

		document.addEventListener("mousemove", onMouseMove);
		document.addEventListener("mouseup", onMouseUp);
	}

	return [handleMouseDown, panelRef] as const;
}
