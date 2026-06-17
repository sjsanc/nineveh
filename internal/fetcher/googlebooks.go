package fetcher

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"nineveh/internal/metadata"
)

type googleBooks struct {
	apiKey string
}

func (gb *googleBooks) fetch(ctx context.Context, book *metadata.Book) ([]FetchedMetadata, error) {
	query := ""
	if book.ISBN != "" {
		query = "isbn:" + book.ISBN
	} else {
		parts := []string{}
		if book.Title != "" {
			parts = append(parts, "intitle:"+book.Title)
		}
		if len(book.Authors) > 0 {
			parts = append(parts, "inauthor:"+book.Authors[0])
		}
		query = strings.Join(parts, "+")
	}
	if query == "" {
		return nil, nil
	}

	params := url.Values{}
	params.Set("q", query)
	params.Set("maxResults", "2")
	params.Set("key", gb.apiKey)

	reqURL := "https://www.googleapis.com/books/v1/volumes?" + params.Encode()
	body, err := doGet(ctx, reqURL)
	if err != nil {
		return nil, err
	}

	var resp gbResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("googlebooks: decode response: %w", err)
	}

	var results []FetchedMetadata
	for _, item := range resp.Items {
		results = append(results, gbItemToMeta(item))
	}
	return results, nil
}

type gbResponse struct {
	Items []gbItem `json:"items"`
}

type gbItem struct {
	VolumeInfo gbVolumeInfo `json:"volumeInfo"`
}

type gbVolumeInfo struct {
	Title               string        `json:"title"`
	Authors             []string      `json:"authors"`
	Publisher           string        `json:"publisher"`
	Description         string        `json:"description"`
	Categories          []string      `json:"categories"`
	PublishedDate       string        `json:"publishedDate"`
	Language            string        `json:"language"`
	IndustryIdentifiers []gbIdentifier `json:"industryIdentifiers"`
	ImageLinks          gbImageLinks  `json:"imageLinks"`
	AverageRating       float64       `json:"averageRating"`
}

type gbIdentifier struct {
	Type       string `json:"type"`
	Identifier string `json:"identifier"`
}

type gbImageLinks struct {
	ExtraLarge string `json:"extraLarge"`
	Large      string `json:"large"`
	Medium     string `json:"medium"`
	Small      string `json:"small"`
	Thumbnail  string `json:"thumbnail"`
}

func gbItemToMeta(item gbItem) FetchedMetadata {
	v := item.VolumeInfo

	isbn := ""
	for _, id := range v.IndustryIdentifiers {
		if id.Type == "ISBN_13" {
			isbn = id.Identifier
			break
		}
	}
	if isbn == "" {
		for _, id := range v.IndustryIdentifiers {
			if id.Type == "ISBN_10" {
				isbn = id.Identifier
				break
			}
		}
	}

	coverURL := v.ImageLinks.ExtraLarge
	if coverURL == "" {
		coverURL = v.ImageLinks.Large
	}
	if coverURL == "" {
		coverURL = v.ImageLinks.Medium
	}
	// Google Books thumbnail URLs use http; upgrade to https
	coverURL = strings.Replace(coverURL, "http://", "https://", 1)

	rating := 0
	if v.AverageRating > 0 {
		rating = int(v.AverageRating)
	}

	tags := v.Categories
	if len(tags) > 10 {
		tags = tags[:10]
	}

	datePublished := normaliseDate(v.PublishedDate)

	return FetchedMetadata{
		Source:        "Google Books",
		Title:         v.Title,
		Authors:       v.Authors,
		Publisher:     v.Publisher,
		Description:   v.Description,
		Tags:          tags,
		DatePublished: datePublished,
		Language:      v.Language,
		ISBN:          isbn,
		CoverURL:      coverURL,
		Rating:        rating,
	}
}
