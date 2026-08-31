import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConflictReviewDialog } from "../components/ConflictReviewDialog";
import type { FormatConflict } from "../types";

function makeConflict(overrides: Partial<FormatConflict> = {}): FormatConflict {
	return {
		BookID: 1,
		BookTitle: "Pride and Prejudice",
		Format: "epub",
		ExistingPath:
			"/library/Jane Austen/Pride and Prejudice/Pride and Prejudice.epub",
		ExistingSize: 24846119,
		ExistingHash: "existing-hash",
		IncomingPath: "/home/user/dl/pg1342-images-3.epub",
		IncomingSize: 24835567,
		IncomingHash: "incoming-hash",
		...overrides,
	} as FormatConflict;
}

describe("ConflictReviewDialog", () => {
	it("renders nothing when there are no conflicts", () => {
		const { container } = render(
			<ConflictReviewDialog
				conflicts={[]}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("lists every conflict, pre-checked", () => {
		const conflicts = [
			makeConflict({ IncomingPath: "/dl/a.epub" }),
			makeConflict({
				BookTitle: "Moby Dick",
				Format: "mobi",
				IncomingPath: "/dl/b.mobi",
			}),
		];
		render(
			<ConflictReviewDialog
				conflicts={conflicts}
				onSubmit={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(screen.getByText("Pride and Prejudice")).toBeInTheDocument();
		expect(screen.getByText("Moby Dick")).toBeInTheDocument();
		for (const box of screen.getAllByRole("checkbox")) {
			expect(box).toBeChecked();
		}
		expect(screen.getByText("Add 2 Selected")).toBeInTheDocument();
	});

	it("submits only the checked conflicts", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		const conflicts = [
			makeConflict({ IncomingPath: "/dl/a.epub" }),
			makeConflict({
				BookTitle: "Moby Dick",
				Format: "mobi",
				IncomingPath: "/dl/b.mobi",
			}),
		];
		render(
			<ConflictReviewDialog
				conflicts={conflicts}
				onSubmit={onSubmit}
				onCancel={vi.fn()}
			/>,
		);

		await user.click(screen.getAllByRole("checkbox")[0]);
		await user.click(screen.getByText(/Add 1 Selected/));

		expect(onSubmit).toHaveBeenCalledWith([conflicts[1]]);
	});

	it("select none then select all round-trips the full set", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		const conflicts = [makeConflict()];
		render(
			<ConflictReviewDialog
				conflicts={conflicts}
				onSubmit={onSubmit}
				onCancel={vi.fn()}
			/>,
		);

		await user.click(screen.getByText("Select None"));
		expect(screen.getByText("Add 0 Selected")).toBeInTheDocument();

		await user.click(screen.getByText("Select All"));
		await user.click(screen.getByText(/Add 1 Selected/));
		expect(onSubmit).toHaveBeenCalledWith(conflicts);
	});

	it("calls onCancel without submitting anything", async () => {
		const user = userEvent.setup();
		const onSubmit = vi.fn();
		const onCancel = vi.fn();
		render(
			<ConflictReviewDialog
				conflicts={[makeConflict()]}
				onSubmit={onSubmit}
				onCancel={onCancel}
			/>,
		);

		await user.click(screen.getByText("Cancel"));
		expect(onCancel).toHaveBeenCalled();
		expect(onSubmit).not.toHaveBeenCalled();
	});
});
