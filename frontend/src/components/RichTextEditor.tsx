import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

interface Props {
	value: string;
	onChange: (html: string) => void;
}

type ToolbarAction =
	| { type: "bold" | "italic" | "bulletList" | "orderedList" }
	| { type: "link" };

const TOOLBAR: { label: string; action: ToolbarAction; title: string }[] = [
	{ label: "B", action: { type: "bold" }, title: "Bold" },
	{ label: "I", action: { type: "italic" }, title: "Italic" },
	{ label: "•", action: { type: "bulletList" }, title: "Bullet list" },
	{ label: "1.", action: { type: "orderedList" }, title: "Ordered list" },
	{ label: "🔗", action: { type: "link" }, title: "Link" },
];

export function RichTextEditor({ value, onChange }: Props) {
	const editor = useEditor({
		extensions: [
			StarterKit,
			Link.configure({
				openOnClick: false,
				HTMLAttributes: { class: "text-blue-400 underline" },
			}),
		],
		content: value,
		onUpdate({ editor }) {
			const html = editor.getHTML();
			onChange(html === "<p></p>" ? "" : html);
		},
		editorProps: {
			attributes: {
				class:
					"min-h-[240px] px-3 py-2 text-zinc-100 text-sm leading-relaxed focus:outline-none",
			},
		},
	});

	// Sync when the book changes (dialog navigates next/prev)
	useEffect(() => {
		if (!editor) return;
		const current = editor.getHTML();
		const incoming = value || "";
		if (current !== incoming) {
			editor.commands.setContent(incoming, { emitUpdate: false });
		}
	}, [editor, value]);

	function runAction(action: ToolbarAction) {
		if (!editor) return;
		const chain = editor.chain().focus();

		if (action.type === "bold") chain.toggleBold().run();
		else if (action.type === "italic") chain.toggleItalic().run();
		else if (action.type === "bulletList") chain.toggleBulletList().run();
		else if (action.type === "orderedList") chain.toggleOrderedList().run();
		else if (action.type === "link") {
			const prev = editor.getAttributes("link").href ?? "";
			const url = window.prompt("URL", prev);
			if (url === null) return;
			if (url === "") {
				editor.chain().focus().unsetLink().run();
			} else {
				editor.chain().focus().setLink({ href: url }).run();
			}
		}
	}

	function isActive(action: ToolbarAction): boolean {
		if (!editor) return false;
		if (action.type === "link") return editor.isActive("link");
		return editor.isActive(action.type);
	}

	return (
		<div className="bg-zinc-800 border border-zinc-700 rounded focus-within:ring-2 focus-within:ring-blue-600">
			<div className="flex gap-1 px-2 py-1 border-b border-zinc-700">
				{TOOLBAR.map(({ label, action, title }) => (
					<button
						key={title}
						type="button"
						title={title}
						onMouseDown={(e) => {
							e.preventDefault();
							runAction(action);
						}}
						className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
							isActive(action)
								? "bg-zinc-600 text-zinc-100"
								: "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
						}`}
					>
						{label}
					</button>
				))}
			</div>
			<EditorContent editor={editor} />
		</div>
	);
}
