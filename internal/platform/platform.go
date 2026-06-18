package platform

import (
	"context"

	"nineveh/internal/device"
)

// DeviceDetector returns currently connected devices.
type DeviceDetector interface {
	Detect() ([]device.Device, error)
}

// DeviceWatcher delivers hotplug notifications. Watch blocks until ctx is
// cancelled; it returns a non-nil error only if it cannot start (e.g. the
// underlying socket or API is unavailable).
type DeviceWatcher interface {
	Watch(ctx context.Context, onChange func(action string)) error
}

// Opener opens a file with the platform default application.
type Opener interface {
	Open(path string) error
}

// Platform bundles the three platform-specific services used by App.
// Construct it once at startup via New().
type Platform struct {
	Detector DeviceDetector
	Watcher  DeviceWatcher
	Opener   Opener
}
