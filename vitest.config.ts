import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "tests/**/*.test.ts",
      "supabase/functions/planning-v2-shadow/**/*.test.ts",
      "supabase/functions/ai-coach-interpret/**/*.test.ts",
      "supabase/functions/ai-coach-plan-preview/**/*.test.ts",
      "supabase/functions/_shared/ai-coach/**/*.test.ts",
      "supabase/functions/_shared/physical-study-lifecycle.test.ts",
      "supabase/functions/_shared/canonical-planner-v2-readonly.test.ts",
    ],
  },
});
