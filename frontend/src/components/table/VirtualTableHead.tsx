import { Icon } from "@blueprintjs/core";
import { flexRender, type Table } from "@tanstack/react-table";

interface Props<T> {
	table: Table<T>;
	colWidth: (size: number) => number;
}

export function VirtualTableHead<T>({ table, colWidth }: Props<T>) {
	return (
		<thead className="sticky top-0 z-10 bg-zinc-900">
			{table.getHeaderGroups().map((hg) => (
				<tr key={hg.id}>
					{hg.headers.map((header) => (
						<th
							key={header.id}
							className="relative text-left px-3 py-2 font-medium text-zinc-400 border-b border-zinc-700 select-none whitespace-nowrap"
							style={{ width: colWidth(header.getSize()), minWidth: "3ch" }}
						>
							{header.column.getCanSort() ? (
								<button
									type="button"
									className="flex items-center justify-between gap-1 w-full cursor-pointer hover:text-zinc-100"
									onClick={header.column.getToggleSortingHandler()}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ")
											header.column.toggleSorting();
									}}
								>
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
									{header.column.getIsSorted() === "asc" && (
										<Icon icon="sort-asc" size={12} className="text-zinc-400" />
									)}
									{header.column.getIsSorted() === "desc" && (
										<Icon
											icon="sort-desc"
											size={12}
											className="text-zinc-400"
										/>
									)}
								</button>
							) : (
								<div className="flex items-center justify-between gap-1">
									{flexRender(
										header.column.columnDef.header,
										header.getContext(),
									)}
								</div>
							)}
							<div
								aria-hidden="true"
								onMouseDown={header.getResizeHandler()}
								onTouchStart={header.getResizeHandler()}
								className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-zinc-600 opacity-0 hover:opacity-100 active:opacity-100 transition-opacity"
							/>
						</th>
					))}
				</tr>
			))}
		</thead>
	);
}
