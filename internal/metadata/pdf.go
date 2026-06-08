package metadata

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"unicode/utf16"
)

type pdfParser struct{}

func NewPDFParser() Parser { return &pdfParser{} }

func (p *pdfParser) Parse(path string) (*Book, error) {
	book, _ := parsePDFInfo(path)
	if book == nil {
		book = &Book{}
	}
	return book, nil
}

func parsePDFInfo(path string) (*Book, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return nil, err
	}
	size := fi.Size()

	// Read the last 4KB to find startxref and the trailer /Info reference.
	tailOff := size - 4096
	if tailOff < 0 {
		tailOff = 0
	}
	tail := make([]byte, size-tailOff)
	if _, err := f.ReadAt(tail, tailOff); err != nil {
		return nil, err
	}

	sxi := bytes.LastIndex(tail, []byte("startxref"))
	if sxi < 0 {
		return nil, fmt.Errorf("startxref not found")
	}
	var xrefOff int64
	fmt.Sscanf(strings.TrimSpace(string(tail[sxi+9:])), "%d", &xrefOff)

	infoNum, infoGen, found := parsePDFInfoRef(tail)
	if !found {
		return &Book{}, nil
	}

	objOff, err := xrefTableLookup(f, xrefOff, infoNum, infoGen, size)
	if err != nil {
		// Cross-reference stream (PDF 1.5+) or linearized: fall back to scan.
		objOff, err = scanForPDFObj(f, infoNum, infoGen, size)
		if err != nil {
			return &Book{}, nil
		}
	}

	return parsePDFInfoDict(f, objOff)
}

// parsePDFInfoRef finds the first /Info N G R reference in b.
func parsePDFInfoRef(b []byte) (num, gen int, found bool) {
	key := []byte("/Info")
	for start := 0; start < len(b); {
		idx := bytes.Index(b[start:], key)
		if idx < 0 {
			break
		}
		after := bytes.TrimLeft(b[start+idx+len(key):], " \t\r\n")
		var n, g int
		if _, err := fmt.Sscanf(string(after), "%d %d R", &n, &g); err == nil {
			return n, g, true
		}
		start = start + idx + len(key)
	}
	return 0, 0, false
}

// xrefTableLookup parses a traditional xref table to find the byte offset of objNum objGen.
func xrefTableLookup(f *os.File, xrefOff int64, objNum, objGen int, fileSize int64) (int64, error) {
	readSize := fileSize - xrefOff
	if readSize > 2<<20 {
		readSize = 2 << 20
	}
	buf := make([]byte, readSize)
	n, err := f.ReadAt(buf, xrefOff)
	if err != nil && err != io.EOF {
		return -1, err
	}
	buf = buf[:n]

	xrefIdx := bytes.Index(buf, []byte("xref"))
	if xrefIdx < 0 {
		return -1, fmt.Errorf("not a traditional xref table")
	}
	pos := xrefIdx + 4
	for pos < len(buf) && (buf[pos] == ' ' || buf[pos] == '\t' || buf[pos] == '\r' || buf[pos] == '\n') {
		pos++
	}

	for pos < len(buf) {
		end := bytes.IndexAny(buf[pos:], "\r\n")
		if end < 0 {
			break
		}
		line := strings.TrimSpace(string(buf[pos : pos+end]))
		pos += end
		for pos < len(buf) && (buf[pos] == '\r' || buf[pos] == '\n') {
			pos++
		}

		if strings.HasPrefix(line, "trailer") {
			break
		}

		var firstObj, count int
		if _, err := fmt.Sscanf(line, "%d %d", &firstObj, &count); err != nil {
			break
		}

		for i := 0; i < count && pos+20 <= len(buf); i++ {
			entry := buf[pos : pos+20]
			pos += 20
			if firstObj+i != objNum {
				continue
			}
			var byteOff int64
			var gen int
			var typ rune
			if _, err := fmt.Sscanf(string(entry), "%d %d %c", &byteOff, &gen, &typ); err == nil && typ == 'n' && gen == objGen {
				return byteOff, nil
			}
		}
	}

	return -1, fmt.Errorf("object %d %d R not found in xref table", objNum, objGen)
}

// scanForPDFObj scans the file linearly for "objNum objGen obj".
func scanForPDFObj(f *os.File, objNum, objGen int, fileSize int64) (int64, error) {
	pattern := []byte(fmt.Sprintf("%d %d obj", objNum, objGen))
	const chunkSize = 64 * 1024
	overlap := len(pattern) - 1

	var prev []byte
	var prevBase int64

	for off := int64(0); off < fileSize; off += chunkSize {
		end := off + chunkSize
		if end > fileSize {
			end = fileSize
		}
		buf := make([]byte, end-off)
		if _, err := f.ReadAt(buf, off); err != nil && err != io.EOF {
			return -1, err
		}

		var search []byte
		var searchBase int64
		if len(prev) > 0 {
			search = append(prev, buf...)
			searchBase = prevBase
		} else {
			search = buf
			searchBase = off
		}

		if idx := bytes.Index(search, pattern); idx >= 0 {
			return searchBase + int64(idx), nil
		}

		if len(buf) > overlap {
			prevBase = off + int64(len(buf)-overlap)
			prev = append([]byte{}, buf[len(buf)-overlap:]...)
		} else {
			prevBase = off
			prev = append([]byte{}, buf...)
		}
	}
	return -1, fmt.Errorf("object %d %d not found", objNum, objGen)
}

func parsePDFInfoDict(f *os.File, objOff int64) (*Book, error) {
	buf := make([]byte, 4096)
	n, _ := f.ReadAt(buf, objOff)
	buf = buf[:n]

	start := bytes.Index(buf, []byte("<<"))
	if start < 0 {
		return &Book{}, nil
	}
	end := findDictEnd(buf, start)
	if end < 0 {
		return &Book{}, nil
	}
	dict := buf[start : end+2]

	book := &Book{}
	book.Title = pdfDictString(dict, "Title")
	if author := pdfDictString(dict, "Author"); author != "" {
		book.Authors = []string{author}
	}
	if subj := pdfDictString(dict, "Subject"); subj != "" {
		book.Description = subj
	}
	if kw := pdfDictString(dict, "Keywords"); kw != "" {
		for _, k := range strings.Split(kw, ",") {
			if t := strings.TrimSpace(k); t != "" {
				book.Tags = append(book.Tags, t)
			}
		}
	}
	return book, nil
}

func findDictEnd(b []byte, start int) int {
	depth := 0
	for i := start; i < len(b)-1; i++ {
		if b[i] == '<' && b[i+1] == '<' {
			depth++
			i++
		} else if b[i] == '>' && b[i+1] == '>' {
			depth--
			if depth == 0 {
				return i
			}
			i++
		}
	}
	return -1
}

func pdfDictString(dict []byte, key string) string {
	pattern := []byte("/" + key)
	for start := 0; start < len(dict); {
		idx := bytes.Index(dict[start:], pattern)
		if idx < 0 {
			break
		}
		abs := start + idx
		after := abs + len(pattern)
		// Confirm the key ends at a non-name character (guards against /TitleFoo matching /Title).
		if after < len(dict) {
			c := dict[after]
			if c != ' ' && c != '\t' && c != '\r' && c != '\n' && c != '(' && c != '<' {
				start = abs + len(pattern)
				continue
			}
		}
		rest := bytes.TrimLeft(dict[after:], " \t\r\n")
		if len(rest) == 0 {
			break
		}
		switch rest[0] {
		case '(':
			return parsePDFLiteralString(rest)
		case '<':
			if len(rest) > 1 && rest[1] != '<' {
				return parsePDFHexString(rest)
			}
		}
		start = abs + len(pattern)
	}
	return ""
}

func parsePDFLiteralString(b []byte) string {
	if len(b) == 0 || b[0] != '(' {
		return ""
	}
	var out []byte
	depth := 0
	i := 1
	for i < len(b) {
		c := b[i]
		switch {
		case c == '\\' && i+1 < len(b):
			i++
			switch b[i] {
			case 'n':
				out = append(out, '\n')
			case 'r':
				out = append(out, '\r')
			case 't':
				out = append(out, '\t')
			case 'b':
				out = append(out, '\b')
			case 'f':
				out = append(out, '\f')
			case '(', ')', '\\':
				out = append(out, b[i])
			default:
				if b[i] >= '0' && b[i] <= '7' {
					oct := []byte{b[i]}
					for j := 1; j < 3 && i+1 < len(b) && b[i+1] >= '0' && b[i+1] <= '7'; j++ {
						i++
						oct = append(oct, b[i])
					}
					v, _ := strconv.ParseUint(string(oct), 8, 8)
					out = append(out, byte(v))
				} else {
					out = append(out, b[i])
				}
			}
		case c == '(':
			depth++
			out = append(out, c)
		case c == ')':
			if depth == 0 {
				if len(out) >= 2 && out[0] == 0xFE && out[1] == 0xFF {
					return pdfUTF16ToString(out[2:])
				}
				return strings.TrimSpace(string(out))
			}
			depth--
			out = append(out, c)
		default:
			out = append(out, c)
		}
		i++
	}
	return strings.TrimSpace(string(out))
}

func parsePDFHexString(b []byte) string {
	if len(b) < 2 || b[0] != '<' {
		return ""
	}
	end := bytes.IndexByte(b[1:], '>')
	if end < 0 {
		return ""
	}
	hexOnly := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F') {
			return r
		}
		return -1
	}, string(b[1:end+1]))
	if len(hexOnly)%2 != 0 {
		hexOnly += "0"
	}
	decoded := make([]byte, len(hexOnly)/2)
	for i := range decoded {
		v, _ := strconv.ParseUint(hexOnly[i*2:i*2+2], 16, 8)
		decoded[i] = byte(v)
	}
	if len(decoded) >= 2 && decoded[0] == 0xFE && decoded[1] == 0xFF {
		return pdfUTF16ToString(decoded[2:])
	}
	return strings.TrimSpace(string(decoded))
}

func pdfUTF16ToString(b []byte) string {
	if len(b)%2 != 0 {
		b = b[:len(b)-1]
	}
	u16 := make([]uint16, len(b)/2)
	for i := range u16 {
		u16[i] = binary.BigEndian.Uint16(b[i*2:])
	}
	return strings.TrimSpace(string(utf16.Decode(u16)))
}
