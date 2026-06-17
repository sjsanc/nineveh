export namespace device {
	
	export class DeviceInfo {
	    ID: string;
	    Name: string;
	    FreeSpace: number;
	
	    static createFrom(source: any = {}) {
	        return new DeviceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.FreeSpace = source["FreeSpace"];
	    }
	}

}

export namespace fetcher {
	
	export class FetchedMetadata {
	    Source: string;
	    Title: string;
	    Authors: string[];
	    Publisher: string;
	    Series: string;
	    SeriesIndex: number;
	    Language: string;
	    Description: string;
	    Tags: string[];
	    Rating: number;
	    DatePublished: string;
	    ISBN: string;
	    CoverURL: string;
	
	    static createFrom(source: any = {}) {
	        return new FetchedMetadata(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Source = source["Source"];
	        this.Title = source["Title"];
	        this.Authors = source["Authors"];
	        this.Publisher = source["Publisher"];
	        this.Series = source["Series"];
	        this.SeriesIndex = source["SeriesIndex"];
	        this.Language = source["Language"];
	        this.Description = source["Description"];
	        this.Tags = source["Tags"];
	        this.Rating = source["Rating"];
	        this.DatePublished = source["DatePublished"];
	        this.ISBN = source["ISBN"];
	        this.CoverURL = source["CoverURL"];
	    }
	}

}

export namespace metadata {
	
	export class BookFile {
	    Path: string;
	    Format: string;
	    Size: number;
	    Hash: string;
	    Title: string;
	    Authors: string[];
	
	    static createFrom(source: any = {}) {
	        return new BookFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Path = source["Path"];
	        this.Format = source["Format"];
	        this.Size = source["Size"];
	        this.Hash = source["Hash"];
	        this.Title = source["Title"];
	        this.Authors = source["Authors"];
	    }
	}
	export class Book {
	    ID: number;
	    Title: string;
	    Authors: string[];
	    Publisher: string;
	    Series: string;
	    SeriesIndex: number;
	    Language: string;
	    Description: string;
	    Tags: string[];
	    Rating: number;
	    CoverPath: string;
	    CoverData: number[];
	    DateAdded: string;
	    DatePublished: string;
	    ISBN: string;
	    IsRead: boolean;
	    Formats: BookFile[];
	
	    static createFrom(source: any = {}) {
	        return new Book(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Title = source["Title"];
	        this.Authors = source["Authors"];
	        this.Publisher = source["Publisher"];
	        this.Series = source["Series"];
	        this.SeriesIndex = source["SeriesIndex"];
	        this.Language = source["Language"];
	        this.Description = source["Description"];
	        this.Tags = source["Tags"];
	        this.Rating = source["Rating"];
	        this.CoverPath = source["CoverPath"];
	        this.CoverData = source["CoverData"];
	        this.DateAdded = source["DateAdded"];
	        this.DatePublished = source["DatePublished"];
	        this.ISBN = source["ISBN"];
	        this.IsRead = source["IsRead"];
	        this.Formats = this.convertValues(source["Formats"], BookFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace prefs {
	
	export class ColumnPrefs {
	    visible: string[];
	    widths: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new ColumnPrefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.visible = source["visible"];
	        this.widths = source["widths"];
	    }
	}
	export class FetchSourcePrefs {
	    openLibraryEnabled: boolean;
	    googleBooksEnabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FetchSourcePrefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.openLibraryEnabled = source["openLibraryEnabled"];
	        this.googleBooksEnabled = source["googleBooksEnabled"];
	    }
	}
	export class Preferences {
	    libraryRoot: string;
	    detailsPaneWidth: number;
	    columns: ColumnPrefs;
	    googleBooksApiKey: string;
	    fetchSources: FetchSourcePrefs;
	
	    static createFrom(source: any = {}) {
	        return new Preferences(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.libraryRoot = source["libraryRoot"];
	        this.detailsPaneWidth = source["detailsPaneWidth"];
	        this.columns = this.convertValues(source["columns"], ColumnPrefs);
	        this.googleBooksApiKey = source["googleBooksApiKey"];
	        this.fetchSources = this.convertValues(source["fetchSources"], FetchSourcePrefs);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

