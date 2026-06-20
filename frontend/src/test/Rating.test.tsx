import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Rating } from "../components/Rating";

describe("Rating", () => {
	it("renders the correct number of stars", () => {
		render(<Rating value={3} max={5} />);
		const stars = screen.getAllByText(/[★☆]/);
		expect(stars).toHaveLength(5);
	});

	it("fills stars up to the current value", () => {
		render(<Rating value={3} max={5} />);
		const filled = screen.getAllByText("★");
		const empty = screen.getAllByText("☆");
		expect(filled).toHaveLength(3);
		expect(empty).toHaveLength(2);
	});

	it("calls onChange when a star is clicked", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Rating value={2} onChange={onChange} />);

		await user.click(screen.getAllByRole("radio")[3]);
		expect(onChange).toHaveBeenCalledWith(4);
	});

	it("toggles off when clicking the current value", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Rating value={3} onChange={onChange} />);

		await user.click(screen.getAllByRole("radio")[2]);
		expect(onChange).toHaveBeenCalledWith(0);
	});

	it("is read-only when no onChange is provided", () => {
		render(<Rating value={4} />);
		expect(screen.queryAllByRole("radio")).toHaveLength(0);
		expect(screen.getByRole("img")).toBeInTheDocument();
	});
});
