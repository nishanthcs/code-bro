import { formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  it("formats recent timestamps without throwing", () => {
    const value = new Date(Date.now() - 60_000).toISOString();
    expect(formatRelativeTime(value)).toMatch(/minute|seconds|now/i);
  });
});

