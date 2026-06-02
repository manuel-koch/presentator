import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { ElementPicker } from "./ElementPicker";

const ELEMENTS = ["background", "slide-1", "dot"];

describe("ElementPicker", () => {
  it("renders nothing when elements list is empty", () => {
    const { container } = render(<ElementPicker elements={[]} hidden={[]} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a checkbox for each element", () => {
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("checks elements that are not hidden", () => {
    render(<ElementPicker elements={ELEMENTS} hidden={["dot"]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "background" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "slide-1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "dot" })).not.toBeChecked();
  });

  it("calls onChange to add an element to hidden when unchecked", async () => {
    const onChange = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "slide-1" }));
    expect(onChange).toHaveBeenCalledWith(["slide-1"]);
  });

  it("calls onChange to remove an element from hidden when checked", async () => {
    const onChange = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={["dot"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "dot" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("preserves other hidden elements when toggling one", async () => {
    const onChange = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={["background", "dot"]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "background" }));
    expect(onChange).toHaveBeenCalledWith(["dot"]);
  });

  // userEvent.click(el, { shiftKey: true }) does not forward shiftKey to events.
  // The correct v14 API for modifier keys is userEvent.setup() + keyboard hold.
  it("shift-click on a visible element solos it (hides all others)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={onChange} />);
    await user.keyboard("[ShiftLeft>]");
    await user.click(screen.getByRole("checkbox", { name: "slide-1" }));
    await user.keyboard("[/ShiftLeft]");
    expect(onChange).toHaveBeenCalledWith(["background", "dot"]);
  });

  it("shift-click on a hidden element solos it (shows only that element)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={["background", "dot"]} onChange={onChange} />);
    await user.keyboard("[ShiftLeft>]");
    await user.click(screen.getByRole("checkbox", { name: "background" }));
    await user.keyboard("[/ShiftLeft]");
    expect(onChange).toHaveBeenCalledWith(["slide-1", "dot"]);
  });

  it("renders a go-to-element button for each element when onGoToElement is provided", () => {
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={() => {}} onGoToElement={() => {}} />);
    expect(screen.getAllByRole("button", { name: /Go to .* in viewport/ })).toHaveLength(3);
  });

  it("calls onGoToElement with element id when the goto button is clicked", async () => {
    const onGoToElement = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={() => {}} onGoToElement={onGoToElement} />);
    await userEvent.click(screen.getByRole("button", { name: "Go to slide-1 in viewport" }));
    expect(onGoToElement).toHaveBeenCalledWith("slide-1");
  });

  it("does not render goto buttons when onGoToElement is not provided", () => {
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={() => {}} />);
    expect(screen.queryAllByRole("button", { name: /Go to .* in viewport/ })).toHaveLength(0);
  });

  it("calls onHoverElement with element id on mouse enter", async () => {
    const onHoverElement = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={() => {}} onHoverElement={onHoverElement} />);
    const user = userEvent.setup();
    await user.hover(screen.getByRole("checkbox", { name: "slide-1" }));
    expect(onHoverElement).toHaveBeenCalledWith("slide-1");
  });

  it("calls onHoverElement with null on mouse leave", async () => {
    const onHoverElement = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={[]} onChange={() => {}} onHoverElement={onHoverElement} />);
    const user = userEvent.setup();
    await user.hover(screen.getByRole("checkbox", { name: "slide-1" }));
    await user.unhover(screen.getByRole("checkbox", { name: "slide-1" }));
    expect(onHoverElement).toHaveBeenLastCalledWith(null);
  });

  it("shift-click on an already-soloed element restores all", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ElementPicker elements={ELEMENTS} hidden={["background", "dot"]} onChange={onChange} />);
    await user.keyboard("[ShiftLeft>]");
    await user.click(screen.getByRole("checkbox", { name: "slide-1" }));
    await user.keyboard("[/ShiftLeft]");
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
