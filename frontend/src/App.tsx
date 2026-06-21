import {
	type Intent,
	OverlayToaster,
	Spinner,
	type Toaster,
} from "@blueprintjs/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	DeleteBook,
	DetectDevices,
	EjectDevice,
	FetchBookMetadata,
	GetBooks,
	ImportBooksFromDevice,
	ImportFile,
	ImportFromCalibre,
	ListDeviceBooks,
	OpenBook,
	RemoveFromDevice,
	ResetLibrary,
	SelectDirectory,
	SelectFiles,
	SendBook,
	UpdateBook,
} from "../wailsjs/go/main/App";
import { prefs } from "../wailsjs/go/models";
import { EventsOn } from "../wailsjs/runtime/runtime";
import { BookPanel } from "./components/BookPanel";
import { BookTable } from "./components/BookTable";
import { DevicePanel } from "./components/DevicePanel";
import { DeviceTable } from "./components/DeviceTable";
import { EditBookDialog } from "./components/EditBookDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FetchMetadataDialog } from "./components/FetchMetadataDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { SubSidebar } from "./components/SubSidebar";
import { DeviceProvider } from "./deviceContext";
import { usePrefs } from "./prefsContext";
import {
	type Book,
	type BookFile,
	type DeviceInfo,
	type FetchedMetadata,
	metadata,
} from "./types";

const KINDLE_FORMAT_PRIORITY = ["azw3", "mobi", "azw", "epub", "pdf"];

function App() {
	const { prefs: appPrefs, updatePrefs } = usePrefs();
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
	const [devices, setDevices] = useState<DeviceInfo[]>([]);
	const [activeDeviceID, setActiveDeviceID] = useState<string | null>(null);
	const [deviceLetterMap, setDeviceLetterMap] = useState<Map<string, string>>(
		new Map(),
	);
	const [deviceBooks, setDeviceBooks] = useState<BookFile[]>([]);
	const [activeSection, setActiveSection] = useState<"library" | "devices">(
		"library",
	);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [selectedDeviceFile, setSelectedDeviceFile] = useState<BookFile | null>(
		null,
	);
	const [isLoadingDeviceBooks, setIsLoadingDeviceBooks] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const toasterRef = useRef<Toaster | null>(null);
	const prevDevicesRef = useRef<DeviceInfo[]>([]);

	useEffect(() => {
		OverlayToaster.create({ position: "top" }).then((t) => {
			toasterRef.current = t;
		});
	}, []);

	const assignLetters = useCallback((found: DeviceInfo[]) => {
		setDeviceLetterMap((prev) => {
			const next = new Map(prev);
			for (const d of found) {
				if (!next.has(d.ID) && next.size < 26) {
					next.set(d.ID, String.fromCharCode(65 + next.size));
				}
			}
			return next;
		});
	}, []);

	function showToast(
		msg: string,
		intent: Intent = "none",
		ms = 3000,
		key?: string,
	) {
		toasterRef.current?.show({ message: msg, intent, timeout: ms }, key);
	}

	function startProgressToast(msg: string): string {
		return (
			toasterRef.current?.show({
				message: (
					<span className="flex items-center gap-2">
						<Spinner size={12} />
						{msg}
					</span>
				),
				timeout: 0,
			}) ?? ""
		);
	}

	const loadDevices = useCallback(async (): Promise<DeviceInfo[]> => {
		const result = await DetectDevices();
		const found = result ?? [];
		setDevices(found);
		assignLetters(found);
		if (found.length > 0) {
			setActiveDeviceID(found[0].ID);
			setIsLoadingDeviceBooks(true);
			ListDeviceBooks(found[0].ID)
				.then((files) => setDeviceBooks(files ?? []))
				.catch(console.error)
				.finally(() => setIsLoadingDeviceBooks(false));
		}
		return found;
	}, [assignLetters]);

	useEffect(() => {
		GetBooks()
			.then((result) => {
				const loaded = result ?? [];
				setBooks(loaded);
				if (loaded.length > 0) setSelectedBook(loaded[0]);
			})
			.catch(console.error);

		loadDevices()
			.then((found) => {
				prevDevicesRef.current = found;
			})
			.catch(console.error);
	}, [loadDevices]);

	useEffect(() => {
		const unsubscribe = EventsOn("devices:changed", (found: DeviceInfo[]) => {
			const list = found ?? [];
			const prev = prevDevicesRef.current;
			const prevIds = new Set(prev.map((d) => d.ID));
			const nextIds = new Set(list.map((d) => d.ID));

			for (const d of list) {
				if (!prevIds.has(d.ID)) {
					toasterRef.current?.show({
						message: `${d.Name} connected`,
						intent: "success",
						timeout: 4000,
					});
				}
			}
			for (const d of prev) {
				if (!nextIds.has(d.ID)) {
					toasterRef.current?.show({
						message: `${d.Name} disconnected`,
						timeout: 4000,
					});
				}
			}

			prevDevicesRef.current = list;
			setDevices(list);
			assignLetters(list);
		});
		return unsubscribe;
	}, [assignLetters]);

	useEffect(() => {
		if (devices.length === 0) {
			setActiveSection("library");
			setActiveDeviceID(null);
			setDeviceBooks([]);
			setSelectedDeviceFile(null);
			return;
		}
		if (activeDeviceID && !devices.some((d) => d.ID === activeDeviceID)) {
			setActiveDeviceID(null);
			setDeviceBooks([]);
		}
	}, [devices, activeDeviceID]);

	async function handleSelectDevice(id: string) {
		if (isLoadingDeviceBooks) return;
		setActiveDeviceID(id);
		setSelectedDeviceFile(null);
		setIsLoadingDeviceBooks(true);
		try {
			const files = await ListDeviceBooks(id);
			setDeviceBooks(files ?? []);
		} catch (err) {
			setDeviceBooks([]);
			console.error(err);
		} finally {
			setIsLoadingDeviceBooks(false);
		}
	}

	function handleSelectLibrary() {
		setActiveSection("library");
		setSelectedDeviceFile(null);
	}

	async function handleSelectDevices() {
		setActiveSection("devices");
		setSelectedDeviceFile(null);
		const targetId = activeDeviceID ?? devices[0]?.ID;
		if (targetId) await handleSelectDevice(targetId);
	}

	async function handleRescanDevices() {
		try {
			const found = await loadDevices();
			if (found.length === 0) setDeviceBooks([]);
			if (activeDeviceID && !found.some((d) => d.ID === activeDeviceID))
				setActiveDeviceID(null);
		} catch (err) {
			console.error(err);
		}
	}

	function handleSelectionChange(ids: Set<number>, focused: Book | null) {
		setSelectedBookIds(ids);
		if (focused) setSelectedBook(focused);
	}

	async function handleSendToDevice(bookIds: number[], deviceId: string) {
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
				toasterRef.current?.show(
					{
						message: (
							<span className="flex items-center gap-2">
								<Spinner size={12} />
								{`Sending ${i + 1}/${total}…`}
							</span>
						),
						timeout: 0,
					},
					key,
				);
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

	async function handleEjectDevice(deviceID: string) {
		const deviceName = devices.find((d) => d.ID === deviceID)?.Name ?? "Device";
		try {
			await EjectDevice(deviceID);
			setActiveDeviceID(null);
			setDeviceBooks([]);
			setSelectedDeviceFile(null);
			setActiveSection("library");
			toasterRef.current?.show({
				message: `${deviceName} ejected`,
				intent: "success",
				timeout: 4000,
			});
		} catch (err) {
			toasterRef.current?.show({
				message: `Eject failed: ${err}`,
				intent: "danger",
				timeout: 4000,
			});
			console.error(err);
		}
	}

	async function handleRemoveFromDevice(paths: string[]) {
		if (!activeDeviceID) return;
		try {
			await RemoveFromDevice(activeDeviceID, paths);
			setDeviceBooks((prev) => prev.filter((b) => !paths.includes(b.Path)));
			showToast(
				`Removed ${paths.length} file${paths.length === 1 ? "" : "s"} from device`,
				"success",
			);
		} catch (err) {
			showToast("Remove failed", "danger");
			console.error(err);
		}
	}

	async function handleImportFromDevice(paths: string[]) {
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

	const activeDevice = devices.find((d) => d.ID === activeDeviceID) ?? null;

	return (
		<DeviceProvider
			value={{ devices, activeDeviceID, deviceLetterMap, deviceBooks }}
		>
			<div className="bp6-dark h-screen w-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
				<Sidebar
					isLibraryActive={activeSection === "library"}
					isDevicesActive={activeSection === "devices"}
					hasDevices={devices.length > 0}
					onSelectLibrary={handleSelectLibrary}
					onSelectDevices={handleSelectDevices}
					onRescan={handleRescanDevices}
					onSettingsOpen={() => setSettingsOpen(true)}
				/>
				<SubSidebar
					activeSection={activeSection}
					onImport={handleImportFromCalibre}
					onAdd={handleAddBooks}
					onReset={handleResetLibrary}
					onSelectDevice={handleSelectDevice}
					isLoadingDeviceBooks={isLoadingDeviceBooks}
				/>
				<div className="flex-1 flex flex-col overflow-hidden">
					<main className="flex-1 overflow-hidden flex flex-col">
						<ErrorBoundary key={activeSection}>
							{activeSection === "devices" ? (
								<div className="flex-1 overflow-hidden flex flex-row">
									<DeviceTable
										data={deviceBooks}
										books={books}
										device={activeDevice ?? undefined}
										isLoading={isLoadingDeviceBooks}
										onRemoveFromDevice={handleRemoveFromDevice}
										onImportFromDevice={handleImportFromDevice}
										onSelectFile={setSelectedDeviceFile}
										onEject={
											activeDeviceID
												? () => handleEjectDevice(activeDeviceID)
												: undefined
										}
									/>
									{selectedDeviceFile && (
										<DevicePanel
											key={selectedDeviceFile.Path}
											file={selectedDeviceFile}
											books={books}
											width={appPrefs.detailsPaneWidth || 288}
											onWidthChange={(w) =>
												updatePrefs(
													new prefs.Preferences({
														...appPrefs,
														detailsPaneWidth: w,
													}),
												)
											}
										/>
									)}
								</div>
							) : (
								<div className="flex-1 overflow-hidden flex flex-row">
									<BookTable
										data={books}
										selectedBookId={selectedBook?.ID}
										selectedBookIds={selectedBookIds}
										onSelectBook={setSelectedBook}
										onSelectionChange={handleSelectionChange}
										onDoubleClickBook={(book) =>
											book.Formats?.length &&
											handleOpenBook(book.ID as number, book.Formats[0].Format)
										}
										onSendToDevice={handleSendToDevice}
										onEditBook={handleEditBook}
										onFetchMetadata={handleFetchMetadata}
										onToggleRead={handleToggleRead}
										onRemoveBooks={handleRemoveBooks}
										onOpenBook={handleOpenBook}
										columnWidths={appPrefs.columns?.widths ?? {}}
										onColumnWidthsChange={(widths) =>
											updatePrefs(
												new prefs.Preferences({
													...appPrefs,
													columns: { ...appPrefs.columns, widths },
												}),
											)
										}
										visibleColumns={appPrefs.columns?.visible ?? []}
										searchQuery={searchQuery}
										onSearchQueryChange={setSearchQuery}
									/>
									{selectedBook && (
										<BookPanel
											key={selectedBook.ID}
											book={selectedBook}
											width={appPrefs.detailsPaneWidth || 288}
											onWidthChange={(w) =>
												updatePrefs(
													new prefs.Preferences({
														...appPrefs,
														detailsPaneWidth: w,
													}),
												)
											}
											onOpenBook={handleOpenBook}
											onAppendFilter={handleAppendFilter}
										/>
									)}
								</div>
							)}
						</ErrorBoundary>
					</main>
				</div>
				<ErrorBoundary key={editingBook?.ID ?? "no-edit"}>
					<EditBookDialog
						book={editingBook}
						navList={editNavList}
						allBooks={books}
						onClose={() => {
							setEditingBook(null);
							setEditNavList([]);
						}}
						onSave={handleSaveBook}
						onSaveAllComplete={(n) =>
							showToast(`Saved ${n} book${n === 1 ? "" : "s"}`, "success")
						}
					/>
				</ErrorBoundary>
				{fetchingBook && (
					<ErrorBoundary key={fetchingBook.ID}>
						<FetchMetadataDialog
							book={fetchingBook}
							candidates={metadataCandidates}
							error={fetchError}
							onClose={() => {
								setFetchingBook(null);
								setMetadataCandidates(null);
								setFetchError("");
							}}
							onSave={(updated) => {
								handleSaveBook(updated);
							}}
						/>
					</ErrorBoundary>
				)}
				{settingsOpen && (
					<SettingsDialog onClose={() => setSettingsOpen(false)} />
				)}
			</div>
		</DeviceProvider>
	);
}

export default App;
