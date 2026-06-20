import { Icon } from "@blueprintjs/core";
import { useDevice } from "../deviceContext";
import { deviceColor } from "../utils";

interface Props {
	activeSection: "library" | "devices";
	onImport: () => void;
	onAdd: () => void;
	onReset: () => void;
	importStatus: string;
	onSelectDevice: (id: string) => void;
	isLoadingDeviceBooks: boolean;
}

export function SubSidebar({
	activeSection,
	onImport,
	onAdd,
	onReset,
	importStatus: _importStatus,
	onSelectDevice,
	isLoadingDeviceBooks,
}: Props) {
	const { devices, activeDeviceID, deviceLetterMap } = useDevice();
	return (
		<div className="w-12 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col items-center py-2 gap-2">
			{activeSection === "library" && (
				<>
					<button
						type="button"
						onClick={onImport}
						title="Import from Calibre"
						className="w-9 h-9 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
					>
						<Icon icon="import" size={18} />
					</button>
					<button
						type="button"
						onClick={onAdd}
						title="Add Books"
						className="w-9 h-9 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
					>
						<Icon icon="plus" size={18} />
					</button>
					<div className="flex-1" />
					<button
						type="button"
						onClick={onReset}
						title="Reset Library"
						className="w-9 h-9 flex items-center justify-center rounded text-zinc-700 hover:text-red-500 hover:bg-red-950/30 transition-colors"
					>
						<Icon icon="trash" size={16} />
					</button>
				</>
			)}
			{activeSection === "devices" &&
				devices.map((d) => {
					const letter = deviceLetterMap.get(d.ID) ?? "?";
					const isActive = activeDeviceID === d.ID;
					const disabled = isLoadingDeviceBooks && !isActive;
					return (
						<button
							type="button"
							key={d.ID}
							onClick={() => onSelectDevice(d.ID)}
							disabled={disabled}
							title={d.Name}
							className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
								isActive
									? "ring-2 ring-zinc-500"
									: disabled
										? "opacity-40 cursor-not-allowed"
										: "hover:opacity-80"
							}`}
						>
							<div
								className="w-7 h-7 flex items-center justify-center rounded font-bold text-sm text-zinc-900"
								style={{ backgroundColor: deviceColor(letter) }}
							>
								{letter}
							</div>
						</button>
					);
				})}
		</div>
	);
}
