import {
	type Intent,
	OverlayToaster,
	Spinner,
	type Toaster,
} from "@blueprintjs/core";
import { useCallback, useEffect, useRef } from "react";

// Owns the Blueprint OverlayToaster instance and exposes toast helpers
// shared across library and device operations.
export function useToaster() {
	const toasterRef = useRef<Toaster | null>(null);

	useEffect(() => {
		OverlayToaster.create({ position: "top" }).then((t) => {
			toasterRef.current = t;
		});
	}, []);

	const showToast = useCallback(
		(msg: string, intent: Intent = "none", ms = 3000, key?: string) => {
			toasterRef.current?.show({ message: msg, intent, timeout: ms }, key);
		},
		[],
	);

	const startProgressToast = useCallback((msg: string): string => {
		return (
			toasterRef.current?.show({
				message: (
					<span className="flex items-center gap-2">
						<Spinner size={12} />
						{msg}
					</span>
				),
				timeout: 0,
			}) ?? ""
		);
	}, []);

	const updateProgressToast = useCallback((key: string, msg: string) => {
		toasterRef.current?.show(
			{
				message: (
					<span className="flex items-center gap-2">
						<Spinner size={12} />
						{msg}
					</span>
				),
				timeout: 0,
			},
			key,
		);
	}, []);

	return { showToast, startProgressToast, updateProgressToast };
}
