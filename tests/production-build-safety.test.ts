import { describe, expect, it } from "vitest";
import { assertProductionClientEnvironment, inspectProductionRuntime } from "../scripts/production-build-safety.mjs";

describe("explicit production web build inputs and runtime sweep", () => {
  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321", "https://127.0.0.1.example.com", "https://user:pass@project.supabase.co", "https://project.supabase.co/?local=true"])("refuses %s", (url) => {
    expect(() => assertProductionClientEnvironment({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: "sb_publishable_test" })).toThrow();
  });
  it("refuses missing explicit process inputs and server-only keys", () => {
    expect(() => assertProductionClientEnvironment({})).toThrow();
    expect(() => assertProductionClientEnvironment({ VITE_SUPABASE_URL: "https://project.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_secret_test" })).toThrow();
  });
  it("accepts public production inputs without persisting their values", () => {
    expect(assertProductionClientEnvironment({ VITE_SUPABASE_URL: "https://project.supabase.co", VITE_SUPABASE_ANON_KEY: "sb_publishable_test" })).toEqual({ origin: "https://project.supabase.co", names: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] });
  });
  it.each(["http://127.0.0.1:54321", "http://localhost:54323/functions/v1/app-api", "ws://[::1]:5174"])("rejects local runtime endpoint %s", (url) => {
    expect(inspectProductionRuntime(`const endpoint = '${url}'`).rejected).toContain(url);
  });
  it("distinguishes the SDK's unused default from injected application endpoints", () => {
    expect(inspectProductionRuntime('const a=0,b="http://localhost:9999",c="supabase.auth.token";')).toEqual({ hits: [], rejected: [], sdkDefaultReferences: ["http://localhost:9999"], routerParserReferences: [] });
    expect(inspectProductionRuntime('fetch("http://localhost:9999")').rejected).toEqual(["http://localhost:9999"]);
    expect(inspectProductionRuntime("UX LAB /ux-lab/ M7lc1UVf-VE").hits).toHaveLength(3);
  });
  it("classifies the verified Router URL parser base without allowing a localhost API", () => {
    const router = 'let l="http://localhost";i&&(l=i.location.origin!=="null"?i.location.origin:i.location.href)';
    expect(inspectProductionRuntime(router).routerParserReferences).toEqual(["http://localhost"]);
    expect(inspectProductionRuntime('fetch("http://localhost")').rejected).toEqual(["http://localhost"]);
    expect(inspectProductionRuntime(`${router};fetch("http://localhost")`).rejected).toEqual(["http://localhost"]);
  });
});
