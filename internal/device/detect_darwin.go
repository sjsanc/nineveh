//go:build darwin

package device

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// Detect returns all currently connected Kindle devices by scanning /Volumes
// for mounted volumes that expose the 'documents' folder Kindles use as mass storage.
func Detect() ([]Device, error) {
	entries, err := os.ReadDir("/Volumes")
	if err != nil {
		return nil, err
	}
	var devices []Device
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		root := filepath.Join("/Volumes", e.Name())
		if _, err := os.Stat(filepath.Join(root, "documents")); err != nil {
			continue
		}
		id := volumeID(root)
		devices = append(devices, &kindleDevice{id: id, name: e.Name(), root: root})
	}
	return devices, nil
}

func volumeID(root string) string {
	var st syscall.Statfs_t
	if err := syscall.Statfs(root, &st); err == nil {
		return fmt.Sprintf("%d:%d", st.Fsid.Val[0], st.Fsid.Val[1])
	}
	return root
}
