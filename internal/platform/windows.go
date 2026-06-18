//go:build windows

package platform

import (
	"context"
	"os/exec"

	"nineveh/internal/device"
)

type windowsDetector struct{}

func (windowsDetector) Detect() ([]device.Device, error) {
	return device.Detect()
}

type stubWatcher struct{}

func (stubWatcher) Watch(_ context.Context, _ func(string)) error { return nil }

type windowsOpener struct{}

func (windowsOpener) Open(path string) error {
	return exec.Command("cmd", "/c", "start", "", path).Start()
}

func New() Platform {
	return Platform{
		Detector: windowsDetector{},
		Watcher:  stubWatcher{},
		Opener:   windowsOpener{},
	}
}
