export function SelectionCheckmark() {
	return (
		<span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 shrink-0">
			<svg
				viewBox="0 0 12 12"
				fill="none"
				className="w-2.5 h-2.5"
				aria-hidden="true"
			>
				<path
					d="M2 6l2.5 2.5L10 3.5"
					stroke="white"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</span>
	);
}
