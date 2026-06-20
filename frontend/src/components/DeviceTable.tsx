import { Icon, Menu, MenuDivider, MenuItem } from "@blueprintjs/core";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { makeTableKeyDown } from "../lib/tableKeyboard";
import { useContainerWidth } from "../lib/useContainerWidth";
import { useDismissableContextMenu } from "../lib/useDismissableContextMenu";
import { useShiftCtrlSelect } from "../lib/useShiftCtrlSelect";
import { makeColWidth, virtualPadding } from "../lib/virtualTable";
import type { Book, BookFile, DeviceInfo } from "../types";
import {
	buildIndex,
	FORMAT_COLORS,
	formatSize,
	matchBook,
	stemOf,
} from "../utils";
import { Dash } from "./table/Dash";
import { SelectionCheckmark } from "./table/SelectionCheckmark";
import { VirtualTableHead } from "./table/VirtualTableHead";

interface Props {
	data: BookFile[];
	books: Book[];
	device?: DeviceInfo;
	isLoading?: boolean;
	onRemoveFromDevice?: (paths: string[]) => void;
	onImportFromDevice?: (paths: string[]) => void;
	onSelectFile?: (file: BookFile | null) => void;
	onEject?: () => void;
}

function makeColumns(index: Map<string, Book>): ColumnDef<BookFile>[] {
	return [
		{
			id: "index",
			header: "#",
			size: 48,
			minSize: 48,
			enableSorting: false,
			cell: ({ row }) => <span className="text-zinc-500">{row.index + 1}</span>,
		},
		{
			id: "title",
			header: "Title",
			accessorFn: (row) =>
				matchBook(row, index)?.Title ?? (row.Title || stemOf(row.Path)),
			size: 280,
			minSize: 100,
		},
		{
			id: "authors",
			header: "Author(s)",
			accessorFn: (row) =>
				matchBook(row, index)?.Authors?.join(", ") ??
				row.Authors?.join(", ") ??
				"",
			size: 160,
			minSize: 80,
			cell: ({ getValue }) => getValue<string>() || <Dash />,
		},
		{
			id: "format",
			header: "Format",
			accessorKey: "Format",
			size: 90,
			minSize: 70,
			cell: ({ getValue }) => {
				const fmt = getValue<string>();
				return (
					<span
						className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide shrink-0 ${FORMAT_COLORS[fmt] ?? "bg-zinc-600"} text-white`}
					>
						{fmt}
					</span>
				);
			},
		},
		{
			id: "inLibrary",
			header: "In Library",
			size: 80,
			minSize: 60,
			accessorFn: (row) => matchBook(row, index) != null,
			cell: ({ getValue }) =>
				getValue<boolean>() ? (
					<Icon icon="tick-circle" size={14} className="text-emerald-500" />
				) : (
					<Dash />
				),
		},
		{
			id: "size",
			header: "Size",
			accessorKey: "Size",
			size: 90,
			minSize: 70,
			cell: ({ getValue }) => (
				<span className="text-zinc-400">{formatSize(getValue<number>())}</span>
			),
		},
	];
}

export function DeviceTable({
	data,
	books,
	device,
	isLoading,
	onRemoveFromDevice,
	onImportFromDevice,
	onSelectFile,
	onEject,
}: Props) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
	const [ctxMenu, setCtxMenu] = useDismissableContextMenu("device-ctx-menu");
	const { ref: containerRef, width: containerWidth } =
		useContainerWidth<HTMLDivElement>();
	const { lastClickedIndex, computeNext } = useShiftCtrlSelect();

	const index = useMemo(() => buildIndex(books), [books]);
	const columns = useMemo(() => makeColumns(index), [index]);

	const table = useReactTable({
		data,
		columns,
		columnResizeMode: "onChange",
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	const rows = table.getRowModel().rows;

	const rowVirtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => 36,
		overscan: 5,
	});
	const {
		items: virtualItems,
		paddingTop,
		paddingBottom,
	} = virtualPadding(rowVirtualizer);
	const colWidth = makeColWidth(table, containerWidth);

	function getCursorIndex(): number {
		if (selectedPaths.size !== 1) return -1;
		const path = [...selectedPaths][0];
		return rows.findIndex((r) => r.original.Path === path);
	}

	const handleTableKeyDown = makeTableKeyDown(
		rows,
		getCursorIndex,
		(file, _idx) => {
			setSelectedPaths(new Set([file.Path]));
			onSelectFile?.(file);
		},
		(idx, opts) => rowVirtualizer.scrollToIndex(idx, opts),
	);

	function handleRowClick(e: React.MouseEvent, path: string, rowIndex: number) {
		const next = computeNext(e, path, rowIndex, selectedPaths, (lo, hi) =>
			rows.slice(lo, hi + 1).map((r) => r.original.Path),
		);
		setSelectedPaths(next);
		onSelectFile?.(data.find((f) => f.Path === path) ?? null);
		containerRef.current?.focus({ preventScroll: true });
	}

	function handleContextMenu(
		e: React.MouseEvent,
		path: string,
		rowIndex: number,
	) {
		e.preventDefault();
		if (!selectedPaths.has(path)) {
			setSelectedPaths(new Set([path]));
			lastClickedIndex.current = rowIndex;
			onSelectFile?.(data.find((f) => f.Path === path) ?? null);
		}
		setCtxMenu({ x: e.clientX, y: e.clientY });
	}

	const selectionCount = selectedPaths.size;

	return (
		<div className="flex flex-col h-full w-full overflow-hidden">
			{device && (
				<div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-8 bg-zinc-900/50 shrink-0">
					<div className="flex flex-col gap-0.5">
						<span className="text-[10px] text-zinc-500 uppercase tracking-wider">
							Device
						</span>
						<span className="text-sm text-zinc-200 font-medium">
							{device.Name}
						</span>
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="text-[10px] text-zinc-500 uppercase tracking-wider">
							Books
						</span>
						<span className="text-sm text-zinc-200 font-medium">
							{isLoading ? "—" : data.length}
						</span>
					</div>
					{device.FreeSpace > 0 && (
						<div className="flex flex-col gap-0.5">
							<span className="text-[10px] text-zinc-500 uppercase tracking-wider">
								Free Space
							</span>
							<span className="text-sm text-zinc-200 font-medium">
								{formatSize(device.FreeSpace)}
							</span>
						</div>
					)}
					{onEject && (
						<button
							type="button"
							onClick={onEject}
							title="Eject device"
							className="ml-auto w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
						>
							<Icon icon="eject" size={16} />
						</button>
					)}
				</div>
			)}
			<section
				ref={containerRef}
				aria-label="Device books"
				tabIndex={0}
				onKeyDown={handleTableKeyDown}
				className="overflow-x-hidden overflow-y-auto flex-1 w-full outline-none"
			>
				{isLoading ? (
					<div className="flex items-center justify-center h-full text-zinc-600 text-sm">
						Loading books…
					</div>
				) : data.length === 0 ? (
					<div className="flex items-center justify-center h-full text-zinc-600 text-sm">
						No books found on device
					</div>
				) : (
					<table
						className="text-sm text-zinc-200"
						style={{
							width: containerWidth || "100%",
							tableLayout: "fixed",
							borderCollapse: "separate",
							borderSpacing: 0,
						}}
					>
						<VirtualTableHead table={table} colWidth={colWidth} />
						<tbody>
							{paddingTop > 0 && (
								<tr>
									<td style={{ height: paddingTop }} />
								</tr>
							)}
							{virtualItems.map((virtualRow) => {
								const row = rows[virtualRow.index];
								const path = row.original.Path;
								const isSelected = selectedPaths.has(path);
								return (
									<tr
										key={row.id}
										onClick={(e) => handleRowClick(e, path, virtualRow.index)}
										onContextMenu={(e) =>
											handleContextMenu(e, path, virtualRow.index)
										}
										className={`border-b border-zinc-800/60 cursor-pointer transition-colors select-none ${
											isSelected
												? "bg-zinc-700/60"
												: virtualRow.index % 2 !== 0
													? "bg-zinc-900/30 hover:bg-zinc-800/60"
													: "hover:bg-zinc-800/60"
										}`}
									>
										{row.getVisibleCells().map((cell) => (
											<td
												key={cell.id}
												className="px-3 py-2 truncate"
												style={{ width: colWidth(cell.column.getSize()) }}
											>
												{cell.column.id === "index" ? (
													isSelected && selectionCount > 1 ? (
														<SelectionCheckmark />
													) : (
														<span className="text-zinc-500">
															{virtualRow.index + 1}
														</span>
													)
												) : (
													flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)
												)}
											</td>
										))}
									</tr>
								);
							})}
							{paddingBottom > 0 && (
								<tr>
									<td style={{ height: paddingBottom }} />
								</tr>
							)}
						</tbody>
					</table>
				)}

				{ctxMenu &&
					ReactDOM.createPortal(
						<div
							id="device-ctx-menu"
							className="bp6-dark"
							style={{
								position: "fixed",
								left: ctxMenu.x,
								top: ctxMenu.y,
								zIndex: 1000,
							}}
						>
							<Menu>
								<MenuItem
									disabled
									text={`${selectionCount} file${selectionCount === 1 ? "" : "s"} selected`}
								/>
								<MenuDivider />
								<MenuItem
									text={`Send to library`}
									icon="import"
									onClick={() => {
										onImportFromDevice?.([...selectedPaths]);
										setCtxMenu(null);
									}}
								/>
								<MenuDivider />
								<MenuItem
									text={`Remove ${selectionCount} file${selectionCount === 1 ? "" : "s"} from device`}
									intent="danger"
									onClick={() => {
										onRemoveFromDevice?.([...selectedPaths]);
										setSelectedPaths(new Set());
										onSelectFile?.(null);
										setCtxMenu(null);
									}}
								/>
							</Menu>
						</div>,
						document.body,
					)}
			</section>
		</div>
	);
}
