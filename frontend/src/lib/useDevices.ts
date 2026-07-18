import { useCallback, useEffect, useRef, useState } from "react";
import {
	DetectDevices,
	EjectDevice,
	ListDeviceBooks,
	RemoveFromDevice,
} from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import type { BookFile, DeviceInfo } from "../types";
import type { useToaster } from "./useToaster";

// Owns device connection/selection state, the devices:changed event
// listener, and the active section (library vs. devices) it drives.
export function useDevices(toast: ReturnType<typeof useToaster>) {
	const { showToast } = toast;
	const [devices, setDevices] = useState<DeviceInfo[]>([]);
	const [activeDeviceID, setActiveDeviceID] = useState<string | null>(null);
	const [deviceLetterMap, setDeviceLetterMap] = useState<Map<string, string>>(
		new Map(),
	);
	const [deviceBooks, setDeviceBooks] = useState<BookFile[]>([]);
	const [activeSection, setActiveSection] = useState<"library" | "devices">(
		"library",
	);
	const [selectedDeviceFile, setSelectedDeviceFile] = useState<BookFile | null>(
		null,
	);
	const [isLoadingDeviceBooks, setIsLoadingDeviceBooks] = useState(false);
	const prevDevicesRef = useRef<DeviceInfo[]>([]);

	const assignLetters = useCallback((found: DeviceInfo[]) => {
		setDeviceLetterMap((prev) => {
			const next = new Map(prev);
			for (const d of found) {
				if (!next.has(d.ID) && next.size < 26) {
					next.set(d.ID, String.fromCharCode(65 + next.size));
				}
			}
			return next;
		});
	}, []);

	const loadDevices = useCallback(async (): Promise<DeviceInfo[]> => {
		const result = await DetectDevices();
		const found = result ?? [];
		setDevices(found);
		assignLetters(found);
		if (found.length > 0) {
			setActiveDeviceID(found[0].ID);
			setIsLoadingDeviceBooks(true);
			ListDeviceBooks(found[0].ID)
				.then((files) => setDeviceBooks(files ?? []))
				.catch(console.error)
				.finally(() => setIsLoadingDeviceBooks(false));
		}
		return found;
	}, [assignLetters]);

	useEffect(() => {
		loadDevices()
			.then((found) => {
				prevDevicesRef.current = found;
			})
			.catch(console.error);
	}, [loadDevices]);

	useEffect(() => {
		const unsubscribe = EventsOn("devices:changed", (found: DeviceInfo[]) => {
			const list = found ?? [];
			const prev = prevDevicesRef.current;
			const prevIds = new Set(prev.map((d) => d.ID));
			const nextIds = new Set(list.map((d) => d.ID));

			for (const d of list) {
				if (!prevIds.has(d.ID)) {
					showToast(`${d.Name} connected`, "success", 4000);
				}
			}
			for (const d of prev) {
				if (!nextIds.has(d.ID)) {
					showToast(`${d.Name} disconnected`, undefined, 4000);
				}
			}

			prevDevicesRef.current = list;
			setDevices(list);
			assignLetters(list);
		});
		return unsubscribe;
	}, [assignLetters, showToast]);

	useEffect(() => {
		if (devices.length === 0) {
			setActiveSection("library");
			setActiveDeviceID(null);
			setDeviceBooks([]);
			setSelectedDeviceFile(null);
			return;
		}
		if (activeDeviceID && !devices.some((d) => d.ID === activeDeviceID)) {
			setActiveDeviceID(null);
			setDeviceBooks([]);
		}
	}, [devices, activeDeviceID]);

	async function selectDevice(id: string) {
		if (isLoadingDeviceBooks) return;
		setActiveDeviceID(id);
		setSelectedDeviceFile(null);
		setIsLoadingDeviceBooks(true);
		try {
			const files = await ListDeviceBooks(id);
			setDeviceBooks(files ?? []);
		} catch (err) {
			setDeviceBooks([]);
			console.error(err);
		} finally {
			setIsLoadingDeviceBooks(false);
		}
	}

	function selectLibrarySection() {
		setActiveSection("library");
		setSelectedDeviceFile(null);
	}

	async function selectDevicesSection() {
		setActiveSection("devices");
		setSelectedDeviceFile(null);
		const targetId = activeDeviceID ?? devices[0]?.ID;
		if (targetId) await selectDevice(targetId);
	}

	async function rescanDevices() {
		try {
			const found = await loadDevices();
			if (found.length === 0) setDeviceBooks([]);
			if (activeDeviceID && !found.some((d) => d.ID === activeDeviceID))
				setActiveDeviceID(null);
		} catch (err) {
			console.error(err);
		}
	}

	async function ejectDevice(deviceID: string) {
		const deviceName = devices.find((d) => d.ID === deviceID)?.Name ?? "Device";
		try {
			await EjectDevice(deviceID);
			setActiveDeviceID(null);
			setDeviceBooks([]);
			setSelectedDeviceFile(null);
			setActiveSection("library");
			showToast(`${deviceName} ejected`, "success", 4000);
		} catch (err) {
			showToast(`Eject failed: ${err}`, "danger", 4000);
			console.error(err);
		}
	}

	async function removeFromDevice(paths: string[]) {
		if (!activeDeviceID) return;
		try {
			await RemoveFromDevice(activeDeviceID, paths);
			setDeviceBooks((prev) => prev.filter((b) => !paths.includes(b.Path)));
			showToast(
				`Removed ${paths.length} file${paths.length === 1 ? "" : "s"} from device`,
				"success",
			);
		} catch (err) {
			showToast("Remove failed", "danger");
			console.error(err);
		}
	}

	const activeDevice = devices.find((d) => d.ID === activeDeviceID) ?? null;

	return {
		devices,
		activeDeviceID,
		deviceLetterMap,
		deviceBooks,
		activeSection,
		selectedDeviceFile,
		setSelectedDeviceFile,
		isLoadingDeviceBooks,
		activeDevice,
		selectDevice,
		selectLibrarySection,
		selectDevicesSection,
		rescanDevices,
		ejectDevice,
		removeFromDevice,
	};
}
