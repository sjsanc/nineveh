//go:build darwin

package platform

import (
	"context"
	"os/exec"

	"nineveh/internal/device"
)

type stubDetector struct{}

func (stubDetector) Detect() ([]device.Device, error) { return nil, nil }

type stubWatcher struct{}

func (stubWatcher) Watch(_ context.Context, _ func(string)) error { return nil }

type darwinOpener struct{}

func (darwinOpener) Open(path string) error {
	return exec.Command("open", path).Start()
}

func New() Platform {
	return Platform{
		Detector: stubDetector{},
		Watcher:  stubWatcher{},
		Opener:   darwinOpener{},
	}
}
