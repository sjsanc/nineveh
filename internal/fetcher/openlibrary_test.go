package fetcher

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
		Title:      "Test",
		ISBN:       []string{"0123456789", "9780123456789"},
		CoverI:     42,
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
