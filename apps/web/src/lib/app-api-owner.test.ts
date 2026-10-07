import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { auth } }));
import { callAppApi } from "./app-api";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("delayed progress request authority", () => {
  it("does not send a queued checkpoint under a different authenticated user", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "new-owner" }, access_token: "local-test-token" } }, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(callAppApi("/youtube-videos/catalog/progress", { method: "PUT", expectedUserId: "original-owner", body: {} })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["original-owner", undefined])("keeps matching and existing callers compatible: %s", async (expectedUserId) => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "original-owner" }, access_token: "local-test-token" } }, error: null });
    vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ saved: true }) }));
    vi.stubGlobal("fetch", fetch);
    expect(await callAppApi("/youtube-videos/catalog/progress", { method: "PUT", expectedUserId, body: {} })).toEqual({ saved: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
