import { useEffect, useState } from "react";

export type ThemeSetting = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark() {
	return window.matchMedia(DARK_QUERY).matches;
}

/**
 * Resolves a theme setting ("system" | "light" | "dark") to an actual
 * light/dark value, tracking OS preference changes when set to "system".
 * Also applies .bp6-dark to <html> so Blueprint and the Tailwind `dark:`
 * variant (see style.css) stay in sync across the whole document, including
 * content rendered via createPortal.
 */
export function useResolvedTheme(setting: ThemeSetting): ResolvedTheme {
	const [systemDark, setSystemDark] = useState(systemPrefersDark);

	useEffect(() => {
		const mql = window.matchMedia(DARK_QUERY);
		const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);

	const resolved: ResolvedTheme =
		setting === "system" ? (systemDark ? "dark" : "light") : setting;

	useEffect(() => {
		document.documentElement.classList.toggle("bp6-dark", resolved === "dark");
	}, [resolved]);

	return resolved;
}
