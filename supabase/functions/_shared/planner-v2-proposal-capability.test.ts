import { describe, expect, it } from "vitest";
import { isPlannerV2ProposalLifecycleEnabled } from "./planner-v2-proposal-capability";

describe("W6 Planner V2 default-OFF capability", () => {
  it.each([undefined, null, "", "  ", "*"])("is OFF for %s", (value) => {
    expect(isPlannerV2ProposalLifecycleEnabled(value, "profile-1")).toBe(false);
  });

  it("enables only an exact allowlisted profile", () => {
    expect(isPlannerV2ProposalLifecycleEnabled("profile-2, profile-1", "profile-1")).toBe(true);
    expect(isPlannerV2ProposalLifecycleEnabled("profile-2, profile-1", "profile-3")).toBe(false);
  });
});
