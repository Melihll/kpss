import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("full frontend LOCAL acceptance isolation", () => {
  it("guards physical fixture auth/ownership before writes and defaults to dry-run", () => {
    const source = readFileSync("scripts/setup-local-frontend-acceptance-fixture.mjs", "utf8");
    expect(source.indexOf("assertLocalVideoEnvironment(local")).toBeLessThan(source.indexOf("const sql = postgres"));
    expect(source).toContain('if (!args.includes("--apply"))');
    expect(source).toContain("verifyLocalAccessToken");
    expect(source).toContain("Fixture ownership/linkage collision");
    expect(source).toContain('kind: "physical_pages"');
    expect(source).not.toMatch(/update\s+(?:auth\.users|study_sessions|youtube_video_progress)/i);
  });
  it("limits proxy injection to one explicit local progress stream without credential logs", () => {
    const source = readFileSync("scripts/local-frontend-acceptance-proxy.mjs", "utf8");
    expect(source).toContain("assertLocalVideoEnvironment(local");
    expect(source).toContain('server.listen(54323, "127.0.0.1"');
    expect(source).toContain('request.method === "PUT"');
    expect(source).toContain("/youtube-videos/${videoId}/progress");
    expect(source).not.toMatch(/console\.log\((?:body|headers|request)/);
  });
});
