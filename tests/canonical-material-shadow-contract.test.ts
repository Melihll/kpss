import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MAT-001 canonical shadow isolation contract", () => {
  const appApi = readFileSync(
    resolve(process.cwd(), "supabase/functions/app-api/index.ts"),
    "utf8",
  );

  it("does not replace the production material workload path yet", () => {
    expect(appApi).not.toContain("canonical-material-shadow");
    expect(appApi).not.toContain("loadMaterialWorkloadShadow");
  });
});
