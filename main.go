package main

import (
	"embed"
	"net/http"
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
	// Create an instance of the app structure
	app := NewApp()

	coverDir := filepath.Join(xdg.DataHome, "nineveh", ".covers")
	coverHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/covers/") {
			name := filepath.Base(r.URL.Path)
			http.ServeFile(w, r, filepath.Join(coverDir, name))
			return
		}
		http.NotFound(w, r)
	})

	// Create application with options
	err := wails.Run(&options.App{
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
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
