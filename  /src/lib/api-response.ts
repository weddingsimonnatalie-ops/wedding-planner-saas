import { NextResponse } from "next/server";

/**
 * Set no-cache headers on a response to prevent browser and CDN/proxy caching.
 * Call on every GET handler response.
 */
export function noCacheHeaders(headers: Headers): void {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
}

/**
 * Drop-in replacement for NextResponse.json() that always includes no-cache headers.
 * Use in GET handlers instead of NextResponse.json().
 */
export function apiJson<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const res = NextResponse.json(data, init);
  noCacheHeaders(res.headers);
  return res;
}
