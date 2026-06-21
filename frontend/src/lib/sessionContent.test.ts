import type { SessionResource } from "../types";
import { sameSessionContent } from "./sessionContent";

function session(): SessionResource {
  return {
    id: "session-1",
    name: "Example",
    code: "print(1)",
    tags: ["Python"],
    revision: 1,
    created_at: "2026-06-21T00:00:00Z",
    updated_at: "2026-06-21T00:00:00Z",
    ref_url: "https://example.com",
    notes_markdown: "# Notes",
  };
}

it("compares reference URL and notes as persisted session content", () => {
  const original = session();

  expect(sameSessionContent(original, { ...original, revision: 2 })).toBe(true);
  expect(
    sameSessionContent(original, { ...original, ref_url: null }),
  ).toBe(false);
  expect(
    sameSessionContent(original, { ...original, notes_markdown: "" }),
  ).toBe(false);
});
