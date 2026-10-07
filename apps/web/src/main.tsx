// Vite removes the lab import entirely from production builds. Selecting the
// entry before importing auth also keeps the demo independent of Supabase.
if (import.meta.env.DEV && /^\/ux-lab\/live-video\/?$/.test(window.location.pathname)) {
  void import("./dev-video-entry");
} else if (import.meta.env.DEV && /^\/ux-lab(?:\/|$)/.test(window.location.pathname)) {
  void import("./ux-lab/bootstrap");
} else {
  void import("./product-entry");
}
