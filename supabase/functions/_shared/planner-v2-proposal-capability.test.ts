import { describe, expect, it } from "vitest";
import {
  plannerV2ProposalCapabilities,
  isPlannerV2ApplyEnabled,
  isPlannerV2ConfirmEnabled,
  isPlannerV2PreviewEnabled,
} from "./planner-v2-proposal-capability";

const PILOT = "73f9b34c-da73-43d9-a05c-2026409cf290";
const OTHER = "2cbe9ccc-fd2a-4a15-a21b-1ee82da647b4";

describe("W8A Planner V2 independent preview/confirm capabilities", () => {
  it.each([undefined, null, "", "  ", "*", `${PILOT},*`, "not-a-uuid", `${PILOT},not-a-uuid`, `${PILOT},`, `,${PILOT}`])(
    "fails closed for invalid preview setting %s",
    (value) => expect(isPlannerV2PreviewEnabled(value, PILOT)).toBe(false),
  );

  it.each([undefined, null, "", "  ", "*", `${PILOT},*`, "not-a-uuid", `${PILOT},not-a-uuid`, `${PILOT},`, `,${PILOT}`])(
    "fails closed for invalid confirm setting %s",
    (value) => expect(isPlannerV2ConfirmEnabled(PILOT, value, PILOT)).toBe(false),
  );

  it.each([undefined, null, "", "  ", "*", `${PILOT},*`, "not-a-uuid", `${PILOT},not-a-uuid`, `${PILOT},`, `,${PILOT}`])(
    "fails closed for invalid Apply setting %s",
    (value) => expect(isPlannerV2ApplyEnabled(PILOT, value, PILOT)).toBe(false),
  );

  it("enables preview only for an exact UUID allowlist", () => {
    expect(isPlannerV2PreviewEnabled(`${OTHER}, ${PILOT}, ${PILOT}`, PILOT)).toBe(true);
    expect(isPlannerV2PreviewEnabled(`${OTHER}, ${PILOT}`, OTHER)).toBe(true);
    expect(isPlannerV2PreviewEnabled(PILOT, OTHER)).toBe(false);
  });

  it("requires preview eligibility as well as explicit confirm eligibility", () => {
    expect(isPlannerV2ConfirmEnabled(PILOT, PILOT, PILOT)).toBe(true);
    expect(isPlannerV2ConfirmEnabled(OTHER, PILOT, PILOT)).toBe(false);
    expect(isPlannerV2ConfirmEnabled(PILOT, OTHER, PILOT)).toBe(false);
  });

  it("reports preview-only authority without confirmation or Apply", () => {
    expect(plannerV2ProposalCapabilities(PILOT, undefined, undefined, PILOT)).toEqual({
      enabled: true,
      previewEnabled: true,
      confirmationEnabled: false,
      applyEnabled: false,
      productionMutationAuthority: false,
    });
  });

  it("requires preview eligibility and an exact independent Apply allowlist", () => {
    expect(isPlannerV2ApplyEnabled(PILOT, `${OTHER}, ${PILOT}, ${PILOT}`, PILOT)).toBe(true);
    expect(isPlannerV2ApplyEnabled(OTHER, PILOT, PILOT)).toBe(false);
    expect(isPlannerV2ApplyEnabled(PILOT, OTHER, PILOT)).toBe(false);
    expect(plannerV2ProposalCapabilities(PILOT, undefined, PILOT, PILOT)).toMatchObject({
      previewEnabled: true,
      confirmationEnabled: false,
      applyEnabled: true,
      productionMutationAuthority: true,
    });
  });
});
