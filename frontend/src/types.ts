import { type fetcher, metadata } from "../wailsjs/go/models";

export type Book = InstanceType<typeof metadata.Book>;
export type BookFile = InstanceType<typeof metadata.BookFile>;
export type FetchedMetadata = InstanceType<typeof fetcher.FetchedMetadata>;
export { metadata };

export type DeviceInfo = { ID: string; Name: string; FreeSpace: number };
