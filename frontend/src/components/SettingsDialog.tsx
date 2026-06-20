import { Callout, InputGroup, Switch } from "@blueprintjs/core";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { prefs } from "../../wailsjs/go/models";
import { usePrefs } from "../prefsContext";
import { FORMAT_COLORS } from "../utils";

const READER_FORMATS = ["epub", "pdf", "mobi", "azw", "azw3"] as const;

const CONFIGURABLE_COLUMNS = [
	{ id: "isRead", label: "Read" },
	{ id: "title", label: "Title" },
	{ id: "authors", label: "Author(s)" },
	{ id: "series", label: "Series" },
	{ id: "tags", label: "Tags" },
	{ id: "rating", label: "Rating" },
	{ id: "datePublished", label: "Published" },
	{ id: "dateAdded", label: "Added" },
] as const;

interface Props {
	onClose: () => void;
}

export function SettingsDialog({ onClose }: Props) {
	const { prefs: appPrefs, updatePrefs } = usePrefs();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [onClose]);

	function setFetchSources(patch: Partial<prefs.FetchSourcePrefs>) {
		updatePrefs(
			new prefs.Preferences({
				...appPrefs,
				fetchSources: new prefs.FetchSourcePrefs({
					...appPrefs.fetchSources,
					...patch,
				}),
			}),
		);
	}

	function setAPIKey(key: string) {
		updatePrefs(new prefs.Preferences({ ...appPrefs, googleBooksApiKey: key }));
	}

	function setReaderApp(format: string, value: string) {
		updatePrefs(
			new prefs.Preferences({
				...appPrefs,
				readerApps: { ...(appPrefs.readerApps ?? {}), [format]: value },
			}),
		);
	}

	function setColumnVisible(colId: string, isVisible: boolean) {
		const currentVisible = appPrefs.columns?.visible ?? [];
		const allIds = CONFIGURABLE_COLUMNS.map((c) => c.id);
		const base =
			currentVisible.length === 0 ? [...allIds] : [...currentVisible];
		const next = isVisible
			? [...new Set([...base, colId])]
			: base.filter((id) => id !== colId);
		updatePrefs(
			new prefs.Preferences({
				...appPrefs,
				columns: new prefs.ColumnPrefs({ ...appPrefs.columns, visible: next }),
			}),
		);
	}

	function isColumnVisible(colId: string): boolean {
		const visible = appPrefs.columns?.visible ?? [];
		return visible.length === 0 || visible.includes(colId);
	}

	const { openLibraryEnabled, googleBooksEnabled } = appPrefs.fetchSources ?? {
		openLibraryEnabled: true,
		googleBooksEnabled: true,
	};
	const apiKey = appPrefs.googleBooksApiKey ?? "";
	const googleBooksActive = googleBooksEnabled && apiKey !== "";

	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Settings"
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div className="bg-zinc-900 rounded-lg shadow-xl w-full max-w-lg border border-zinc-800 flex flex-col">
				{/* Header */}
				<div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex justify-between items-center">
					<h2 className="text-lg font-semibold text-zinc-100">Settings</h2>
					<button
						type="button"
						onMouseDown={onClose}
						className="text-zinc-400 hover:text-zinc-100 text-2xl leading-none"
					>
						×
					</button>
				</div>

				{/* Body */}
				<div className="p-6 space-y-6">
					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
							Columns
						</h3>
						<p className="text-xs text-zinc-500">
							Choose which columns are visible in the library table.
						</p>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1">
							{CONFIGURABLE_COLUMNS.map((col) => (
								<div key={col.id} className="flex items-center justify-between">
									<span className="text-sm text-zinc-200">{col.label}</span>
									<Switch
										checked={isColumnVisible(col.id)}
										onChange={(e) =>
											setColumnVisible(
												col.id,
												(e.target as HTMLInputElement).checked,
											)
										}
										className="mb-0"
									/>
								</div>
							))}
						</div>
					</section>

					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
							Metadata Sources
						</h3>

						{/* Open Library */}
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm font-medium text-zinc-200">
									Open Library
								</p>
							</div>
							<Switch
								checked={openLibraryEnabled}
								onChange={(e) =>
									setFetchSources({
										openLibraryEnabled: (e.target as HTMLInputElement).checked,
									})
								}
								className="mb-0"
							/>
						</div>

						{/* Google Books */}
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-sm font-medium text-zinc-200">
										Google Books
									</p>
								</div>
								<Switch
									checked={googleBooksEnabled}
									onChange={(e) =>
										setFetchSources({
											googleBooksEnabled: (e.target as HTMLInputElement)
												.checked,
										})
									}
									className="mb-0"
								/>
							</div>

							{googleBooksEnabled && (
								<div className="space-y-2">
									<InputGroup
										placeholder="Google Books API key"
										value={apiKey}
										onChange={(e) =>
											setAPIKey((e.target as HTMLInputElement).value)
										}
										type="password"
										fill
									/>
									{googleBooksEnabled && !apiKey && (
										<Callout intent="warning" className="text-xs">
											An API key is required to use Google Books.
										</Callout>
									)}
									{googleBooksActive && (
										<p className="text-xs text-green-500">
											Google Books is active.
										</p>
									)}
								</div>
							)}
						</div>
					</section>

					<section className="space-y-4">
						<h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
							Reader Applications
						</h3>
						<p className="text-xs text-zinc-500">
							Command used to open each format. Leave blank to use xdg-open.
						</p>
						{READER_FORMATS.map((fmt) => (
							<div key={fmt} className="flex items-center gap-3">
								<span
									className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide w-10 text-center ${FORMAT_COLORS[fmt] ?? "bg-zinc-600"} text-white shrink-0`}
								>
									{fmt}
								</span>
								<InputGroup
									placeholder="xdg-open (default)"
									value={appPrefs.readerApps?.[fmt] ?? ""}
									onChange={(e) =>
										setReaderApp(fmt, (e.target as HTMLInputElement).value)
									}
									fill
								/>
							</div>
						))}
					</section>
				</div>

				{/* Footer */}
				<div className="border-t border-zinc-800 px-6 py-4 flex justify-end">
					<button
						type="button"
						onMouseDown={onClose}
						className="px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
