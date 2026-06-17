package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"io"
	"net/http"

	"nineveh/internal/db"
	"nineveh/internal/device"
	"nineveh/internal/fetcher"
	"nineveh/internal/library"
	"nineveh/internal/metadata"
	"nineveh/internal/prefs"

	"github.com/adrg/xdg"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	db        *db.DB
	library   *library.Library
	prefs     *prefs.Store
	devicesMu sync.RWMutex
	devices   []device.Device
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	dataDir := filepath.Join(xdg.DataHome, "nineveh")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		panic(err)
	}

	d, err := db.Open(filepath.Join(dataDir, "nineveh.db"))
	if err != nil {
		panic(err)
	}
	a.db = d
	a.library = library.New(d, dataDir)
	if p, err := prefs.Open(); err == nil {
		a.prefs = p
	} else {
		a.prefs = prefs.Default()
	}
	if initial, err := device.Detect(); err == nil {
		a.devices = initial
	}
	go a.watchDevices()
}

func (a *App) shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}

// --- Preferences ---

func (a *App) GetPreferences() prefs.Preferences {
	return a.prefs.Get()
}

func (a *App) SavePreferences(p prefs.Preferences) error {
	return a.prefs.Save(p)
}

// --- Library ---

func (a *App) GetBooks() ([]*metadata.Book, error) {
	return a.library.GetBooks()
}

func (a *App) GetBook(id int64) (*metadata.Book, error) {
	return a.library.GetBook(id)
}

// GetCoverData reads a cover file from disk and returns a base64 data URL.
// coverPath is the URL path stored in the DB, e.g. "/covers/hash.jpg".
func (a *App) GetCoverData(coverPath string) string {
	if coverPath == "" {
		return ""
	}
	name := filepath.Base(strings.TrimPrefix(coverPath, "/covers/"))
	absPath := filepath.Join(xdg.DataHome, "nineveh", ".covers", name)
	data, err := os.ReadFile(absPath)
	if err != nil {
		return ""
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(data)
}

// GetDeviceFileCover parses the cover image directly from a device file and
// returns a base64 data URL, or "" if the file has no cover or is unsupported.
func (a *App) GetDeviceFileCover(path string) string {
	if path == "" {
		return ""
	}
	ext := metadata.Format(strings.ToLower(strings.TrimPrefix(filepath.Ext(path), ".")))
	parsers := map[metadata.Format]metadata.Parser{
		metadata.FormatEPUB: metadata.NewEPUBParser(),
		metadata.FormatMOBI: metadata.NewMOBIParser(),
		metadata.FormatAZW:  metadata.NewMOBIParser(),
		metadata.FormatAZW3: metadata.NewAZW3Parser(),
	}
	parser, ok := parsers[ext]
	if !ok {
		return ""
	}
	book, err := parser.Parse(path)
	if err != nil || len(book.CoverData) == 0 {
		return ""
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(book.CoverData)
}

func (a *App) UpdateBook(book *metadata.Book) error {
	return a.library.UpdateBook(book)
}

// FetchBookMetadata queries external metadata sources (Open Library, optionally Google Books)
// and returns candidate metadata for the given book.
func (a *App) FetchBookMetadata(bookID int64) ([]fetcher.FetchedMetadata, error) {
	book, err := a.library.GetBook(bookID)
	if err != nil {
		return nil, err
	}
	p := a.prefs.Get()
	cfg := fetcher.Config{
		GoogleBooksAPIKey:  p.GoogleBooksAPIKey,
		OpenLibraryEnabled: p.FetchSources.OpenLibraryEnabled,
		GoogleBooksEnabled: p.FetchSources.GoogleBooksEnabled,
	}
	return fetcher.FetchCandidates(a.ctx, book, cfg)
}

// ApplyFetchedCover downloads a cover image from coverURL, saves it to the covers directory,
// and returns the new cover path. The caller should persist it via UpdateBook.
func (a *App) ApplyFetchedCover(bookID int64, coverURL string) (string, error) {
	req, err := http.NewRequestWithContext(a.ctx, http.MethodGet, coverURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "nineveh/1.0 (ebook library manager)")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch cover: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch cover: status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("fetch cover: read body: %w", err)
	}

	return a.library.SaveCoverFromBytes(data)
}

func (a *App) DeleteBook(id int64) error {
	return a.library.DeleteBook(id)
}

func (a *App) ImportFile(path string) (*metadata.Book, error) {
	return a.library.ImportFile(path)
}

func (a *App) ImportDir(dir string) ([]*metadata.Book, error) {
	books, errs := a.library.ImportDir(dir)
	for _, err := range errs {
		slog.Warn("import error", "err", err)
	}
	return books, nil
}

func (a *App) Search(query string) ([]*metadata.Book, error) {
	return a.library.Search(query)
}

func (a *App) GetAllAuthors() ([]string, error) { return a.db.GetAllAuthors() }
func (a *App) GetAllTags() ([]string, error)    { return a.db.GetAllTags() }
func (a *App) GetAllSeries() ([]string, error)  { return a.db.GetAllSeries() }

func (a *App) SelectDirectory() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Calibre Library",
	})
}

func (a *App) SelectFiles() ([]string, error) {
	return runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Add Books",
		Filters: []runtime.FileFilter{
			{DisplayName: "Ebooks", Pattern: "*.epub;*.pdf;*.mobi;*.azw3;*.azw"},
		},
	})
}

func (a *App) ImportFromCalibre(path string) ([]*metadata.Book, error) {
	books, errs := a.library.ImportFromCalibre(path)
	for _, err := range errs {
		slog.Warn("calibre import error", "err", err)
	}
	return books, nil
}

func (a *App) ResetLibrary() error {
	return a.library.ResetLibrary()
}

// --- Devices ---

func (a *App) DetectDevices() ([]device.DeviceInfo, error) {
	detected, err := device.Detect()
	if err != nil {
		return nil, err
	}
	a.devicesMu.Lock()
	a.devices = detected
	a.devicesMu.Unlock()
	infos := make([]device.DeviceInfo, len(detected))
	for i, d := range detected {
		free, _ := d.FreeSpace()
		infos[i] = device.DeviceInfo{ID: d.ID(), Name: d.Name(), FreeSpace: free}
	}
	return infos, nil
}

func (a *App) ListDeviceBooks(deviceID string) ([]*metadata.BookFile, error) {
	for _, d := range a.cachedDevices() {
		if d.ID() == deviceID {
			return d.ListBooks()
		}
	}
	return nil, fmt.Errorf("device %s not found", deviceID)
}

func (a *App) RemoveFromDevice(deviceID string, paths []string) error {
	for _, d := range a.cachedDevices() {
		if d.ID() == deviceID {
			var failCount int
			for _, p := range paths {
				if err := d.RemoveBook(p); err != nil {
					slog.Warn("remove from device failed", "path", p, "err", err)
					failCount++
				}
			}
			if failCount > 0 {
				return fmt.Errorf("%d file(s) failed to remove", failCount)
			}
			return nil
		}
	}
	return fmt.Errorf("device %s not found", deviceID)
}

func (a *App) cachedDevices() []device.Device {
	a.devicesMu.RLock()
	defer a.devicesMu.RUnlock()
	return a.devices
}

func (a *App) refreshDevices() {
	detected, err := device.Detect()
	if err != nil {
		return
	}
	a.devicesMu.Lock()
	prev := deviceSet(a.devices)
	a.devices = detected
	a.devicesMu.Unlock()

	if !deviceSetsEqual(deviceSet(detected), prev) {
		runtime.EventsEmit(a.ctx, "devices:changed", deviceInfos(detected))
	}
}

func (a *App) watchDevices() {
	// Polling runs always: ensures eventual consistency when a uevent fires before
	// the block device is fully ready to mount (e.g. immediately after reconnect).
	go a.watchDevicesPoll()

	// Uevent listener gives fast response on connect/disconnect.
	if err := device.ListenUevents(a.ctx, func(_ string) {
		a.refreshDevices()
	}); err != nil {
		slog.Warn("uevent listener unavailable", "err", err)
	}
}

func (a *App) watchDevicesPoll() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			a.refreshDevices()
		}
	}
}

func (a *App) EjectDevice(deviceID string) error {
	a.devicesMu.RLock()
	idx := -1
	for i, d := range a.devices {
		if d.ID() == deviceID {
			idx = i
			break
		}
	}
	var dev device.Device
	if idx >= 0 {
		dev = a.devices[idx]
	}
	a.devicesMu.RUnlock()

	if dev == nil {
		return fmt.Errorf("device %s not found", deviceID)
	}
	if err := dev.Eject(); err != nil {
		return err
	}

	a.devicesMu.Lock()
	for i, d := range a.devices {
		if d.ID() == deviceID {
			a.devices = append(a.devices[:i], a.devices[i+1:]...)
			break
		}
	}
	infos := deviceInfos(a.devices)
	a.devicesMu.Unlock()

	runtime.EventsEmit(a.ctx, "devices:changed", infos)
	return nil
}

func deviceSet(devices []device.Device) map[string]bool {
	s := make(map[string]bool, len(devices))
	for _, d := range devices {
		s[d.ID()] = true
	}
	return s
}

func deviceInfos(devices []device.Device) []device.DeviceInfo {
	infos := make([]device.DeviceInfo, len(devices))
	for i, d := range devices {
		free, _ := d.FreeSpace()
		infos[i] = device.DeviceInfo{ID: d.ID(), Name: d.Name(), FreeSpace: free}
	}
	return infos
}

func deviceSetsEqual(a, b map[string]bool) bool {
	if len(a) != len(b) {
		return false
	}
	for k := range a {
		if !b[k] {
			return false
		}
	}
	return true
}

func (a *App) SendBook(bookID int64, deviceID string, format metadata.Format) error {
	book, err := a.library.GetBook(bookID)
	if err != nil {
		return fmt.Errorf("get book: %w", err)
	}
	for _, d := range a.cachedDevices() {
		if d.ID() == deviceID {
			if err := d.SendBook(book, format); err != nil {
				return err
			}
			return nil
		}
	}
	return fmt.Errorf("device %s not found", deviceID)
}
