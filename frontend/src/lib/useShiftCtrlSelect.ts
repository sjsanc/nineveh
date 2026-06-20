import { type MouseEvent as ReactMouseEvent, useRef } from "react";

// Shared shift-range / ctrl-toggle / plain-click row selection behavior
// used by both the book table and the device table.
export function useShiftCtrlSelect() {
	const lastClickedIndex = useRef<number | null>(null);

	function computeNext<ID>(
		e: ReactMouseEvent,
		id: ID,
		rowIndex: number,
		currentSelection: Set<ID>,
		rangeIds: (lo: number, hi: number) => ID[],
	): Set<ID> {
		if (e.shiftKey && lastClickedIndex.current !== null) {
			const lo = Math.min(lastClickedIndex.current, rowIndex);
			const hi = Math.max(lastClickedIndex.current, rowIndex);
			return new Set(rangeIds(lo, hi));
		}
		if (e.ctrlKey || e.metaKey) {
			const next = new Set(currentSelection);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			lastClickedIndex.current = rowIndex;
			return next;
		}
		lastClickedIndex.current = rowIndex;
		return new Set([id]);
	}

	return { lastClickedIndex, computeNext };
}
