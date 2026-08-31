package fetcher

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"nineveh/internal/metadata"
)

type openLibrary struct {
	baseURL string // overridable in tests; defaults to https://openlibrary.org
}

func (ol *openLibrary) name() string { return "Open Library" }

func (ol *openLibrary) host() string {
	if ol.baseURL != "" {
		return ol.baseURL
	}
	return "https://openlibrary.org"
}

func (ol *openLibrary) fetch(ctx context.Context, book *metadata.Book) ([]FetchedMetadata, error) {
	if book.ISBN != "" {
		candidates, err := ol.fetchByISBN(ctx, book.ISBN)
		if err == nil && len(candidates) > 0 {
			return candidates, nil
		}
	}
	return ol.fetchByTitleAuthor(ctx, book.Title, book.Authors)
}

// --- ISBN lookup via Books API ---

type olBooksResponse map[string]olBookData

type olBookData struct {
	Key         string        `json:"key"` // edition key, e.g. "/books/OL26591039M"
	Title       string        `json:"title"`
	Authors     []olAuthor    `json:"authors"`
	Publishers  []olNamed     `json:"publishers"`
	Subjects    []olNamed     `json:"subjects"`
	PublishDate string        `json:"publish_date"`
	Identifiers olIdentifiers `json:"identifiers"`
	Cover       olCover       `json:"cover"`
}

type olAuthor struct {
	Name string `json:"name"`
}

type olNamed struct {
	Name string `json:"name"`
}

type olIdentifiers struct {
	ISBN13 []string `json:"isbn_13"`
	ISBN10 []string `json:"isbn_10"`
}

type olCover struct {
	Large  string `json:"large"`
	Medium string `json:"medium"`
}

func (ol *openLibrary) fetchByISBN(ctx context.Context, isbn string) ([]FetchedMetadata, error) {
	bibkey := "ISBN:" + isbn
	reqURL := fmt.Sprintf("%s/api/books?bibkeys=%s&format=json&jscmd=data",
		ol.host(), url.QueryEscape(bibkey))

	body, err := doGet(ctx, reqURL)
	if err != nil {
		return nil, err
	}

	var resp olBooksResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("openlibrary: decode response: %w", err)
	}

	data, ok := resp[bibkey]
	if !ok {
		return nil, nil
	}

	m := ol.bookDataToMeta(data, isbn)
	ol.enrichFromEdition(ctx, &m, data.Key)
	return []FetchedMetadata{m}, nil
}

func (ol *openLibrary) bookDataToMeta(d olBookData, isbn string) FetchedMetadata {
	authors := make([]string, 0, len(d.Authors))
	for _, a := range d.Authors {
		if a.Name != "" {
			authors = append(authors, a.Name)
		}
	}

	publisher := ""
	if len(d.Publishers) > 0 {
		publisher = d.Publishers[0].Name
	}

	tags := make([]string, 0, len(d.Subjects))
	for _, s := range d.Subjects {
		if s.Name != "" {
			tags = append(tags, s.Name)
		}
	}
	if len(tags) > 10 {
		tags = tags[:10]
	}

	resolvedISBN := isbn
	if resolvedISBN == "" {
		if len(d.Identifiers.ISBN13) > 0 {
			resolvedISBN = d.Identifiers.ISBN13[0]
		} else if len(d.Identifiers.ISBN10) > 0 {
			resolvedISBN = d.Identifiers.ISBN10[0]
		}
	}

	coverURL := d.Cover.Large
	if coverURL == "" {
		coverURL = d.Cover.Medium
	}

	return FetchedMetadata{
		Source:        "Open Library",
		Title:         d.Title,
		Authors:       authors,
		Publisher:     publisher,
		Tags:          tags,
		DatePublished: normaliseDate(d.PublishDate),
		ISBN:          resolvedISBN,
		CoverURL:      coverURL,
	}
}

// --- Search API ---

type olSearchResponse struct {
	Docs []olSearchDoc `json:"docs"`
}

type olSearchDoc struct {
	Title            string   `json:"title"`
	AuthorName       []string `json:"author_name"`
	Publisher        []string `json:"publisher"`
	Subject          []string `json:"subject"`
	FirstPublishYear int      `json:"first_publish_year"`
	ISBN             []string `json:"isbn"`
	CoverI           int      `json:"cover_i"`
	EditionKey       []string `json:"edition_key"`
}

func (ol *openLibrary) fetchByTitleAuthor(ctx context.Context, title string, authors []string) ([]FetchedMetadata, error) {
	if title == "" && len(authors) == 0 {
		return nil, nil
	}

	params := url.Values{}
	if title != "" {
		params.Set("title", title)
	}
	if len(authors) > 0 {
		params.Set("author", authors[0])
	}
	params.Set("limit", "3")
	params.Set("fields", "title,author_name,publisher,subject,first_publish_year,isbn,cover_i,edition_key")

	reqURL := ol.host() + "/search.json?" + params.Encode()
	body, err := doGet(ctx, reqURL)
	if err != nil {
		return nil, err
	}

	var resp olSearchResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("openlibrary: decode search response: %w", err)
	}

	var results []FetchedMetadata
	for _, doc := range resp.Docs {
		m := ol.searchDocToMeta(doc)
		// search.json's publisher/isbn/date fields are aggregated across every
		// edition of the work, so they rarely match the specific edition found.
		// Fetch that edition's own record to correct them where possible.
		if len(doc.EditionKey) > 0 {
			ol.enrichFromEdition(ctx, &m, "/books/"+doc.EditionKey[0])
		}
		results = append(results, m)
	}
	return results, nil
}

func (ol *openLibrary) searchDocToMeta(d olSearchDoc) FetchedMetadata {
	publisher := ""
	if len(d.Publisher) > 0 {
		publisher = d.Publisher[0]
	}

	tags := d.Subject
	if len(tags) > 10 {
		tags = tags[:10]
	}

	isbn := ""
	if len(d.ISBN) > 0 {
		for _, id := range d.ISBN {
			if len(id) == 13 {
				isbn = id
				break
			}
		}
		if isbn == "" {
			isbn = d.ISBN[0]
		}
	}

	datePublished := ""
	if d.FirstPublishYear > 0 {
		datePublished = fmt.Sprintf("%d-01-01T00:00:00Z", d.FirstPublishYear)
	}

	coverURL := ""
	if d.CoverI > 0 {
		coverURL = fmt.Sprintf("https://covers.openlibrary.org/b/id/%d-L.jpg", d.CoverI)
	}

	return FetchedMetadata{
		Source:        "Open Library",
		Title:         d.Title,
		Authors:       d.AuthorName,
		Publisher:     publisher,
		Tags:          tags,
		DatePublished: datePublished,
		ISBN:          isbn,
		CoverURL:      coverURL,
	}
}

// --- Edition enrichment ---
//
// Neither the ISBN "Books API" nor search.json carry a description or
// language, and search.json's other fields are aggregated across every
// edition of the work. The edition record (/books/{key}.json) has accurate,
// edition-specific data for all of these, at the cost of one extra request.

type olEditionRecord struct {
	Publishers  []string      `json:"publishers"`
	PublishDate string        `json:"publish_date"`
	Languages   []olRef       `json:"languages"`
	Description olDescription `json:"description"`
}

type olRef struct {
	Key string `json:"key"` // e.g. "/languages/eng"
}

// olDescription unmarshals Open Library's description field, which is
// inconsistently either a plain string or a {"type","value"} object.
type olDescription struct {
	Value string
}

func (d *olDescription) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		d.Value = s
		return nil
	}
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(b, &obj); err != nil {
		return nil // unrecognised shape — leave the description empty rather than fail the fetch
	}
	d.Value = obj.Value
	return nil
}

// enrichFromEdition fetches the edition record at editionKey and overlays its
// publisher, date, language and description onto m. It's best-effort: any
// failure leaves m with whatever it already had.
func (ol *openLibrary) enrichFromEdition(ctx context.Context, m *FetchedMetadata, editionKey string) {
	if editionKey == "" {
		return
	}
	body, err := doGet(ctx, ol.host()+editionKey+".json")
	if err != nil {
		return
	}
	var rec olEditionRecord
	if err := json.Unmarshal(body, &rec); err != nil {
		return
	}

	if len(rec.Publishers) > 0 {
		m.Publisher = rec.Publishers[0]
	}
	if date := normaliseDate(rec.PublishDate); date != "" {
		m.DatePublished = date
	}
	if len(rec.Languages) > 0 {
		m.Language = languageCodeFromKey(rec.Languages[0].Key)
	}
	if rec.Description.Value != "" {
		m.Description = rec.Description.Value
	}
}

func languageCodeFromKey(key string) string {
	return strings.TrimPrefix(key, "/languages/")
}

var ordinalSuffixRE = regexp.MustCompile(`(\d+)(st|nd|rd|th)`)

// dateLayouts covers the free-text formats Open Library edition records use
// for publish_date (e.g. "April 10th 2018", "Nov 13, 2019"), tried after
// stripping ordinal suffixes.
var dateLayouts = []string{
	"January 2, 2006",
	"January 2 2006",
	"2 January 2006",
	"January 2006",
	"Jan 2, 2006",
	"Jan 2 2006",
	"2 Jan 2006",
	"Jan 2006",
}

// normaliseDate tries to parse common Open Library date formats and return RFC 3339,
// or returns "" if it can't make sense of the input.
func normaliseDate(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// Year only
	if len(s) == 4 {
		return s + "-01-01T00:00:00Z"
	}
	// Already looks ISO-ish
	if len(s) >= 10 && s[4] == '-' {
		return s[:10] + "T00:00:00Z"
	}
	cleaned := ordinalSuffixRE.ReplaceAllString(s, "$1")
	for _, layout := range dateLayouts {
		if t, err := time.Parse(layout, cleaned); err == nil {
			return t.Format("2006-01-02") + "T00:00:00Z"
		}
	}
	return ""
}

// transientErr marks a failure worth retrying (network hiccup or 5xx), as
// opposed to a definitive answer like 404 that a retry won't change.
type transientErr struct{ error }

func (e *transientErr) Unwrap() error { return e.error }

var retryDelay = 300 * time.Millisecond

// doGet performs a GET, retrying once after retryDelay on a transient failure
// (network error or 5xx) — metadata source APIs occasionally blip and a
// single retry is usually enough to ride that out.
func doGet(ctx context.Context, reqURL string) ([]byte, error) {
	body, err := doGetOnce(ctx, reqURL)
	if err == nil {
		return body, nil
	}
	var te *transientErr
	if !errors.As(err, &te) {
		return nil, err
	}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(retryDelay):
	}
	return doGetOnce(ctx, reqURL)
}

func doGetOnce(ctx context.Context, reqURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "nineveh/1.0 (ebook library manager)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, &transientErr{fmt.Errorf("GET %s: %w", reqURL, err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusInternalServerError {
		return nil, &transientErr{fmt.Errorf("GET %s: status %d", reqURL, resp.StatusCode)}
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", reqURL, resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}
