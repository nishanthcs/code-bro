import {
  shortenReferenceUrl,
  validateReferenceUrl,
} from "./referenceUrl";

it("validates safe absolute reference URLs", () => {
  expect(validateReferenceUrl(" https://example.com/docs?q=1 ")).toBe(
    "https://example.com/docs?q=1",
  );
  expect(validateReferenceUrl("")).toBeNull();
  expect(() => validateReferenceUrl("/relative")).toThrow();
  expect(() => validateReferenceUrl("javascript:alert(1)")).toThrow();
  expect(() =>
    validateReferenceUrl("https://user:password@example.com"),
  ).toThrow();
});

it("shortens only display text without changing the source URL", () => {
  expect(
    shortenReferenceUrl(
      "https://www.example.com/a/very/long/reference/path",
      28,
    ),
  ).toMatch(/^example\.com\/a\/very/);
});
