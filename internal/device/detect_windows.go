//go:build windows

package device

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

// Detect returns all currently connected Kindle devices by scanning removable
// drives for the 'documents' folder that Kindles expose as mass storage.
func Detect() ([]Device, error) {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil, err
	}

	var devices []Device
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) == 0 {
			continue
		}
		root := fmt.Sprintf("%c:\\", 'A'+i)
		rootPtr, err := windows.UTF16PtrFromString(root)
		if err != nil {
			continue
		}
		if windows.GetDriveType(rootPtr) != windows.DRIVE_REMOVABLE {
			continue
		}
		if _, err := os.Stat(filepath.Join(root, "documents")); err != nil {
			continue
		}
		id := volumeSerialID(root)
		devices = append(devices, &kindleDevice{id: id, name: "Kindle", root: root})
	}
	return devices, nil
}

func volumeSerialID(root string) string {
	rootPtr, err := windows.UTF16PtrFromString(root)
	if err != nil {
		return root[:1]
	}
	var serial uint32
	_ = windows.GetVolumeInformation(rootPtr, nil, 0, &serial, nil, nil, nil, 0)
	if serial != 0 {
		return fmt.Sprintf("%08X", serial)
	}
	return root[:1]
}
