import type { Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";

export function makeColWidth<T>(table: Table<T>, containerWidth: number) {
	const total = table.getTotalSize();
	return (size: number) =>
		containerWidth > 0 && total > 0 ? (size / total) * containerWidth : size;
}

export function virtualPadding<
	TScrollElement extends Element | Window,
	TItemElement extends Element,
>(virtualizer: Virtualizer<TScrollElement, TItemElement>) {
	const items = virtualizer.getVirtualItems();
	const total = virtualizer.getTotalSize();
	return {
		items,
		paddingTop: items[0]?.start ?? 0,
		paddingBottom: total - (items.at(-1)?.end ?? 0),
	};
}
