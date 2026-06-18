//go:build linux

package platform

import (
	"context"
	"os/exec"

	"nineveh/internal/device"
)

type linuxDetector struct{}

func (linuxDetector) Detect() ([]device.Device, error) {
	return device.Detect()
}

type linuxWatcher struct{}

func (linuxWatcher) Watch(ctx context.Context, onChange func(string)) error {
	return device.ListenUevents(ctx, onChange)
}

type linuxOpener struct{}

func (linuxOpener) Open(path string) error {
	return exec.Command("xdg-open", path).Start()
}

func New() Platform {
	return Platform{
		Detector: linuxDetector{},
		Watcher:  linuxWatcher{},
		Opener:   linuxOpener{},
	}
}
