/**
 * Fetch helper for GET requests from client components.
 * Always sets cache: 'no-store' to prevent browser and Next.js caching.
 * Use for GET calls only — POST/PUT/PATCH/DELETE use fetch() directly.
 */
export async function fetchApi(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    cache: "no-store",
  });
}
