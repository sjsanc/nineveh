import { type fetcher, type library, metadata } from "../wailsjs/go/models";

export type Book = InstanceType<typeof metadata.Book>;
export type BookFile = InstanceType<typeof metadata.BookFile>;
export type FetchedMetadata = InstanceType<typeof fetcher.FetchedMetadata>;
export type AddOutcome = InstanceType<typeof library.AddOutcome>;
export type FormatConflict = InstanceType<typeof library.FormatConflict>;
export { metadata };

export type DeviceInfo = { ID: string; Name: string; FreeSpace: number };

// Mirrors the Go library.ConflictAction string constants (internal/library/library.go).
export type ConflictAction = "keep_existing" | "replace" | "keep_both";
