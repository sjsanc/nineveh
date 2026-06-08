package metadata

// AZW3 (KF8) uses the same PalmDB/MOBI container as MOBI — metadata and
// cover are in the EXTH block of the first MOBI section, which parseMobiFile handles.
type azw3Parser struct{}

func NewAZW3Parser() Parser {
	return &azw3Parser{}
}

func (p *azw3Parser) Parse(filePath string) (*Book, error) {
	return parseMobiFile(filePath)
}
