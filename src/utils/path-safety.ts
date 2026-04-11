/**
 * Shared path-safety helpers.
 *
 * The original path-traversal guards across the codebase all used
 * `filePath.includes("..")`, which has a false positive on legitimate
 * filenames like `readme..txt` or `foo..bar/baz.md` — the `..` substring
 * doesn't mean the path traverses out of a directory, it just means the
 * filename happens to contain two dots in a row.
 *
 * The correct check is: does any path *segment* (component between
 * separators) equal exactly `..`? That's what `..` means in POSIX and
 * Windows path semantics.
 */

/**
 * Returns true if any segment of the given path is exactly `..`, which
 * indicates an attempted parent-directory traversal. Splits on both
 * forward and back slashes so the check works on Windows paths too.
 *
 * Allows `.` (current directory) and filenames containing `..` as a
 * substring (e.g. `readme..txt`).
 */
export function hasTraversalSegment(filePath: string): boolean {
  if (typeof filePath !== "string" || filePath.length === 0) return false;
  const segments = filePath.split(/[\\/]/);
  return segments.includes("..");
}
