const MAX_REFERENCE_URL_LENGTH = 2_048;

export function validateReferenceUrl(value: string): string | null {
  const stripped = value.trim();
  if (!stripped) return null;
  if (stripped.length > MAX_REFERENCE_URL_LENGTH) {
    throw new Error("URL must be 2048 characters or fewer");
  }
  if (
    /\s/u.test(stripped) ||
    [...stripped].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error("URL must not contain whitespace or control characters");
  }
  let parsed: URL;
  try {
    parsed = new URL(stripped);
  } catch {
    throw new Error("Enter a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (!parsed.hostname) {
    throw new Error("URL must include a hostname");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL must not contain credentials");
  }
  return stripped;
}

export function shortenReferenceUrl(
  url: string,
  maxLength = 48,
): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./u, "");
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/u, "");
    const display = `${host}${path}`;
    if (display.length <= maxLength) return display;
    const availablePath = Math.max(6, maxLength - host.length - 1);
    return `${host}${path.slice(0, availablePath)}…`;
  } catch {
    return url.length <= maxLength ? url : `${url.slice(0, maxLength - 1)}…`;
  }
}
