import DOMPurify from "dompurify";
import { useState } from "react";
import { GetCoverData } from "../../wailsjs/go/main/App";
import { useCoverImage } from "../lib/useCoverImage";
import { useResizablePanel } from "../lib/useResizablePanel";
import type { Book } from "../types";
import {
	FORMAT_COLORS,
	formatDate,
	formatDescription,
	formatSize,
} from "../utils";
import { CoverLightbox } from "./CoverLightbox";
import { Rating } from "./Rating";

interface Props {
	book: Book;
	width: number;
	onWidthChange: (w: number) => void;
	onOpenBook?: (bookId: number, format: string) => void;
	onAppendFilter?: (field: string, value: string) => void;
}

export function BookPanel({
	book,
	width,
	onWidthChange,
	onOpenBook,
	onAppendFilter,
}: Props) {
	const handleDragMouseDown = useResizablePanel(width, onWidthChange);
	const coverSrc = useCoverImage(book.CoverPath || undefined, GetCoverData);
	const [lightboxOpen, setLightboxOpen] = useState(false);

	return (
		<div
			className="shrink-0 h-full border-l border-zinc-800 bg-zinc-950 overflow-y-auto relative"
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
						<button
							type="button"
							className="w-full h-full cursor-zoom-in"
							onClick={() => setLightboxOpen(true)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") setLightboxOpen(true);
							}}
						>
							<img
								src={coverSrc}
								alt={book.Title}
								className="w-full h-full object-cover"
							/>
						</button>
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

			{/* Title / authors / series / rating */}
			<div className="flex flex-col gap-1 px-4 py-3 border-b border-zinc-800 shrink-0">
				<h2 className="text-sm font-semibold text-zinc-100 leading-snug">
					{book.Title}
				</h2>
				{book.Authors?.length > 0 && (
					<p className="text-xs text-zinc-400">
						{book.Authors.map((a, i) => (
							<span key={a}>
								{i > 0 && ", "}
								{onAppendFilter ? (
									<button
										type="button"
										className="cursor-pointer hover:text-zinc-200 hover:underline"
										onClick={() => onAppendFilter("author", a)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ")
												onAppendFilter("author", a);
										}}
									>
										{a}
									</button>
								) : (
									a
								)}
							</span>
						))}
					</p>
				)}
				{book.Series && (
					<p className="text-xs text-zinc-500">
						{onAppendFilter ? (
							<button
								type="button"
								className="cursor-pointer hover:text-zinc-300 hover:underline"
								onClick={() => onAppendFilter("series", book.Series ?? "")}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ")
										onAppendFilter("series", book.Series ?? "");
								}}
							>
								{book.Series}
							</button>
						) : (
							book.Series
						)}
						{book.SeriesIndex > 0 && (
							<span className="text-zinc-600"> #{book.SeriesIndex}</span>
						)}
					</p>
				)}
				<Rating value={book.Rating} size="sm" className="mt-0.5" />
			</div>

			{/* Metadata */}
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
							<dd className="text-zinc-300">
								{onAppendFilter ? (
									<button
										type="button"
										className="cursor-pointer hover:text-zinc-100 hover:underline"
										onClick={() => onAppendFilter("lang", book.Language ?? "")}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ")
												onAppendFilter("lang", book.Language ?? "");
										}}
									>
										{book.Language}
									</button>
								) : (
									book.Language
								)}
							</dd>
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
							<dd className="text-zinc-300">{formatDate(book.DateAdded)}</dd>
						</div>
					)}
					{book.ISBN && (
						<div className="flex gap-2">
							<dt className="text-zinc-500 w-16 shrink-0">ISBN</dt>
							<dd className="text-zinc-300 font-mono">{book.ISBN}</dd>
						</div>
					)}
				</dl>
			</div>

			{/* Tags */}
			{book.Tags?.length > 0 && (
				<div className="flex flex-wrap gap-1 px-4 py-3 border-b border-zinc-800 shrink-0">
					{book.Tags.map((t) => (
						<button
							type="button"
							key={t}
							onClick={() => onAppendFilter?.("tag", t)}
							className={`text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 ${onAppendFilter ? "hover:bg-zinc-600 hover:text-zinc-100 cursor-pointer transition-colors" : "cursor-default"}`}
						>
							{t}
						</button>
					))}
				</div>
			)}

			{/* Formats */}
			{book.Formats?.length > 0 && (
				<div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-zinc-800 shrink-0">
					{book.Formats.map((f) => (
						<button
							type="button"
							key={f.Format}
							className="flex items-center gap-1 group cursor-pointer"
							title="Open in reader"
							onClick={() => onOpenBook?.(book.ID as number, f.Format)}
						>
							<span
								className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-mono tracking-wide ${FORMAT_COLORS[f.Format] ?? "bg-zinc-600"} text-white group-hover:opacity-80 transition-opacity`}
							>
								{f.Format}
							</span>
							<span className="text-[10px] text-zinc-500">
								{formatSize(f.Size)}
							</span>
						</button>
					))}
				</div>
			)}

			{/* Description */}
			{book.Description && (
				<div className="px-4 py-3">
					<div
						className="prose prose-invert prose-sm max-w-none text-zinc-400 text-[14px] leading-tight [&_p]:my-0.5 [&_p]:leading-tight [&_ul]:my-1 [&_li]:my-0"
						dangerouslySetInnerHTML={{
							__html: DOMPurify.sanitize(formatDescription(book.Description)),
						}}
					/>
				</div>
			)}
			{lightboxOpen && coverSrc && (
				<CoverLightbox
					src={coverSrc}
					alt={book.Title}
					onClose={() => setLightboxOpen(false)}
				/>
			)}
		</div>
	);
}
