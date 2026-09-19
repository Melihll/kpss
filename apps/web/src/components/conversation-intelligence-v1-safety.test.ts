import fs from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "CoachDrawer bounded conversation V1 safety",
  () => {
    it(
      "keeps only three in-memory exchanges and sends bounded context",
      () => {
        const drawer =
          fs.readFileSync(
            "apps/web/src/components/CoachDrawer.tsx",
            "utf8",
          );

        const api =
          fs.readFileSync(
            "apps/web/src/lib/ai-coach-api.ts",
            "utf8",
          );

        expect(drawer)
          .toContain(
            "buildReactiveConversationContext",
          );

        expect(drawer)
          .toContain(
            ".slice(-3)",
          );

        expect(drawer)
          .toContain(
            "COACH_CONVERSATION_MAX_TURNS_V1",
          );

        expect(api)
          .toContain(
            "{ conversation }",
          );

        expect(drawer)
          .not.toContain(
            "localStorage",
          );

        expect(drawer)
          .not.toContain(
            "sessionStorage",
          );

        expect(api)
          .not.toContain(
            "conversation_history",
          );
      },
    );
  },
);
