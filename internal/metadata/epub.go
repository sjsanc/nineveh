package metadata

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"strings"
)

type epubParser struct{}

func NewEPUBParser() Parser {
	return &epubParser{}
}

func (p *epubParser) Parse(filePath string) (*Book, error) {
	r, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("open epub: %w", err)
	}
	defer r.Close()

	opfPath, err := findOPFPath(r)
	if err != nil {
		return nil, err
	}

	opf, err := parseOPF(r, opfPath)
	if err != nil {
		return nil, err
	}

	book := opf.toBook()

	cover, err := extractCover(r, opfPath, opf)
	if err == nil {
		book.CoverData = cover
	}

	return book, nil
}

// --- container.xml ---

type xmlContainer struct {
	Rootfiles []xmlRootFile `xml:"rootfiles>rootfile"`
}

type xmlRootFile struct {
	FullPath  string `xml:"full-path,attr"`
	MediaType string `xml:"media-type,attr"`
}

func findOPFPath(r *zip.ReadCloser) (string, error) {
	f := findFile(r, "META-INF/container.xml")
	if f == nil {
		return "", fmt.Errorf("missing META-INF/container.xml")
	}
	rc, err := f.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()

	var c xmlContainer
	if err := xml.NewDecoder(rc).Decode(&c); err != nil {
		return "", fmt.Errorf("parse container.xml: %w", err)
	}
	for _, rf := range c.Rootfiles {
		if rf.MediaType == "application/oebps-package+xml" {
			return rf.FullPath, nil
		}
	}
	return "", fmt.Errorf("no OPF rootfile found")
}

// --- OPF ---

func parseOPF(r *zip.ReadCloser, opfPath string) (*xmlPackage, error) {
	f := findFile(r, opfPath)
	if f == nil {
		return nil, fmt.Errorf("OPF file not found: %s", opfPath)
	}
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	var pkg xmlPackage
	if err := xml.NewDecoder(rc).Decode(&pkg); err != nil {
		return nil, fmt.Errorf("parse OPF: %w", err)
	}
	return &pkg, nil
}

// --- cover ---

func extractCover(r *zip.ReadCloser, opfPath string, pkg *xmlPackage) ([]byte, error) {
	opfDir := path.Dir(opfPath)

	coverID := ""
	for _, meta := range pkg.Metadata.Metas {
		if meta.Name == "cover" {
			coverID = meta.Content
			break
		}
	}

	for _, item := range pkg.Manifest.Items {
		isCover := (item.ID == coverID) ||
			strings.Contains(item.Properties, "cover-image") ||
			(coverID == "" && strings.Contains(item.MediaType, "image") && strings.Contains(strings.ToLower(item.ID), "cover"))

		if !isCover {
			continue
		}

		href := path.Join(opfDir, item.Href)
		f := findFile(r, href)
		if f == nil {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		return io.ReadAll(rc)
	}

	return nil, fmt.Errorf("no cover found")
}

// --- helpers ---

func findFile(r *zip.ReadCloser, name string) *zip.File {
	for _, f := range r.File {
		if f.Name == name {
			return f
		}
	}
	return nil
}
