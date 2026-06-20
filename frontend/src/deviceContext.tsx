import { createContext, type ReactNode, useContext } from "react";
import type { BookFile, DeviceInfo } from "./types";

interface DeviceContextValue {
	devices: DeviceInfo[];
	activeDeviceID: string | null;
	deviceLetterMap: Map<string, string>;
	deviceBooks: BookFile[];
}

const DeviceContext = createContext<DeviceContextValue>({
	devices: [],
	activeDeviceID: null,
	deviceLetterMap: new Map(),
	deviceBooks: [],
});

export function DeviceProvider({
	value,
	children,
}: {
	value: DeviceContextValue;
	children: ReactNode;
}) {
	return (
		<DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
	);
}

export function useDevice() {
	return useContext(DeviceContext);
}
