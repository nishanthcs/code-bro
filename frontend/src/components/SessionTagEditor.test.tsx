import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionTagEditor } from "./SessionTagEditor";

function TagEditorHarness() {
  const [tags, setTags] = useState<string[]>([]);
  return <SessionTagEditor tags={tags} onChange={setTags} />;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockTagSuggestions(tags: string[]) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(tags),
  });
}

describe("SessionTagEditor", () => {
  it("adds normalized tags, ignores duplicates, and removes chips", async () => {
    mockTagSuggestions([]);
    const user = userEvent.setup();
    render(<TagEditorHarness />);
    const input = screen.getByRole("combobox", { name: "Add session tag" });

    await user.type(input, "  Python  {Enter}");
    expect(screen.getByText("Python")).toBeInTheDocument();

    await user.type(input, "python{Enter}");
    expect(screen.getAllByText("Python")).toHaveLength(1);

    await user.type(input, "ＤＰ{Enter}");
    expect(screen.getByText("DP")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove tag Python" }));
    expect(screen.queryByText("Python")).not.toBeInTheDocument();
  });

  it("commits pending text on Tab and removes the last tag with Backspace", async () => {
    mockTagSuggestions([]);
    const user = userEvent.setup();
    render(<TagEditorHarness />);
    const input = screen.getByRole("combobox", { name: "Add session tag" });

    await user.type(input, "Graphs");
    await user.tab();
    expect(screen.getByText("Graphs")).toBeInTheDocument();

    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(screen.queryByText("Graphs")).not.toBeInTheDocument();
  });

  it("shows suggestions when typing and selects with click", async () => {
    mockTagSuggestions(["Python", "Data Structures", "Algorithms"]);
    const user = userEvent.setup();
    render(<TagEditorHarness />);
    const input = screen.getByRole("combobox", { name: "Add session tag" });

    await user.type(input, "pyt");
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
    expect(screen.getByText("Python")).toBeInTheDocument();

    await user.click(screen.getByText("Python"));
    expect(screen.getByText("Python")).toBeInTheDocument();
  });

  it("selects suggestion with Enter key", async () => {
    mockTagSuggestions(["Python", "Data Structures", "Algorithms"]);
    const user = userEvent.setup();
    render(<TagEditorHarness />);
    const input = screen.getByRole("combobox", { name: "Add session tag" });

    await user.type(input, "pyt");
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    await user.keyboard("{Enter}");
    expect(screen.getByText("Python")).toBeInTheDocument();
  });

  it("filters out already added tags from suggestions", async () => {
    mockTagSuggestions(["Python", "Data Structures", "Algorithms"]);
    const user = userEvent.setup();
    const TestHarness = () => {
      const [tags, setTags] = useState<string[]>(["Python"]);
      return <SessionTagEditor tags={tags} onChange={setTags} />;
    };
    render(<TestHarness />);
    const input = screen.getByRole("combobox", { name: "Add session tag" });

    await user.type(input, "a");
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText("Python")).not.toBeInTheDocument();
    expect(within(listbox).getByText("Algorithms")).toBeInTheDocument();
    expect(within(listbox).getByText("Data Structures")).toBeInTheDocument();
  });
});
