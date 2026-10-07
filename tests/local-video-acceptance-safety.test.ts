import { describe, expect, it } from "vitest";
import { ACCEPTANCE_EMAIL, acceptanceDates, assertLocalVideoEnvironment, fixtureId } from "../scripts/local-video-acceptance.mjs";

const profile = "a9cb4d62-5d48-4bdd-a17d-ae8c6f240f31";
const local = { url: "http://127.0.0.1:54321", dbUrl: "postgresql://postgres:local@127.0.0.1:54322/postgres" };
describe("local video acceptance mutation boundary", () => {
  it("accepts only explicit dedicated test ownership and local Supabase endpoints", () => {
    expect(() => assertLocalVideoEnvironment(local, profile, ACCEPTANCE_EMAIL)).not.toThrow();
    expect(() => assertLocalVideoEnvironment(local, undefined, ACCEPTANCE_EMAIL)).toThrow();
    expect(() => assertLocalVideoEnvironment(local, profile, "real-user@example.com")).toThrow();
  });
  it.each([
    "https://project.supabase.co", "http://127.0.0.1.example.com:54321", "http://localhost.example.com:54321",
    "http://127.0.0.1:54321@evil.example:54321", "http://user:secret@127.0.0.1:54321", "http://127.0.0.1:54321/?redirect=remote",
  ])("refuses unsafe API host/config: %s", (url) => {
    expect(() => assertLocalVideoEnvironment({ ...local, url }, profile, ACCEPTANCE_EMAIL)).toThrow();
  });
  it.each([
    "postgresql://postgres:local@project.supabase.co:54322/postgres", "postgresql://postgres:local@127.0.0.1:5432/postgres",
    "postgresql://postgres:local@127.0.0.1:54322/production", "postgresql://postgres:local@127.0.0.1:54322/postgres?host=remote",
  ])("refuses unsafe DB host/config: %s", (dbUrl) => {
    expect(() => assertLocalVideoEnvironment({ ...local, dbUrl }, profile, ACCEPTANCE_EMAIL)).toThrow();
  });
  it("uses Istanbul date across the UTC midnight boundary and Sunday/Monday weeks", () => {
    expect(acceptanceDates(new Date("2026-10-04T21:30:00Z"))).toEqual({ today: "2026-10-05", weekStart: "2026-10-05", weekEnd: "2026-10-11" });
    expect(acceptanceDates(new Date("2026-10-04T20:30:00Z"))).toEqual({ today: "2026-10-04", weekStart: "2026-09-28", weekEnd: "2026-10-04" });
  });
  it("keeps fixture identity stable while separating profile and day ownership", () => {
    expect(fixtureId(profile, "video")).toBe(fixtureId(profile, "video"));
    expect(fixtureId(profile, "video")).not.toBe(fixtureId(profile, "task:2026-10-05"));
    expect(fixtureId(profile, "video")).not.toBe(fixtureId("b9cb4d62-5d48-4bdd-a17d-ae8c6f240f31", "video"));
  });
});
