package prefs

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/adrg/xdg"
)

type ColumnPrefs struct {
	Visible []string       `json:"visible"`
	Widths  map[string]int `json:"widths"`
}

type Preferences struct {
	LibraryRoot       string      `json:"libraryRoot"`
	DetailsPaneWidth  int         `json:"detailsPaneWidth"`
	Columns           ColumnPrefs `json:"columns"`
	GoogleBooksAPIKey string      `json:"googleBooksApiKey"`
}

var defaults = Preferences{
	DetailsPaneWidth: 288,
	Columns: ColumnPrefs{
		Visible: []string{"index", "isRead", "title", "authors", "series", "tags", "formats", "rating", "datePublished", "dateAdded"},
		Widths:  map[string]int{},
	},
}

type Store struct {
	mu   sync.RWMutex
	path string
	data Preferences
}

func Default() *Store {
	return &Store{data: defaults}
}

func Open() (*Store, error) {
	configDir := filepath.Join(xdg.ConfigHome, "nineveh")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, err
	}
	path := filepath.Join(configDir, "preferences.json")
	s := &Store{path: path, data: defaults}
	raw, err := os.ReadFile(path)
	if err == nil {
		merged := defaults
		if jsonErr := json.Unmarshal(raw, &merged); jsonErr == nil {
			if merged.Columns.Widths == nil {
				merged.Columns.Widths = map[string]int{}
			}
			s.data = merged
		}
	}
	return s, nil
}

func (s *Store) Get() Preferences {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.data
}

func (s *Store) Save(p Preferences) error {
	if p.Columns.Widths == nil {
		p.Columns.Widths = map[string]int{}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data = p
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0644)
}
