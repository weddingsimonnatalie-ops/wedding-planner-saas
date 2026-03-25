/**
 * Sanitize a filename for safe use in HTTP headers.
 *
 * Removes control characters, quotes, and path separators that could
 * be used for header injection attacks. This is used both on upload
 * (to store safe filenames in the database) and on download (defense-in-depth).
 *
 * @param filename - The original filename to sanitize
 * @param maxLength - Maximum length for the filename (default 200)
 * @returns A sanitized filename safe for use in Content-Disposition headers
 */
export function sanitizeFilename(filename: string, maxLength = 200): string {
  if (!filename) return "download";

  let sanitized = filename;

  // Remove control characters (CR, LF, TAB, NULL, etc.)
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, "");

  // Remove quotes (could break out of filename="..." in headers)
  sanitized = sanitized.replace(/"/g, "");

  // Remove path separators (could be used for path traversal)
  sanitized = sanitized.replace(/[\/\\]/g, "_");

  // Collapse multiple spaces/underscores into single underscore
  sanitized = sanitized.replace(/[\s_]+/g, "_");

  // Trim whitespace and underscores from edges
  sanitized = sanitized.replace(/^[_\s]+|[_\s]+$/g, "");

  // If nothing left after sanitization, use a default
  if (!sanitized) return "download";

  // Limit length
  return sanitized.substring(0, maxLength);
}

/**
 * Build a safe Content-Disposition header value.
 *
 * Uses both a sanitized ASCII filename (for older browsers) and
 * filename* with UTF-8 encoding (for modern browsers).
 *
 * @param filename - The sanitized filename
 * @param disposition - "inline" or "attachment"
 * @returns The Content-Disposition header value
 */
export function buildContentDisposition(
  filename: string,
  disposition: "inline" | "attachment" = "attachment"
): string {
  const safeName = sanitizeFilename(filename);
  const encodedName = encodeURIComponent(filename);
  return `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodedName}`;
}