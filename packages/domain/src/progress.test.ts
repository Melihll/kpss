import { describe, expect, it } from "vitest";
import { countTopicProgress } from "./progress";

describe("topic progress counts", () => {
  it("maps states into dashboard groups", () => {
    expect(countTopicProgress(["learned", "maintenance", "learning", "practicing", "remediation", "not_started"]))
      .toEqual({ completed: 2, inProgress: 3, remaining: 1 });
  });
});
