function loopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/** Checked before importing auth/API modules in the live Lab entry. */
export function localVideoReviewAllowed(dev: boolean, origin: string, supabaseUrl: string): boolean {
  return dev && loopbackUrl(origin) && loopbackUrl(supabaseUrl);
}
