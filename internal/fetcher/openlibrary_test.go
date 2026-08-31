package fetcher

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"nineveh/internal/metadata"
)

func TestNormaliseDate(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"2003", "2003-01-01T00:00:00Z"},
		{"2003-06", ""}, // YYYY-MM not handled by normaliseDate
		{"2003-06-15", "2003-06-15T00:00:00Z"},
		{"", ""},
		{"garbage", ""},
		{"April 10th 2018", "2018-04-10T00:00:00Z"},
		{"April 10, 2018", "2018-04-10T00:00:00Z"},
		{"10 April 2018", "2018-04-10T00:00:00Z"},
		{"April 2018", "2018-04-01T00:00:00Z"},
		{"Nov 13, 2019", "2019-11-13T00:00:00Z"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			assert.Equal(t, tc.want, normaliseDate(tc.in))
		})
	}
}

func TestBookDataToMeta_TagsCappedAt10(t *testing.T) {
	subjects := make([]olNamed, 15)
	for i := range subjects {
		subjects[i] = olNamed{Name: "tag"}
	}
	ol := &openLibrary{}
	m := ol.bookDataToMeta(olBookData{Subjects: subjects}, "")
	assert.Len(t, m.Tags, 10)
}

func TestBookDataToMeta_CoverFallback(t *testing.T) {
	ol := &openLibrary{}

	// Large cover preferred
	m := ol.bookDataToMeta(olBookData{Cover: olCover{Large: "http://large", Medium: "http://medium"}}, "")
	assert.Equal(t, "http://large", m.CoverURL)

	// Falls back to medium when large is absent
	m = ol.bookDataToMeta(olBookData{Cover: olCover{Medium: "http://medium"}}, "")
	assert.Equal(t, "http://medium", m.CoverURL)
}

func TestSearchDocToMeta_PrefersISBN13(t *testing.T) {
	ol := &openLibrary{}
	doc := olSearchDoc{
		Title:  "Test",
		ISBN:   []string{"0123456789", "9780123456789"},
		CoverI: 42,
	}
	m := ol.searchDocToMeta(doc)
	assert.Equal(t, "9780123456789", m.ISBN)
	assert.Contains(t, m.CoverURL, "42")
}

func TestFetchByISBN(t *testing.T) {
	isbn := "9780000000001"
	bibkey := "ISBN:" + isbn

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Contains(t, r.URL.Path, "/api/books")
		resp := olBooksResponse{
			bibkey: {
				Title:   "Mocked Book",
				Authors: []olAuthor{{Name: "Mock Author"}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ol := &openLibrary{baseURL: srv.URL}
	book := &metadata.Book{ISBN: isbn}
	results, err := ol.fetch(context.Background(), book)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "Mocked Book", results[0].Title)
	assert.Equal(t, []string{"Mock Author"}, results[0].Authors)
}

func TestFetch_ISBNLookupEmptyFallsThrough(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/api/books") {
			// ISBN lookup returns an empty object — no match.
			w.Write([]byte("{}"))
			return
		}
		// Title/author search fallback.
		resp := olSearchResponse{
			Docs: []olSearchDoc{{Title: "Fallback Result", AuthorName: []string{"Fallback Author"}}},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ol := &openLibrary{baseURL: srv.URL}
	book := &metadata.Book{ISBN: "9780000000002", Title: "Some Title", Authors: []string{"Some Author"}}
	results, err := ol.fetch(context.Background(), book)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "Fallback Result", results[0].Title)
}

func TestFetchByTitleAuthor(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Contains(t, r.URL.Path, "/search.json")
		resp := olSearchResponse{
			Docs: []olSearchDoc{
				{Title: "Found Book", AuthorName: []string{"Found Author"}, FirstPublishYear: 1999},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ol := &openLibrary{baseURL: srv.URL}
	// No ISBN → falls through to title/author search
	book := &metadata.Book{Title: "Some Title", Authors: []string{"Some Author"}}
	results, err := ol.fetch(context.Background(), book)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "Found Book", results[0].Title)
	assert.Equal(t, "1999-01-01T00:00:00Z", results[0].DatePublished)
}

func TestLanguageCodeFromKey(t *testing.T) {
	assert.Equal(t, "eng", languageCodeFromKey("/languages/eng"))
	assert.Equal(t, "", languageCodeFromKey(""))
}

func TestOlDescription_HandlesStringAndObjectShapes(t *testing.T) {
	var d olDescription
	require.NoError(t, json.Unmarshal([]byte(`"plain text"`), &d))
	assert.Equal(t, "plain text", d.Value)

	d = olDescription{}
	require.NoError(t, json.Unmarshal([]byte(`{"type":"/type/text","value":"wrapped text"}`), &d))
	assert.Equal(t, "wrapped text", d.Value)
}

func TestFetchByISBN_EnrichesFromEditionRecord(t *testing.T) {
	isbn := "9780000000003"
	bibkey := "ISBN:" + isbn

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/api/books"):
			resp := olBooksResponse{
				bibkey: {
					Key:     "/books/OL123M",
					Title:   "Mocked Book",
					Authors: []olAuthor{{Name: "Mock Author"}},
					// search-level publisher is deliberately wrong/absent to prove
					// the edition record overrides it.
				},
			}
			json.NewEncoder(w).Encode(resp)
		case r.URL.Path == "/books/OL123M.json":
			json.NewEncoder(w).Encode(olEditionRecord{
				Publishers:  []string{"Real Publisher"},
				PublishDate: "April 10th 2018",
				Languages:   []olRef{{Key: "/languages/eng"}},
				Description: olDescription{Value: "A real description."},
			})
		default:
			t.Fatalf("unexpected request: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	ol := &openLibrary{baseURL: srv.URL}
	results, err := ol.fetch(context.Background(), &metadata.Book{ISBN: isbn})
	require.NoError(t, err)
	require.Len(t, results, 1)

	m := results[0]
	assert.Equal(t, "Real Publisher", m.Publisher)
	assert.Equal(t, "2018-04-10T00:00:00Z", m.DatePublished)
	assert.Equal(t, "eng", m.Language)
	assert.Equal(t, "A real description.", m.Description)
}

func TestFetchByTitleAuthor_EnrichesFromEditionKey(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/search.json"):
			resp := olSearchResponse{
				Docs: []olSearchDoc{
					{
						Title:            "Circe",
						AuthorName:       []string{"Madeline Miller"},
						Publisher:        []string{"BLOOMSBURY"}, // wrong edition, aggregated across the work
						FirstPublishYear: 2018,
						EditionKey:       []string{"OL26591039M"},
					},
				},
			}
			json.NewEncoder(w).Encode(resp)
		case r.URL.Path == "/books/OL26591039M.json":
			json.NewEncoder(w).Encode(olEditionRecord{
				Publishers:  []string{"Alianza Editorial"},
				PublishDate: "2019-02-27",
				Languages:   []olRef{{Key: "/languages/spa"}},
				Description: olDescription{Value: "En la casa de Helios..."},
			})
		default:
			t.Fatalf("unexpected request: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	ol := &openLibrary{baseURL: srv.URL}
	book := &metadata.Book{Title: "Circe", Authors: []string{"Madeline Miller"}}
	results, err := ol.fetch(context.Background(), book)
	require.NoError(t, err)
	require.Len(t, results, 1)

	m := results[0]
	assert.Equal(t, "Alianza Editorial", m.Publisher)
	assert.Equal(t, "2019-02-27T00:00:00Z", m.DatePublished)
	assert.Equal(t, "spa", m.Language)
	assert.Equal(t, "En la casa de Helios...", m.Description)
}

func TestFetchByTitleAuthor_MissingEditionKeyFallsBackToSearchDoc(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Contains(t, r.URL.Path, "/search.json")
		resp := olSearchResponse{
			Docs: []olSearchDoc{
				{Title: "Found Book", AuthorName: []string{"Found Author"}, Publisher: []string{"Fallback Publisher"}},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	ol := &openLibrary{baseURL: srv.URL}
	book := &metadata.Book{Title: "Some Title", Authors: []string{"Some Author"}}
	results, err := ol.fetch(context.Background(), book)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, "Fallback Publisher", results[0].Publisher)
	assert.Equal(t, "", results[0].Language)
	assert.Equal(t, "", results[0].Description)
}

func TestDoGet_RetriesOnceOnTransientFailure(t *testing.T) {
	var attempts int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ok"))
	}))
	defer srv.Close()

	origDelay := retryDelay
	retryDelay = time.Millisecond
	defer func() { retryDelay = origDelay }()

	body, err := doGet(context.Background(), srv.URL)
	require.NoError(t, err)
	assert.Equal(t, "ok", string(body))
	assert.Equal(t, 2, attempts)
}

func TestDoGet_DoesNotRetryOnClientError(t *testing.T) {
	var attempts int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := doGet(context.Background(), srv.URL)
	require.Error(t, err)
	assert.Equal(t, 1, attempts)
}
