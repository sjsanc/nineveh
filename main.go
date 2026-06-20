package main

import (
	"embed"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/adrg/xdg"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	dataDir := filepath.Join(xdg.DataHome, "nineveh")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		panic(err)
	}

	logFile, err := os.OpenFile(filepath.Join(dataDir, "nineveh.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		panic(err)
	}
	defer logFile.Close()

	slog.SetDefault(slog.New(slog.NewTextHandler(io.MultiWriter(os.Stderr, logFile), &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})))

	app := NewApp()

	coverDir := filepath.Join(dataDir, ".covers")
	coverHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/covers/") {
			name := filepath.Base(r.URL.Path)
			http.ServeFile(w, r, filepath.Join(coverDir, name))
			return
		}
		http.NotFound(w, r)
	})

	if err := wails.Run(&options.App{
		Title:  "nineveh",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: coverHandler,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	}); err != nil {
		slog.Error("wails run failed", "err", err)
	}
}
