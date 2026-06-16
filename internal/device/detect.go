package device

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const (
	usbDevicesPath = "/sys/bus/usb/devices"
	kindleVendorID = "1949"
)

// Detect returns all currently connected Kindle devices by scanning Linux sysfs.
func Detect() ([]Device, error) {
	entries, err := os.ReadDir(usbDevicesPath)
	if err != nil {
		return nil, err
	}

	var devices []Device
	for _, entry := range entries {
		devPath := filepath.Join(usbDevicesPath, entry.Name())
		// os.ReadDir entries in sysfs are symlinks; use os.Stat to follow them.
		info, err := os.Stat(devPath)
		if err != nil || !info.IsDir() {
			continue
		}

		vendor, err := readSysfsAttr(devPath, "idVendor")
		if err != nil || vendor != kindleVendorID {
			continue
		}

		serial, _ := readSysfsAttr(devPath, "serial")
		id := entry.Name()
		if serial != "" {
			id = serial
		}

		// The product attribute may report a storage description (e.g. "Internal Storage")
		// rather than a device name. For any Amazon vendor device we use "Kindle".
		mountPoint, _ := findMountPoint(devPath)
		devices = append(devices, &mtpDevice{id: id, name: "Kindle", mountPoint: mountPoint})
	}
	return devices, nil
}

// findMountPoint resolves a USB device's sysfs path to a mounted filesystem path.
// It follows the sysfs chain: USB device → SCSI host → block device → /proc/mounts.
func findMountPoint(devPath string) (string, error) {
	realPath, err := filepath.EvalSymlinks(devPath)
	if err != nil {
		return "", err
	}

	// USB mass storage: <devPath>/<iface>/host<N>/target<N>:0:0/<N>:0:0:0/block
	matches, err := filepath.Glob(filepath.Join(realPath, "*", "*", "*", "*", "block"))
	if err != nil || len(matches) == 0 {
		return "", nil
	}

	blockEntries, err := os.ReadDir(matches[0])
	if err != nil || len(blockEntries) == 0 {
		return "", nil
	}
	diskName := blockEntries[0].Name()

	// Mass-storage devices are normally mounted by partition (e.g. sda1),
	// not the raw disk (sda), so check partitions before falling back.
	var candidates []string
	if partitions, err := os.ReadDir(filepath.Join(matches[0], diskName)); err == nil {
		for _, p := range partitions {
			if p.IsDir() && strings.HasPrefix(p.Name(), diskName) {
				candidates = append(candidates, p.Name())
			}
		}
	}
	candidates = append(candidates, diskName)

	for _, name := range candidates {
		if mp, err := mountPointForDevice("/dev/" + name); err == nil && mp != "" {
			return mp, nil
		}
	}

	// Nothing mounted it yet. Many minimal window managers don't run an
	// automount daemon (gvfs, udiskie, etc.), so ask udisks2 directly
	// rather than depending on one being present.
	for _, name := range candidates {
		if exec.Command("udisksctl", "mount", "-b", "/dev/"+name, "--no-user-interaction").Run() != nil {
			continue
		}
		if mp, err := mountPointForDevice("/dev/" + name); err == nil && mp != "" {
			return mp, nil
		}
	}
	return "", nil
}

// mountPointForDevice reads /proc/mounts and returns the mount point for the given block device.
func mountPointForDevice(blockDev string) (string, error) {
	data, err := os.ReadFile("/proc/mounts")
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == blockDev {
			return fields[1], nil
		}
	}
	return "", nil
}

func readSysfsAttr(devPath, attr string) (string, error) {
	data, err := os.ReadFile(filepath.Join(devPath, attr))
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}
