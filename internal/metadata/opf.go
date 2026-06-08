package metadata

import (
	"encoding/xml"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// OPF XML structure — shared by EPUB parser and Calibre importer.

type xmlPackage struct {
	Metadata xmlMetadata `xml:"metadata"`
	Manifest xmlManifest `xml:"manifest"`
}

type xmlMetadata struct {
	Titles      []string        `xml:"title"`
	Creators    []xmlCreator    `xml:"creator"`
	Publisher   string          `xml:"publisher"`
	Language    string          `xml:"language"`
	Description string          `xml:"description"`
	Subjects    []string        `xml:"subject"`
	Date        string          `xml:"date"`
	Metas       []xmlMeta       `xml:"meta"`
	Identifiers []xmlIdentifier `xml:"identifier"`
}

type xmlIdentifier struct {
	Scheme string `xml:"scheme,attr"`
	Value  string `xml:",chardata"`
}

type xmlCreator struct {
	Value string `xml:",chardata"`
	Role  string `xml:"role,attr"`
}

type xmlMeta struct {
	Name     string `xml:"name,attr"`
	Content  string `xml:"content,attr"`
	Property string `xml:"property,attr"`
	Value    string `xml:",chardata"`
}

type xmlManifest struct {
	Items []xmlItem `xml:"item"`
}

type xmlItem struct {
	ID         string `xml:"id,attr"`
	Href       string `xml:"href,attr"`
	MediaType  string `xml:"media-type,attr"`
	Properties string `xml:"properties,attr"`
}

func (pkg *xmlPackage) toBook() *Book {
	m := pkg.Metadata
	book := &Book{}

	if len(m.Titles) > 0 {
		book.Title = strings.TrimSpace(m.Titles[0])
	}

	for _, c := range m.Creators {
		if name := strings.TrimSpace(c.Value); name != "" {
			book.Authors = append(book.Authors, name)
		}
	}

	book.Publisher = strings.TrimSpace(m.Publisher)
	book.Language = strings.TrimSpace(m.Language)
	book.Description = strings.TrimSpace(m.Description)
	book.Tags = m.Subjects

	if d := strings.TrimSpace(m.Date); d != "" {
		for _, layout := range []string{time.RFC3339, "2006-01-02", "2006"} {
			if t, err := time.Parse(layout, d); err == nil {
				book.DatePublished = t.UTC().Format(time.RFC3339)
				break
			}
		}
	}

	for _, meta := range m.Metas {
		switch meta.Name {
		case "calibre:series":
			book.Series = meta.Content
		case "calibre:series_index":
			if v, err := strconv.ParseFloat(meta.Content, 64); err == nil {
				book.SeriesIndex = v
			}
		case "calibre:rating":
			// Calibre stores ratings 0–10; nineveh uses 0–5
			if v, err := strconv.ParseFloat(meta.Content, 64); err == nil {
				book.Rating = int(v / 2)
			}
		case "calibre:timestamp":
			if t, err := time.Parse(time.RFC3339, meta.Content); err == nil {
				book.DateAdded = t.UTC().Format(time.RFC3339)
			}
		}
		// OPF 3 style
		switch meta.Property {
		case "belongs-to-collection":
			book.Series = strings.TrimSpace(meta.Value)
		case "group-position":
			if v, err := strconv.ParseFloat(strings.TrimSpace(meta.Value), 64); err == nil {
				book.SeriesIndex = v
			}
		}
	}

	for _, id := range m.Identifiers {
		if strings.EqualFold(id.Scheme, "isbn") {
			if v := strings.TrimSpace(id.Value); v != "" {
				book.ISBN = v
				break
			}
		}
	}

	return book
}

// ParseOPFFile parses a standalone OPF XML file on disk into a Book.
func ParseOPFFile(path string) (*Book, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open OPF: %w", err)
	}
	defer f.Close()

	var pkg xmlPackage
	if err := xml.NewDecoder(f).Decode(&pkg); err != nil {
		return nil, fmt.Errorf("parse OPF: %w", err)
	}
	return pkg.toBook(), nil
}
