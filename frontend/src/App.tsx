import { Callout } from "@blueprintjs/core";
import { useState } from "react";
import { prefs } from "../wailsjs/go/models";
import { BookPanel } from "./components/BookPanel";
import { BookTable } from "./components/BookTable";
import { ConflictReviewDialog } from "./components/ConflictReviewDialog";
import { DevicePanel } from "./components/DevicePanel";
import { DeviceTable } from "./components/DeviceTable";
import { EditBookDialog } from "./components/EditBookDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FetchMetadataDialog } from "./components/FetchMetadataDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { SubSidebar } from "./components/SubSidebar";
import { DeviceProvider } from "./contexts/deviceContext";
import { usePrefs } from "./contexts/prefsContext";
import { useDevices } from "./lib/useDevices";
import { useLibrary } from "./lib/useLibrary";
import { useResolvedTheme } from "./lib/useTheme";
import { useToaster } from "./lib/useToaster";

function App() {
	const { prefs: appPrefs, updatePrefs } = usePrefs();
	useResolvedTheme(
		appPrefs.theme === "light" || appPrefs.theme === "dark"
			? appPrefs.theme
			: "system",
	);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const toaster = useToaster();
	const device = useDevices(toaster);
	const library = useLibrary(toaster);

	return (
		<DeviceProvider
			value={{
				devices: device.devices,
				activeDeviceID: device.activeDeviceID,
				deviceLetterMap: device.deviceLetterMap,
				deviceBooks: device.deviceBooks,
			}}
		>
			<div className="h-screen w-screen flex bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
				<Sidebar
					isLibraryActive={device.activeSection === "library"}
					isDevicesActive={device.activeSection === "devices"}
					hasDevices={device.devices.length > 0}
					onSelectLibrary={device.selectLibrarySection}
					onSelectDevices={device.selectDevicesSection}
					onRescan={device.rescanDevices}
					onSettingsOpen={() => setSettingsOpen(true)}
				/>
				<SubSidebar
					activeSection={device.activeSection}
					onImport={library.handleImportFromCalibre}
					onAdd={library.handleAddBooks}
					onReload={library.reload}
					onReset={library.handleResetLibrary}
					onSelectDevice={device.selectDevice}
					isLoadingDeviceBooks={device.isLoadingDeviceBooks}
				/>
				<div className="flex-1 flex flex-col overflow-hidden">
					<main className="flex-1 overflow-hidden flex flex-col">
						<ErrorBoundary key={device.activeSection}>
							{device.activeSection === "devices" ? (
								<div className="flex-1 overflow-hidden flex flex-row">
									<DeviceTable
										data={device.deviceBooks}
										books={library.books}
										device={device.activeDevice ?? undefined}
										isLoading={device.isLoadingDeviceBooks}
										onRemoveFromDevice={device.removeFromDevice}
										onAddFromDevice={library.addBooksFromDevice}
										onSelectFile={device.setSelectedDeviceFile}
										onEject={
											device.activeDeviceID
												? () =>
														device.ejectDevice(device.activeDeviceID as string)
												: undefined
										}
									/>
									{device.selectedDeviceFile && (
										<DevicePanel
											key={device.selectedDeviceFile.Path}
											file={device.selectedDeviceFile}
											books={library.books}
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
								<div className="flex-1 overflow-hidden flex flex-col">
									{library.showMissingCallout && (
										<Callout
											intent="warning"
											className="mx-3 mt-2 mb-2 text-xs shrink-0 relative border-b border-zinc-300 dark:border-zinc-700"
										>
											<span>
												{library.missingCount} book
												{library.missingCount === 1 ? "" : "s"} have missing
												files. If you moved your library,{" "}
												<button
													type="button"
													className="underline cursor-pointer font-medium"
													onClick={library.handleRelocateLibrary}
												>
													relocate library
												</button>{" "}
												to fix all paths at once.
											</span>
											<button
												type="button"
												className="absolute top-2 right-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 text-lg leading-none"
												onClick={() => library.setMissingCalloutDismissed(true)}
												aria-label="Dismiss"
											>
												×
											</button>
										</Callout>
									)}
									<div className="flex-1 overflow-hidden flex flex-row">
										<BookTable
											data={library.books}
											selectedBookId={library.selectedBook?.ID}
											selectedBookIds={library.selectedBookIds}
											onSelectBook={library.setSelectedBook}
											onSelectionChange={library.handleSelectionChange}
											onDoubleClickBook={(book) => {
												if (appPrefs.doubleClickAction === "metadata") {
													library.handleEditBook(book, library.books);
												} else {
													const available = book.Formats?.filter(
														(f) => !f.Missing,
													);
													if (available?.length) {
														library.handleOpenBook(
															book.ID as number,
															available[0].Format,
														);
													} else {
														toaster.showToast("No file to open", "warning");
													}
												}
											}}
											onSendToDevice={library.sendToDevice}
											onEditBook={library.handleEditBook}
											onFetchMetadata={library.handleFetchMetadata}
											onToggleRead={library.handleToggleRead}
											onRemoveBooks={library.handleRemoveBooks}
											onOpenBook={library.handleOpenBook}
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
											searchQuery={library.searchQuery}
											onSearchQueryChange={library.setSearchQuery}
										/>
										{library.selectedBook && (
											<BookPanel
												key={library.selectedBook.ID}
												book={library.selectedBook}
												width={appPrefs.detailsPaneWidth || 288}
												onWidthChange={(w) =>
													updatePrefs(
														new prefs.Preferences({
															...appPrefs,
															detailsPaneWidth: w,
														}),
													)
												}
												onOpenBook={library.handleOpenBook}
												onAppendFilter={library.handleAppendFilter}
												onLocateFormat={library.handleLocateFormat}
												onRemoveFormat={library.handleRemoveFormat}
											/>
										)}
									</div>
								</div>
							)}
						</ErrorBoundary>
					</main>
				</div>
				<ErrorBoundary key={library.editingBook?.ID ?? "no-edit"}>
					<EditBookDialog
						book={library.editingBook}
						navList={library.editNavList}
						allBooks={library.books}
						onClose={library.closeEditDialog}
						onSave={library.handleSaveBook}
						onSaveAllComplete={(n) =>
							toaster.showToast(
								`Saved ${n} book${n === 1 ? "" : "s"}`,
								"success",
							)
						}
					/>
				</ErrorBoundary>
				{library.fetchingBook && (
					<ErrorBoundary key={library.fetchingBook.ID}>
						<FetchMetadataDialog
							book={library.fetchingBook}
							candidates={library.metadataCandidates}
							error={library.fetchError}
							onClose={library.closeFetchDialog}
							onSave={(updated) => {
								library.handleSaveBook(updated);
							}}
						/>
					</ErrorBoundary>
				)}
				<ErrorBoundary
					key={library.pendingConflicts.length > 0 ? "review" : "no-conflicts"}
				>
					<ConflictReviewDialog
						conflicts={library.pendingConflicts}
						onSubmit={library.reviewConflicts}
						onCancel={library.dismissConflictReview}
					/>
				</ErrorBoundary>
				{settingsOpen && (
					<SettingsDialog
						onClose={() => setSettingsOpen(false)}
						onRelocateLibrary={library.handleRelocateLibrary}
					/>
				)}
			</div>
		</DeviceProvider>
	);
}

export default App;
