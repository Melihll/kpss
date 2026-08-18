import { describe, expect, it, vi } from "vitest";
import { createPlanningV2ShadowHandler } from "./handler.ts";

const USER_ID = "user-1";
const PROFILE_ID = "profile-1";

function userClient(options?: {
  authenticated?: boolean;
  ownsProfile?: boolean;
}) {
  const authenticated = options?.authenticated ?? true;
  const ownsProfile = options?.ownsProfile ?? true;
  const filters: Array<[string, unknown]> = [];

  const query: any = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: async () => ({
      data: ownsProfile ? { id: PROFILE_ID } : null,
      error: null,
    }),
  };

  return {
    filters,
    client: {
      auth: {
        getUser: async () => ({
          data: { user: authenticated ? { id: USER_ID } : null },
          error: authenticated ? null : { message: "invalid" },
        }),
      },
      from: vi.fn((table: string) => {
        expect(table).toBe("exam_profiles");
        return query;
      }),
    },
  };
}

function request(body: unknown, method = "POST") {
  return new Request("https://example.test/planning-v2-shadow", {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function dependencies(options?: {
  authenticated?: boolean;
  ownsProfile?: boolean;
}) {
  const auth = userClient(options);
  const serviceClient = Object.freeze({ kind: "service" });
  const runShadowDecision = vi.fn(async () => ({
    snapshotId: "snapshot-external-1",
    snapshotHash: "a".repeat(64),
    decision: "KEEP_PLAN",
    changedTaskCount: 0,
    validationValid: true,
    applyRecommended: false,
  }));

  return {
    auth,
    serviceClient,
    runShadowDecision,
    values: {
      createUserClient: vi.fn(() => auth.client),
      createServiceClient: vi.fn(() => serviceClient),
      runShadowDecision,
      currentDate: () => "2026-08-18",
    },
  };
}

describe("manual Planning V2 shadow Edge handler", () => {
  it("rejects methods other than POST without creating a client", async () => {
    const deps = dependencies();
    const handler = createPlanningV2ShadowHandler(deps.values);

    const response = await handler(request(null, "GET"));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(deps.values.createUserClient).not.toHaveBeenCalled();
  });

  it("requires authorization", async () => {
    const deps = dependencies();
    const handler = createPlanningV2ShadowHandler(deps.values);
    const response = await handler(new Request(
      "https://example.test/planning-v2-shadow",
      { method: "POST", body: "{}" },
    ));

    expect(response.status).toBe(401);
    expect(deps.values.createUserClient).not.toHaveBeenCalled();
  });

  it("does not create a service client when ownership fails", async () => {
    const deps = dependencies({ ownsProfile: false });
    const handler = createPlanningV2ShadowHandler(deps.values);

    const response = await handler(request({
      examProfileId: PROFILE_ID,
      trigger: "STUDY_DEVIATION",
    }));

    expect(response.status).toBe(403);
    expect(deps.values.createServiceClient).not.toHaveBeenCalled();
    expect(deps.runShadowDecision).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied planning payloads", async () => {
    const deps = dependencies();
    const handler = createPlanningV2ShadowHandler(deps.values);

    const response = await handler(request({
      examProfileId: PROFILE_ID,
      trigger: "STUDY_DEVIATION",
      snapshot: { existingTasks: [] },
    }));

    expect(response.status).toBe(400);
    expect(deps.values.createUserClient).not.toHaveBeenCalled();
    expect(deps.values.createServiceClient).not.toHaveBeenCalled();
  });

  it("runs a sanitized manual shadow decision after ownership verification", async () => {
    const deps = dependencies();
    const handler = createPlanningV2ShadowHandler(deps.values);

    const response = await handler(request({
      examProfileId: PROFILE_ID,
      trigger: "STUDY_DEVIATION",
      currentDate: "2026-08-18",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      shadow: true,
      snapshotId: "snapshot-external-1",
      snapshotHash: "a".repeat(64),
      decision: "KEEP_PLAN",
      changedTaskCount: 0,
      validationValid: true,
      applyRecommended: false,
    });
    expect(deps.auth.filters).toEqual([
      ["id", PROFILE_ID],
      ["user_id", USER_ID],
      ["status", "active"],
    ]);
    expect(deps.runShadowDecision).toHaveBeenCalledWith({
      client: deps.serviceClient,
      userId: USER_ID,
      examProfileId: PROFILE_ID,
      currentDate: "2026-08-18",
      trigger: "STUDY_DEVIATION",
    });
  });

  it("exposes no direct real-plan mutation surface", async () => {
    const deps = dependencies();
    const handler = createPlanningV2ShadowHandler(deps.values);
    await handler(request({
      examProfileId: PROFILE_ID,
      trigger: "CAPACITY_INCREASE",
    }));

    expect(deps.values.createServiceClient).toHaveBeenCalledOnce();
    expect(deps.runShadowDecision).toHaveBeenCalledOnce();
    expect(Object.keys(deps.serviceClient)).toEqual(["kind"]);
  });
});
