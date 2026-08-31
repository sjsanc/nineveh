import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FormatConflict } from "../types";
import { FORMAT_COLORS, formatSize } from "../utils";

interface Props {
	conflicts: FormatConflict[];
	onSubmit: (selected: FormatConflict[]) => void | Promise<void>;
	onCancel: () => void;
}

function conflictKey(c: FormatConflict): string {
	return `${c.BookID}:${c.Format}:${c.IncomingPath}`;
}

export function ConflictReviewDialog({ conflicts, onSubmit, onCancel }: Props) {
	const [checked, setChecked] = useState<Set<string>>(
		() => new Set(conflicts.map(conflictKey)),
	);
	const [submitting, setSubmitting] = useState(false);

	// New conflicts added to the batch (e.g. a second "Add Books" run while
	// this is open) default to checked, same as the initial set.
	useEffect(() => {
		setChecked((prev) => {
			const next = new Set(prev);
			for (const c of conflicts) next.add(conflictKey(c));
			return next;
		});
	}, [conflicts]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !submitting) onCancel();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onCancel, submitting]);

	if (conflicts.length === 0) return null;

	function toggle(key: string) {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	async function handleSubmit() {
		setSubmitting(true);
		try {
			await onSubmit(conflicts.filter((c) => checked.has(conflictKey(c))));
		} finally {
			setSubmitting(false);
		}
	}

	const selectedCount = conflicts.filter((c) =>
		checked.has(conflictKey(c)),
	).length;

	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Books already in library"
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget && !submitting) onCancel();
			}}
		>
			<div className="bg-zinc-100 dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col border border-zinc-200 dark:border-zinc-800">
				{/* Header */}
				<div className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center shrink-0">
					<h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
						Books Already in Library
					</h2>
					<button
						type="button"
						onMouseDown={onCancel}
						disabled={submitting}
						className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 text-2xl leading-none disabled:opacity-30"
					>
						×
					</button>
				</div>

				{/* Body */}
				<div className="px-6 pt-4 pb-2 shrink-0">
					<p className="text-sm text-zinc-600 dark:text-zinc-400">
						The following already have a copy in your library. Select which ones
						to add anyway.
					</p>
				</div>
				<div className="overflow-y-auto flex-1 min-h-0 px-6 pb-4 flex flex-col gap-1.5">
					{conflicts.map((c) => {
						const key = conflictKey(c);
						const name = c.IncomingPath.split(/[/\\]/).pop() ?? c.IncomingPath;
						const existingName =
							c.ExistingPath.split(/[/\\]/).pop() ?? c.ExistingPath;
						return (
							<label
								key={key}
								className="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2.5 cursor-pointer"
							>
								<input
									type="checkbox"
									checked={checked.has(key)}
									onChange={() => toggle(key)}
									className="accent-blue-500 cursor-pointer shrink-0"
								/>
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-2">
										<div className="flex items-baseline gap-2 min-w-0">
											<span
												className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide shrink-0 text-white ${FORMAT_COLORS[c.Format] ?? "bg-zinc-600"}`}
											>
												{c.Format}
											</span>
											<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
												{c.BookTitle}
											</p>
										</div>
										<span className="text-xs text-zinc-500 shrink-0">
											{formatSize(c.IncomingSize)}
										</span>
									</div>
									<p className="text-xs text-zinc-500 truncate">{name}</p>
									<p className="text-xs text-zinc-400 dark:text-zinc-600 truncate">
										Already in library: {existingName}
									</p>
								</div>
							</label>
						);
					})}
				</div>

				{/* Footer */}
				<div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center shrink-0">
					<div className="flex gap-2">
						<button
							type="button"
							onMouseDown={() =>
								setChecked(new Set(conflicts.map(conflictKey)))
							}
							disabled={submitting}
							className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 rounded border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-50"
						>
							Select All
						</button>
						<button
							type="button"
							onMouseDown={() => setChecked(new Set())}
							disabled={submitting}
							className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 rounded border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-50"
						>
							Select None
						</button>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							onMouseDown={onCancel}
							disabled={submitting}
							className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 rounded border border-zinc-300 dark:border-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="button"
							onMouseDown={handleSubmit}
							disabled={submitting}
							className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
						>
							{submitting ? "Adding…" : `Add ${selectedCount} Selected`}
						</button>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
