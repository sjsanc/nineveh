package device

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync"
	"syscall"
)

type uevent struct {
	action    string
	subsystem string
}

func parseUevent(buf []byte) uevent {
	var ev uevent
	for _, field := range bytes.Split(buf, []byte{0}) {
		s := string(field)
		if v, ok := strings.CutPrefix(s, "ACTION="); ok {
			ev.action = v
		}
		if v, ok := strings.CutPrefix(s, "SUBSYSTEM="); ok {
			ev.subsystem = v
		}
	}
	return ev
}

// ListenUevents listens on the kernel uevent netlink socket and calls onEvent
// for each block device add or remove action. Blocks until ctx is cancelled.
// Returns a non-nil error only if the socket cannot be opened or bound.
func ListenUevents(ctx context.Context, onEvent func(action string)) error {
	fd, err := syscall.Socket(syscall.AF_NETLINK, syscall.SOCK_RAW, syscall.NETLINK_KOBJECT_UEVENT)
	if err != nil {
		return err
	}

	if err := syscall.Bind(fd, &syscall.SockaddrNetlink{
		Family: syscall.AF_NETLINK,
		Groups: 1,
	}); err != nil {
		syscall.Close(fd)
		return err
	}

	var closeOnce sync.Once
	closefd := func() { closeOnce.Do(func() { syscall.Close(fd) }) }
	defer closefd()

	go func() {
		<-ctx.Done()
		closefd()
	}()

	buf := make([]byte, 8192)
	for {
		n, err := syscall.Read(fd, buf)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			slog.Warn("uevent read error", "err", err)
			continue
		}
		ev := parseUevent(buf[:n])
		if ev.subsystem == "block" && (ev.action == "add" || ev.action == "remove") {
			onEvent(ev.action)
		}
	}
}
