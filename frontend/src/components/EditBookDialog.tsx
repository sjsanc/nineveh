import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { UpdateBook } from "../../wailsjs/go/main/App";
import type { Book } from "../types";
import { BookEditForm } from "./BookEditForm";

interface Props {
	book: Book | null;
	navList: Book[];
	onClose: () => void;
	onSave: (updated: Book) => void;
	onSaveAllComplete?: (count: number) => void;
}

export function EditBookDialog({
	book,
	navList,
	onClose,
	onSave,
	onSaveAllComplete,
}: Props) {
	const [currentIndex, setCurrentIndex] = useState(-1);
	const [stagedChanges, setStagedChanges] = useState<Map<number, Book>>(
		new Map(),
	);
	const [isSavingAll, setIsSavingAll] = useState(false);

	// Reset when a new book is opened for editing
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on book.ID to avoid re-initialising when navList reference updates after a save
	useEffect(() => {
		setStagedChanges(new Map());
		if (!book) return;
		const idx = navList.findIndex((b) => b.ID === book.ID);
		setCurrentIndex(idx);
	}, [book?.ID]);

	const handleClose = useCallback(() => {
		if (stagedChanges.size > 0) {
			if (
				!window.confirm(
					`Discard unsaved changes to ${stagedChanges.size} book(s)?`,
				)
			)
				return;
		}
		setStagedChanges(new Map());
		onClose();
	}, [stagedChanges.size, onClose]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") handleClose();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [handleClose]);

	if (!book) return null;

	const currentBook =
		currentIndex >= 0
			? (stagedChanges.get(navList[currentIndex]?.ID as number) ??
				navList[currentIndex])
			: book;

	function handleNavigate(direction: 1 | -1, staged: Book | null) {
		if (staged)
			setStagedChanges((prev) =>
				new Map(prev).set(staged.ID as number, staged),
			);
		setCurrentIndex((i) => i + direction);
	}

	async function handleSaveAll(currentFormBook: Book) {
		setIsSavingAll(true);
		const toSave = new Map(stagedChanges).set(
			currentFormBook.ID as number,
			currentFormBook,
		);
		for (const [, b] of toSave) {
			await UpdateBook(b);
			onSave(b);
		}
		setIsSavingAll(false);
		onSaveAllComplete?.(toSave.size);
		onClose();
	}

	const canGoPrev = currentIndex > 0;
	const canGoNext = currentIndex >= 0 && currentIndex < navList.length - 1;
	const isMultiEdit = stagedChanges.size > 0;
	const stagedCount = stagedChanges.size;
	const isCurrentStaged = stagedChanges.has((currentBook ?? book).ID as number);
	const positionLabel =
		currentIndex >= 0 ? ` (${currentIndex + 1} / ${navList.length})` : "";

	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Edit book metadata"
			className="bp6-dark fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) handleClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") handleClose();
			}}
		>
			<div className="bg-zinc-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-zinc-800">
				<div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center z-10">
					<h2 className="text-lg font-semibold text-zinc-100">
						Edit Book Metadata{positionLabel}
					</h2>
					<button
						type="button"
						onMouseDown={handleClose}
						className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
					>
						×
					</button>
				</div>

				<BookEditForm
					key={(currentBook ?? book).ID as number}
					book={currentBook ?? book}
					onClose={handleClose}
					onSave={onSave}
					onNavigate={handleNavigate}
					onSaveAll={handleSaveAll}
					canGoPrev={canGoPrev}
					canGoNext={canGoNext}
					isMultiEdit={isMultiEdit}
					isSavingAll={isSavingAll}
					stagedCount={stagedCount}
					isCurrentStaged={isCurrentStaged}
				/>
			</div>
		</div>,
		document.body,
	);
}
