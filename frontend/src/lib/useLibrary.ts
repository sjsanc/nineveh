import { useEffect, useState } from "react";
import {
	DeleteBook,
	FetchBookMetadata,
	GetBooks,
	ImportBooksFromDevice,
	ImportFile,
	ImportFromCalibre,
	LocateFormat,
	OpenBook,
	RelocateLibrary,
	RemoveFormat,
	ResetLibrary,
	SelectDirectory,
	SelectFiles,
	SendBook,
	UpdateBook,
} from "../../wailsjs/go/main/App";
import { type Book, type FetchedMetadata, metadata } from "../types";
import type { useToaster } from "./useToaster";

const KINDLE_FORMAT_PRIORITY = ["azw3", "mobi", "azw", "epub", "pdf"];

// Owns the book library: the book list, selection, edit/fetch-metadata
// dialog state, search, and all book-CRUD operations (including ones
// triggered from the Devices tab, since they only ever touch book state).
export function useLibrary(toast: ReturnType<typeof useToaster>) {
	const { showToast, startProgressToast, updateProgressToast } = toast;
	const [books, setBooks] = useState<Book[]>([]);
	const [selectedBook, setSelectedBook] = useState<Book | null>(null);
	const [selectedBookIds, setSelectedBookIds] = useState<Set<number>>(
		new Set(),
	);
	const [editingBook, setEditingBook] = useState<Book | null>(null);
	const [editNavList, setEditNavList] = useState<Book[]>([]);
	const [fetchingBook, setFetchingBook] = useState<Book | null>(null);
	const [metadataCandidates, setMetadataCandidates] = useState<
		FetchedMetadata[] | null
	>(null);
	const [fetchError, setFetchError] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [missingCalloutDismissed, setMissingCalloutDismissed] = useState(false);

	useEffect(() => {
		GetBooks()
			.then((result) => {
				const loaded = result ?? [];
				setBooks(loaded);
				if (loaded.length > 0) setSelectedBook(loaded[0]);
			})
			.catch(console.error);
	}, []);

	async function reload() {
		const loaded = await GetBooks().catch(() => null);
		if (loaded) setBooks(loaded);
	}

	function handleSelectionChange(ids: Set<number>, focused: Book | null) {
		setSelectedBookIds(ids);
		if (focused) setSelectedBook(focused);
	}

	async function sendToDevice(bookIds: number[], deviceId: string) {
		const total = bookIds.length;
		const key = startProgressToast(
			`Sending ${total} book${total === 1 ? "" : "s"}…`,
		);
		let sent = 0;
		let skipped = 0;
		for (let i = 0; i < bookIds.length; i++) {
			const id = bookIds[i];
			const book = books.find((b) => b.ID === id);
			if (!book) {
				skipped++;
			} else {
				const bestFormat = KINDLE_FORMAT_PRIORITY.find((fmt) =>
					book.Formats?.some((f) => f.Format === fmt),
				);
				if (!bestFormat) {
					skipped++;
				} else {
					try {
						await SendBook(id, deviceId, bestFormat);
						sent++;
					} catch (err) {
						console.error(`SendBook failed for ${id}:`, err);
						skipped++;
					}
				}
			}
			if (i < bookIds.length - 1) {
				updateProgressToast(key, `Sending ${i + 1}/${total}…`);
			}
		}
		const msg =
			skipped > 0
				? `Sent ${sent}/${total} (${skipped} skipped — no compatible format)`
				: `Sent ${sent} book${sent === 1 ? "" : "s"}`;
		showToast(msg, skipped > 0 ? "warning" : "success", 4000, key);
	}

	function handleEditBook(book: Book, orderedList: Book[]) {
		setEditNavList(orderedList);
		setEditingBook(book);
	}

	function closeEditDialog() {
		setEditingBook(null);
		setEditNavList([]);
	}

	function handleSaveBook(updated: Book) {
		setBooks((prev) => prev.map((b) => (b.ID === updated.ID ? updated : b)));
		if (selectedBook?.ID === updated.ID) setSelectedBook(updated);
	}

	async function handleFetchMetadata(book: Book) {
		setFetchingBook(book);
		setMetadataCandidates(null);
		setFetchError("");
		try {
			const candidates = await FetchBookMetadata(book.ID as number);
			setMetadataCandidates(candidates ?? []);
		} catch (err) {
			setFetchError(String(err));
			setMetadataCandidates([]);
		}
	}

	function closeFetchDialog() {
		setFetchingBook(null);
		setMetadataCandidates(null);
		setFetchError("");
	}

	async function handleToggleRead(bookIds: number[], isRead: boolean) {
		const targets = books.filter((b) => bookIds.includes(b.ID as number));
		await Promise.all(
			targets.map((b) =>
				UpdateBook(new metadata.Book({ ...b, IsRead: isRead })),
			),
		);
		const updated = (b: Book) => new metadata.Book({ ...b, IsRead: isRead });
		setBooks((prev) =>
			prev.map((b) => (bookIds.includes(b.ID as number) ? updated(b) : b)),
		);
		if (selectedBook && bookIds.includes(selectedBook.ID as number)) {
			setSelectedBook((prev) => (prev ? updated(prev) : prev));
		}
	}

	async function handleRemoveBooks(ids: number[]) {
		const results = await Promise.allSettled(ids.map((id) => DeleteBook(id)));
		const removed = results.filter((r) => r.status === "fulfilled").length;
		results.forEach((r, i) => {
			if (r.status === "rejected")
				console.error(`DeleteBook failed for ${ids[i]}:`, r.reason);
		});
		setBooks((prev) => prev.filter((b) => !ids.includes(b.ID as number)));
		if (selectedBook && ids.includes(selectedBook.ID as number)) {
			setSelectedBook(null);
		}
		setSelectedBookIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => {
				next.delete(id);
			});
			return next;
		});
		showToast(`Removed ${removed} book${removed === 1 ? "" : "s"}`, "success");
	}

	async function importFromDevice(paths: string[]) {
		const key = startProgressToast(
			`Importing ${paths.length} book${paths.length === 1 ? "" : "s"}…`,
		);
		try {
			const added = await ImportBooksFromDevice(paths);
			const refreshed = await GetBooks();
			setBooks(refreshed ?? []);
			const msg =
				added === paths.length
					? `Added ${added} book${added === 1 ? "" : "s"} to library`
					: `Added ${added} of ${paths.length} to library`;
			showToast(msg, added > 0 ? "success" : "warning", 4000, key);
		} catch (err) {
			showToast("Import from device failed", "danger", 4000, key);
			console.error(err);
		}
	}

	async function handleAddBooks() {
		try {
			const paths = await SelectFiles();
			if (!paths?.length) return;
			const key = startProgressToast(
				`Adding ${paths.length} book${paths.length === 1 ? "" : "s"}…`,
			);
			const results = await Promise.allSettled(
				paths.map((path) => ImportFile(path)),
			);
			const added: Book[] = [];
			for (const r of results) {
				if (r.status === "fulfilled" && r.value) added.push(r.value);
				else if (r.status === "rejected")
					console.error("ImportFile failed:", r.reason);
			}
			if (added.length > 0) {
				setBooks((prev) => [...prev, ...added]);
				showToast(
					`Added ${added.length} book${added.length === 1 ? "" : "s"}`,
					"success",
					3000,
					key,
				);
			} else {
				showToast("Nothing added", "warning", 3000, key);
			}
		} catch (err) {
			showToast("Add failed", "danger", 3000);
			console.error(err);
		}
	}

	async function handleImportFromCalibre() {
		try {
			const dir = await SelectDirectory();
			if (!dir) return;
			const key = startProgressToast("Importing from Calibre…");
			const imported = (await ImportFromCalibre(dir)) ?? [];
			if (imported.length > 0) {
				setBooks((prev) => [...prev, ...imported]);
				showToast(
					`Imported ${imported.length} book${imported.length === 1 ? "" : "s"}`,
					"success",
					3000,
					key,
				);
			} else {
				showToast("Nothing new found", "warning", 3000, key);
			}
		} catch (err) {
			showToast("Import failed", "danger", 3000);
			console.error(err);
		}
	}

	async function handleOpenBook(bookId: number, format: string) {
		try {
			await OpenBook(bookId, format);
		} catch (err) {
			showToast(`Failed to open book: ${err}`, "danger");
			console.error(err);
		}
	}

	function replaceBook(updated: Book) {
		setBooks((prev) => prev.map((b) => (b.ID === updated.ID ? updated : b)));
		setSelectedBook((prev) => (prev?.ID === updated.ID ? updated : prev));
	}

	async function handleLocateFormat(bookId: number, hash: string) {
		try {
			const updated = await LocateFormat(bookId, hash);
			if (updated) replaceBook(updated);
		} catch (err) {
			showToast(`Failed to locate file: ${err}`, "danger");
			console.error(err);
		}
	}

	async function handleRemoveFormat(bookId: number, hash: string) {
		try {
			const updated = await RemoveFormat(bookId, hash);
			if (updated) replaceBook(updated);
		} catch (err) {
			showToast(`Failed to remove format: ${err}`, "danger");
			console.error(err);
		}
	}

	async function handleRelocateLibrary() {
		try {
			const count = await RelocateLibrary();
			if (count > 0) {
				const updated = await GetBooks();
				setBooks(updated ?? []);
				setMissingCalloutDismissed(false);
				showToast(
					`Relocated ${count} file${count === 1 ? "" : "s"}`,
					"success",
				);
			} else {
				showToast(
					"No files could be matched at the selected location",
					"warning",
				);
			}
		} catch (err) {
			showToast(`Relocation failed: ${err}`, "danger");
			console.error(err);
		}
	}

	async function handleResetLibrary() {
		if (
			!confirm(
				"Reset library? This clears all books and covers from the database.",
			)
		)
			return;
		try {
			await ResetLibrary();
			setBooks([]);
			setSelectedBook(null);
			showToast("Library reset", "success");
		} catch (err) {
			showToast("Reset failed", "danger");
			console.error(err);
		}
	}

	function handleAppendFilter(field: string, value: string) {
		const token = value.includes(" ")
			? `${field}:"${value}"`
			: `${field}:${value}`;
		setSearchQuery((prev) => {
			if (prev.includes(token))
				return prev.replace(token, "").replace(/\s+/g, " ").trim();
			return prev ? `${prev} ${token}` : token;
		});
	}

	const missingCount = books.filter((b) =>
		b.Formats?.some((f) => f.Missing),
	).length;
	const showMissingCallout =
		!missingCalloutDismissed &&
		missingCount > 0 &&
		(missingCount >= 5 || missingCount / Math.max(books.length, 1) >= 0.25);

	return {
		books,
		selectedBook,
		setSelectedBook,
		selectedBookIds,
		editingBook,
		editNavList,
		fetchingBook,
		metadataCandidates,
		fetchError,
		searchQuery,
		setSearchQuery,
		missingCount,
		showMissingCallout,
		setMissingCalloutDismissed,
		reload,
		handleSelectionChange,
		sendToDevice,
		handleEditBook,
		closeEditDialog,
		handleSaveBook,
		handleFetchMetadata,
		closeFetchDialog,
		handleToggleRead,
		handleRemoveBooks,
		importFromDevice,
		handleAddBooks,
		handleImportFromCalibre,
		handleOpenBook,
		handleLocateFormat,
		handleRemoveFormat,
		handleRelocateLibrary,
		handleResetLibrary,
		handleAppendFilter,
	};
}
