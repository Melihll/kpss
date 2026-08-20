import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  executeAiStudyMessageV1,
  validateAiInterpretationV1,
} from "../packages/domain/src/ai-coach";

const baseInterpretation = {
  intent: "GENERAL_COACHING",
  confidence: 0.9,
  needsClarification: false,
  clarificationQuestion: null,
  effectiveDate: null,
  subjectHint: null,
  curriculumHint: null,
  reasonCode: null,
  evidence: [],
} as const;

describe("P2-09 AI material coaching contract", () => {
  it("accepts optional coaching prose at validation", () => {
    const result = validateAiInterpretationV1({
      ...baseInterpretation,
      materialCoachingSummary:
        "Video tarafındaki kalan iş yükü şu anda daha baskın.",
    });

    expect(result.status).toBe("VALID");
    if (result.status === "VALID") {
      expect(result.value.materialCoachingSummary).toContain("Video");
    }
  });

  it("rejects material prose without deterministic context", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: {
        interpretStudyMessage: async () => ({
          ...baseInterpretation,
          materialCoachingSummary:
            "Video tarafındaki kalan iş yükü daha baskın.",
        }),
      },
      input: {
        message: "Nasıl gidiyorum?",
        currentDate: "2026-08-20",
      },
    });

    expect(result.status).toBe("INVALID");
    if (result.status === "INVALID") {
      expect(result.issues[0]!.code).toBe("MATERIAL_CONTEXT_REQUIRED");
    }
  });

  it("rejects numbers absent from deterministic facts", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: {
        interpretStudyMessage: async () => ({
          ...baseInterpretation,
          materialCoachingSummary: "Videoda 99 dakika kaldı.",
        }),
      },
      input: {
        message: "Materyaller nasıl?",
        currentDate: "2026-08-20",
        materialContext: [{
          resourceName: "Tarih",
          remainingPages: 40,
          remainingVideoMinutes: 30,
          totalRemainingMinutes: 70,
          focus: "VIDEO",
        }],
      },
    });

    expect(result.status).toBe("INVALID");
    if (result.status === "INVALID") {
      expect(result.issues[0]!.code).toBe("UNSUPPORTED_MATERIAL_NUMBER");
    }
  });

  it("allows deterministic numbers and digits from the resource name", async () => {
    const result = await executeAiStudyMessageV1({
      gateway: {
        interpretStudyMessage: async () => ({
          ...baseInterpretation,
          materialCoachingSummary:
            "2026 KPSS kaynağında videoda 30 dakika kaldı.",
        }),
      },
      input: {
        message: "Materyaller nasıl?",
        currentDate: "2026-08-20",
        materialContext: [{
          resourceName: "2026 KPSS Tarih",
          remainingPages: 40,
          remainingVideoMinutes: 30,
          totalRemainingMinutes: 70,
          focus: "VIDEO",
        }],
      },
    });

    expect(result.status).toBe("VALID");
  });

  it("keeps lookup read-only and planner mutations outside P2-09", () => {
    const helper = readFileSync(
      new URL("../supabase/functions/_shared/ai-coach/material-context.ts", import.meta.url),
      "utf8",
    );
    const prompt = readFileSync(
      new URL("../packages/domain/src/ai-coach/prompt.ts", import.meta.url),
      "utf8",
    );
    const presenter = readFileSync(
      new URL("../apps/web/src/lib/ai-coach-presenter.ts", import.meta.url),
      "utf8",
    );

    expect(helper).toContain('from("p48_resource_targets")');
    expect(helper).not.toContain(".insert(");
    expect(helper).not.toContain(".update(");
    expect(helper).not.toContain(".upsert(");
    expect(helper).not.toContain(".delete(");
    expect(helper).not.toContain(".rpc(");

    expect(prompt).toContain("Never derive new material numbers");
    expect(prompt).toContain("Use the supplied focus value as authoritative");
    expect(presenter).toContain("materialCoachingSummary");
  });
});