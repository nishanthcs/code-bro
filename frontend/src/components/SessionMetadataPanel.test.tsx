import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SessionMetadataPanel,
  type SessionMetadataPanelHandle,
} from "./SessionMetadataPanel";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    getTagSuggestions: vi.fn().mockResolvedValue([]),
  };
});

beforeEach(() => {
  localStorage.clear();
});

it("restores disclosure preference and exposes a compact summary", async () => {
  localStorage.setItem("codebro-session-metadata-expanded", "false");
  render(
    <SessionMetadataPanel
      tags={["Python", "Async", "HTTP"]}
      onTagsChange={() => undefined}
      refUrl="https://example.com/docs"
      onRefUrlChange={() => undefined}
      notesMarkdown="two words"
    />,
  );

  const toggle = screen.getByRole("button", { name: /Metadata/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("+1")).toBeInTheDocument();
  expect(screen.getByText("9 chars · 2 words")).toBeInTheDocument();

  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(localStorage.getItem("codebro-session-metadata-expanded")).toBe(
    "true",
  );
});

it("supports imperative expand and toggle actions for keyboard shortcuts", () => {
  const ref = createRef<SessionMetadataPanelHandle>();
  render(
    <SessionMetadataPanel
      ref={ref}
      tags={[]}
      onTagsChange={() => undefined}
      refUrl={null}
      onRefUrlChange={() => undefined}
      notesMarkdown=""
    />,
  );
  const toggle = screen.getByRole("button", { name: /Metadata/ });

  act(() => ref.current?.expand());
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  act(() => ref.current?.toggle());
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});
