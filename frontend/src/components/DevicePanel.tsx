import { Icon } from "@blueprintjs/core";
import DOMPurify from "dompurify";
import { useMemo } from "react";
import { GetCoverData, GetDeviceFileCover } from "../../wailsjs/go/main/App";
import { useCoverImage } from "../lib/useCoverImage";
import { useResizablePanel } from "../lib/useResizablePanel";
import type { Book, BookFile } from "../types";
import {
	buildIndex,
	FORMAT_COLORS,
	formatDate,
	formatSize,
	matchBook,
	stemOf,
} from "../utils";
import { Rating } from "./Rating";

interface Props {
	file: BookFile;
	books: Book[];
	width: number;
	onWidthChange: (w: number) => void;
}

export function DevicePanel({ file, books, width, onWidthChange }: Props) {
	const handleDragMouseDown = useResizablePanel(width, onWidthChange);

	const index = useMemo(() => buildIndex(books), [books]);
	const book = matchBook(file, index);

	// Library-matched files use the library cover; unmatched files fall back to
	// a cover extracted directly from the device file.
	const coverPath = book?.CoverPath || (!book ? file.Path : undefined);
	const coverFetcher = book?.CoverPath ? GetCoverData : GetDeviceFileCover;
	const coverSrc = useCoverImage(coverPath, coverFetcher);

	const filename = file.Path.split("/").pop() ?? file.Path;

	return (
		<div
			className="shrink-0 h-full border-l border-zinc-800 bg-zinc-950 flex flex-col overflow-y-auto relative"
			style={{ width }}
		>
			<div
				aria-hidden="true"
				className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-zinc-600 active:bg-zinc-500 transition-colors z-10"
				onMouseDown={handleDragMouseDown}
			/>
			{/* Cover */}
			<div className="border-b border-zinc-800 shrink-0">
				<div className="w-full aspect-[2/3] bg-zinc-800 overflow-hidden flex items-center justify-center">
					{coverSrc ? (
						<img
							src={coverSrc}
							alt={book?.Title ?? filename}
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="flex flex-col items-center justify-center text-zinc-600 w-full h-full">
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 18H6V4h2v8l2.5-1.5L13 12V4h5v16z" />
							</svg>
						</div>
					)}
				</div>
			</div>

			{/* Title / authors */}
			<div className="flex flex-col gap-1 px-4 py-3 border-b border-zinc-800 shrink-0">
				<h2 className="text-sm font-semibold text-zinc-100 leading-snug">
					{book?.Title ?? (file.Title || stemOf(file.Path))}
				</h2>
				{(() => {
					const authors = book?.Authors ?? file.Authors;
					return authors && authors.length > 0 ? (
						<p className="text-xs text-zinc-400">{authors.join(", ")}</p>
					) : null;
				})()}
				{book?.Series && (
					<p className="text-xs text-zinc-500">
						{book.Series}
						{book.SeriesIndex > 0 && (
							<span className="text-zinc-600"> #{book.SeriesIndex}</span>
						)}
					</p>
				)}
				{(book?.Rating ?? 0) > 0 && (
					<Rating value={book?.Rating ?? 0} size="sm" className="mt-0.5" />
				)}
			</div>

			{/* Device file info */}
			<div className="px-4 py-3 border-b border-zinc-800 shrink-0">
				<dl className="flex flex-col gap-1.5 text-xs">
					<div className="flex gap-2 items-center">
						<dt className="text-zinc-500 w-16 shrink-0">Format</dt>
						<dd>
							<span
								className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide ${FORMAT_COLORS[file.Format] ?? "bg-zinc-600"} text-white`}
							>
								{file.Format}
							</span>
						</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-zinc-500 w-16 shrink-0">Size</dt>
						<dd className="text-zinc-300">{formatSize(file.Size)}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-zinc-500 w-16 shrink-0">In library</dt>
						<dd className="text-zinc-300">
							{book ? (
								<Icon
									icon="tick-circle"
									size={14}
									className="text-emerald-500"
								/>
							) : (
								<span className="text-zinc-600">—</span>
							)}
						</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-zinc-500 w-16 shrink-0">Path</dt>
						<dd className="text-zinc-400 min-w-0 break-all">{file.Path}</dd>
					</div>
				</dl>
			</div>

			{/* Library metadata (only when matched) */}
			{book && (
				<>
					{(book.Publisher ||
						book.Language ||
						book.DatePublished ||
						book.DateAdded) && (
						<div className="px-4 py-3 border-b border-zinc-800 shrink-0">
							<dl className="flex flex-col gap-1.5 text-xs">
								{book.Publisher && (
									<div className="flex gap-2">
										<dt className="text-zinc-500 w-16 shrink-0">Publisher</dt>
										<dd className="text-zinc-300 min-w-0 break-words">
											{book.Publisher}
										</dd>
									</div>
								)}
								{book.Language && (
									<div className="flex gap-2">
										<dt className="text-zinc-500 w-16 shrink-0">Language</dt>
										<dd className="text-zinc-300">{book.Language}</dd>
									</div>
								)}
								{book.DatePublished && (
									<div className="flex gap-2">
										<dt className="text-zinc-500 w-16 shrink-0">Published</dt>
										<dd className="text-zinc-300">
											{formatDate(book.DatePublished)}
										</dd>
									</div>
								)}
								{book.DateAdded && (
									<div className="flex gap-2">
										<dt className="text-zinc-500 w-16 shrink-0">Added</dt>
										<dd className="text-zinc-300">
											{formatDate(book.DateAdded)}
										</dd>
									</div>
								)}
							</dl>
						</div>
					)}

					{book.Tags?.length > 0 && (
						<div className="flex flex-wrap gap-1 px-4 py-3 border-b border-zinc-800 shrink-0">
							{book.Tags.map((t) => (
								<span
									key={t}
									className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300"
								>
									{t}
								</span>
							))}
						</div>
					)}

					{book.Description && (
						<div className="px-4 py-3 flex-1 overflow-y-auto">
							<div
								className="prose prose-invert prose-sm max-w-none text-zinc-400 text-[14px] leading-tight [&_p]:my-0.5 [&_p]:leading-tight"
								dangerouslySetInnerHTML={{
									__html: DOMPurify.sanitize(book.Description),
								}}
							/>
						</div>
					)}
				</>
			)}
		</div>
	);
}
