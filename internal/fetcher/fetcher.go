package fetcher

import (
	"context"
	"strings"

	"nineveh/internal/metadata"
)

type FetchedMetadata struct {
	Source        string   `json:"Source"`
	Title         string   `json:"Title"`
	Authors       []string `json:"Authors"`
	Publisher     string   `json:"Publisher"`
	Series        string   `json:"Series"`
	SeriesIndex   float64  `json:"SeriesIndex"`
	Language      string   `json:"Language"`
	Description   string   `json:"Description"`
	Tags          []string `json:"Tags"`
	Rating        int      `json:"Rating"`
	DatePublished string   `json:"DatePublished"`
	ISBN          string   `json:"ISBN"`
	CoverURL      string   `json:"CoverURL"`
}

type Config struct {
	GoogleBooksAPIKey  string
	OpenLibraryEnabled bool
	GoogleBooksEnabled bool
}

type source interface {
	fetch(ctx context.Context, book *metadata.Book) ([]FetchedMetadata, error)
}

// FetchCandidates queries all enabled sources and returns up to 5 candidates.
func FetchCandidates(ctx context.Context, book *metadata.Book, cfg Config) ([]FetchedMetadata, error) {
	var sources []source
	if cfg.OpenLibraryEnabled {
		sources = append(sources, &openLibrary{})
	}
	if cfg.GoogleBooksEnabled && cfg.GoogleBooksAPIKey != "" {
		sources = append(sources, &googleBooks{apiKey: cfg.GoogleBooksAPIKey})
	}

	var results []FetchedMetadata
	for _, s := range sources {
		candidates, err := s.fetch(ctx, book)
		if err != nil {
			continue
		}
		results = append(results, candidates...)
		if len(results) >= 5 {
			break
		}
	}
	return results, nil
}

func joinAuthors(authors []string) string {
	return strings.Join(authors, ", ")
}
