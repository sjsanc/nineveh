package metadata

import (
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"strings"
)

type mobiParser struct{}

func NewMOBIParser() Parser {
	return &mobiParser{}
}

func (p *mobiParser) Parse(filePath string) (*Book, error) {
	return parseMobiFile(filePath)
}

// parseMobiFile is the shared core for both MOBI and AZW3 (same container format).
func parseMobiFile(filePath string) (*Book, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("open mobi: %w", err)
	}
	defer f.Close()

	// PalmDB database name: bytes 0-31, null-padded.
	palmName := make([]byte, 32)
	if _, err := io.ReadFull(f, palmName); err != nil {
		return nil, fmt.Errorf("read palm name: %w", err)
	}
	palmTitle := strings.TrimRight(string(palmName), "\x00")

	// Number of records at offset 76 (uint16 big-endian).
	if _, err := f.Seek(76, io.SeekStart); err != nil {
		return nil, fmt.Errorf("seek numRecords: %w", err)
	}
	var numRecords uint16
	if err := binary.Read(f, binary.BigEndian, &numRecords); err != nil {
		return nil, fmt.Errorf("read numRecords: %w", err)
	}
	if numRecords == 0 {
		return &Book{Title: palmTitle}, nil
	}

	// Record list starts at offset 78: each entry is [offset uint32][attrs uint32].
	recordOffsets := make([]int64, numRecords)
	for i := range recordOffsets {
		var offset uint32
		var attrs uint32
		if err := binary.Read(f, binary.BigEndian, &offset); err != nil {
			return nil, fmt.Errorf("read record offset %d: %w", i, err)
		}
		if err := binary.Read(f, binary.BigEndian, &attrs); err != nil {
			return nil, fmt.Errorf("read record attrs %d: %w", i, err)
		}
		recordOffsets[i] = int64(offset)
	}

	// Record 0 contains the PalmDOC header (16 bytes) followed by the MOBI header.
	rec0, err := readMobiRecord(f, recordOffsets, 0, int(numRecords))
	if err != nil {
		return nil, fmt.Errorf("read record 0: %w", err)
	}

	if len(rec0) < 20 || string(rec0[16:20]) != "MOBI" {
		return &Book{Title: palmTitle}, nil
	}

	mobi, err := parseMobiHeaderFields(rec0)
	if err != nil {
		return nil, err
	}

	// Prefer the full-name field over the PalmDB name (it's not truncated at 32 chars).
	title := palmTitle
	if mobi.fullNameOffset > 0 && mobi.fullNameLength > 0 {
		end := mobi.fullNameOffset + mobi.fullNameLength
		if int(end) <= len(rec0) {
			title = string(rec0[mobi.fullNameOffset:end])
		}
	}

	book := &Book{Title: title}
	if lang, ok := mobiLanguageCodes[mobi.language&0xFF]; ok {
		book.Language = lang
	}

	// EXTH block is present when bit 6 of exthFlags is set.
	if mobi.exthFlags&0x40 == 0 {
		return book, nil
	}

	exthStart := 16 + int(mobi.headerLength)
	exth, coverOffset, err := parseEXTH(rec0, exthStart)
	if err != nil {
		return book, nil
	}

	if authors, ok := exth[100]; ok {
		book.Authors = authors
	}
	if vals, ok := exth[101]; ok && len(vals) > 0 {
		book.Publisher = vals[0]
	}
	if vals, ok := exth[103]; ok && len(vals) > 0 {
		book.Description = vals[0]
	}
	if vals, ok := exth[104]; ok && len(vals) > 0 {
		book.ISBN = vals[0]
	}
	if vals, ok := exth[106]; ok && len(vals) > 0 {
		book.DatePublished = vals[0]
	}
	if vals, ok := exth[105]; ok {
		book.Tags = vals
	}
	// Type 503 is the updated title (preferred over the full-name field).
	if vals, ok := exth[503]; ok && len(vals) > 0 {
		book.Title = vals[0]
	}

	if coverOffset >= 0 {
		coverRecordIdx := int(mobi.firstImageIndex) + coverOffset
		if coverRecordIdx > 0 && coverRecordIdx < int(numRecords) {
			if data, err := readMobiRecord(f, recordOffsets, coverRecordIdx, int(numRecords)); err == nil {
				book.CoverData = data
			}
		}
	}

	return book, nil
}

type mobiHeaderFields struct {
	headerLength    uint32
	firstNonBook    uint32 // first non-text record (may include FLIS/FCIS/DATP before images)
	firstImageIndex uint32 // first actual image record; EXTH coveroffset is relative to this
	fullNameOffset  uint32 // from start of record 0
	fullNameLength  uint32
	language        uint32 // packed locale ID; primary language is the low byte
	exthFlags       uint32
}

func parseMobiHeaderFields(rec0 []byte) (mobiHeaderFields, error) {
	// All field offsets are absolute within record 0.
	// MOBI header starts at offset 16 within record 0.
	// Field layout (absolute rec0 offsets):
	//   [20:24] headerLength
	//   [80:84] firstNonBookIndex  (MOBI header 0x40)
	//   [84:88] fullNameOffset     (MOBI header 0x44)
	//   [88:92] fullNameLength     (MOBI header 0x48)
	//   [92:96] language           (MOBI header 0x4C)
	//  [108:112] firstImageIndex   (MOBI header 0x5C) — present when headerLength >= 0x5C+4
	//  [128:132] exthFlags         (MOBI header 0x70)
	if len(rec0) < 132 {
		return mobiHeaderFields{}, fmt.Errorf("record 0 too short (%d bytes)", len(rec0))
	}
	f := mobiHeaderFields{
		headerLength:   binary.BigEndian.Uint32(rec0[20:24]),
		firstNonBook:   binary.BigEndian.Uint32(rec0[80:84]),
		fullNameOffset: binary.BigEndian.Uint32(rec0[84:88]),
		fullNameLength: binary.BigEndian.Uint32(rec0[88:92]),
		language:       binary.BigEndian.Uint32(rec0[92:96]),
		exthFlags:      binary.BigEndian.Uint32(rec0[128:132]),
	}
	// firstImageIndex is at MOBI header offset 0x5C = rec0[108].
	// Older/shorter headers don't include it; fall back to firstNonBook.
	if len(rec0) >= 112 && f.headerLength >= 0x5C+4 {
		f.firstImageIndex = binary.BigEndian.Uint32(rec0[108:112])
	} else {
		f.firstImageIndex = f.firstNonBook
	}
	return f, nil
}

// parseEXTH parses the EXTH metadata block from rec0 starting at exthStart.
// Returns a map of type→values and the cover record offset (-1 if absent).
func parseEXTH(rec0 []byte, exthStart int) (map[uint32][]string, int, error) {
	if exthStart+12 > len(rec0) || string(rec0[exthStart:exthStart+4]) != "EXTH" {
		return nil, -1, fmt.Errorf("missing EXTH header")
	}

	recordCount := binary.BigEndian.Uint32(rec0[exthStart+8 : exthStart+12])
	pos := exthStart + 12

	result := make(map[uint32][]string)
	coverOffset := -1

	for range recordCount {
		if pos+8 > len(rec0) {
			break
		}
		recType := binary.BigEndian.Uint32(rec0[pos : pos+4])
		recLen := binary.BigEndian.Uint32(rec0[pos+4 : pos+8])
		if recLen < 8 || pos+int(recLen) > len(rec0) {
			break
		}
		data := rec0[pos+8 : pos+int(recLen)]
		pos += int(recLen)

		switch recType {
		case 100, 101, 103, 104, 105, 106, 503:
			result[recType] = append(result[recType], string(data))
		case 201:
			// Cover record index relative to firstNonBook. 0xFFFFFFFF = no cover.
			if len(data) >= 4 {
				if v := binary.BigEndian.Uint32(data[:4]); v != 0xFFFFFFFF {
					coverOffset = int(v)
				}
			}
		}
	}

	return result, coverOffset, nil
}

// readMobiRecord reads a single PalmDB record by index.
func readMobiRecord(f *os.File, offsets []int64, idx, total int) ([]byte, error) {
	if idx < 0 || idx >= total {
		return nil, fmt.Errorf("record index %d out of range [0, %d)", idx, total)
	}
	start := offsets[idx]
	var end int64
	if idx+1 < total {
		end = offsets[idx+1]
	} else {
		info, err := f.Stat()
		if err != nil {
			return nil, err
		}
		end = info.Size()
	}
	size := end - start
	if size <= 0 {
		return nil, fmt.Errorf("record %d has non-positive size", idx)
	}
	buf := make([]byte, size)
	if _, err := f.ReadAt(buf, start); err != nil {
		return nil, fmt.Errorf("read record %d: %w", idx, err)
	}
	return buf, nil
}

// mobiLanguageCodes maps a MOBI header's primary language ID (the low byte
// of the packed language field, using the same numbering as Windows LANGID
// primary codes) to an ISO 639-1 tag. Dialect sub-codes in the high byte are
// ignored — coarse language identification is all Nineveh needs. Unknown
// codes are left unset rather than guessed.
var mobiLanguageCodes = map[uint32]string{
	0x01: "ar", 0x02: "bg", 0x03: "ca", 0x04: "zh", 0x05: "cs",
	0x06: "da", 0x07: "de", 0x08: "el", 0x09: "en", 0x0A: "es",
	0x0B: "fi", 0x0C: "fr", 0x0D: "he", 0x0E: "hu", 0x0F: "is",
	0x10: "it", 0x11: "ja", 0x12: "ko", 0x13: "nl", 0x14: "no",
	0x15: "pl", 0x16: "pt", 0x18: "ro", 0x19: "ru", 0x1A: "hr",
	0x1B: "sk", 0x1C: "sq", 0x1D: "sv", 0x1E: "th", 0x1F: "tr",
	0x20: "ur", 0x21: "id", 0x22: "uk", 0x23: "be", 0x24: "sl",
	0x25: "et", 0x26: "lv", 0x27: "lt", 0x29: "vi", 0x2A: "az",
	0x2B: "hy", 0x2C: "eu", 0x2E: "mk", 0x35: "af", 0x36: "ka",
	0x38: "hi", 0x39: "mt", 0x3D: "yi", 0x3E: "ms", 0x3F: "kk",
	0x41: "sw", 0x45: "bn", 0x46: "pa", 0x47: "gu", 0x49: "ta",
	0x4A: "te", 0x4B: "kn", 0x4C: "ml", 0x4E: "mr", 0x4F: "sa",
	0x50: "mn",
}
