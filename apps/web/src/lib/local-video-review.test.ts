import { describe, expect, it } from "vitest";
import { localVideoReviewAllowed } from "./local-video-review";

describe("DEV video review before auth imports", () => {
  it("allows local frontend and local Supabase only in DEV", () => {
    expect(localVideoReviewAllowed(true, "http://127.0.0.1:5174", "http://127.0.0.1:54321")).toBe(true);
    expect(localVideoReviewAllowed(true, "http://localhost:5174", "http://[::1]:54321")).toBe(true);
    expect(localVideoReviewAllowed(false, "http://localhost:5174", "http://localhost:54321")).toBe(false);
  });
  it.each(["https://project.supabase.co", "http://127.0.0.1.example.com", "https://localhost@production.example.com", "http://localhost:54321?redirect=remote", "http://user:pass@localhost:54321", "not-a-url"])("blocks nonlocal or unsafe backend %s", (backend) => {
    expect(localVideoReviewAllowed(true, "http://127.0.0.1:5174", backend)).toBe(false);
  });
  it("blocks a hosted frontend even with a local backend", () => {
    expect(localVideoReviewAllowed(true, "https://kpss.example.com", "http://localhost:54321")).toBe(false);
  });
});
