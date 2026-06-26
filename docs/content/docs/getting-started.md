---
title: Getting Started
weight: 1
---

## Installation

### Linux (AUR)

```bash
yay -S nineveh-bin
```

### Windows / macOS

Download the latest release from the [GitHub releases page](https://github.com/sjsanc/nineveh/releases) and run the installer.

## First Run

On first launch, Nineveh creates its data directory. No sign-in or account required.

| Platform | Library and preferences |
|----------|------------------------|
| Linux    | `~/.local/share/nineveh/` / `~/.config/nineveh/` |
| macOS    | `~/Library/Application Support/nineveh/` |
| Windows  | `%LOCALAPPDATA%\nineveh\` |

On macOS and Windows, both the library database and the preferences file live in the same directory.

## Adding Books

Use **File > Add Books** to open a file picker. You can select multiple files at once.

Supported formats: EPUB, MOBI, AZW, AZW3, PDF.

## Importing from Calibre

**File > Import from Calibre** and point it at your Calibre library root (the folder containing `metadata.db`). Nineveh imports all books, preserving metadata, covers, and tags.

## Connecting a Device

Plug in a Kindle via USB. Nineveh detects it automatically and enables the **Devices** tab. Click the tab to switch to the device view, where you can browse the device's library and transfer books in either direction.

On Linux, Nineveh mounts via `udisks2` and communicates over MTP. On Windows, it scans removable drives.

A toast notification appears when a device connects or disconnects.
