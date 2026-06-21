import type { SessionResource } from "../types";

export function sameSessionContent(
  left: SessionResource,
  right: SessionResource,
): boolean {
  return (
    left.name === right.name &&
    left.code === right.code &&
    left.tags.length === right.tags.length &&
    left.tags.every((tag, index) => tag === right.tags[index]) &&
    left.ref_url === right.ref_url &&
    left.notes_markdown === right.notes_markdown
  );
}
