import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";
import { repositoryRoot } from "./supabase-command.mjs";

const PILOT_PROFILE = "73f9b34c-da73-43d9-a05c-2026409cf290";
const OTHER_PROFILE = "2cbe9ccc-fd2a-4a15-a21b-1ee82da647b4";
const CONFIRM_PROFILE = "6a38d398-470a-4b6f-aa5e-0102d8660a7c";
const EDITION = "11000000-0000-0000-0000-000000000001";
const SUBJECT = "20000000-0000-0000-0000-000000000002";
const TOPIC = "30000000-0000-0000-0000-000000000001";
const { url, anonKey, serviceRoleKey } = readLocalSupabaseStatus();
if (!serviceRoleKey) throw new Error("Local Supabase service-role key is required");

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const supabaseBinary = resolve(
  repositoryRoot,
  "node_modules/supabase/bin",
  process.platform === "win32" ? "supabase.exe" : "supabase",
);

function istanbulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekRange(date) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const start = addDays(date, weekday === 0 ? -6 : 1 - weekday);
  return { start, end: addDays(start, 6) };
}

async function requireOk(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function createFixture(profileId, label) {
  const prior = await admin.from("exam_profiles").select("user_id").eq("id", profileId).maybeSingle();
  if (prior.data?.user_id) await admin.auth.admin.deleteUser(prior.data.user_id);

  const password = `Safe-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email: `w8a-${label}-${randomUUID()}@example.test`,
    password,
    email_confirm: true,
  });
  const user = await requireOk(created, `${label} user`);
  const actor = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await actor.auth.signInWithPassword({ email: user.user.email, password });
  const session = await requireOk(signedIn, `${label} session`);
  const userId = user.user.id;
  const today = istanbulToday();
  const week = weekRange(today);

  await requireOk(await actor.from("exam_profiles").insert({
    id: profileId,
    user_id: userId,
    exam_edition_id: EDITION,
    preparation_start_date: today,
    status: "active",
  }), `${label} profile`);
  await requireOk(await actor.from("user_subjects").insert({
    user_id: userId,
    exam_profile_id: profileId,
    subject_id: SUBJECT,
    status: "active",
  }), `${label} subject`);
  await requireOk(await actor.from("weekly_availability").insert(
    Array.from({ length: 7 }, (_, weekday) => ({
      user_id: userId,
      exam_profile_id: profileId,
      weekday: weekday + 1,
      start_time: "18:00",
      end_time: "19:00",
    })),
  ), `${label} availability`);
  const plan = await requireOk(await actor.from("weekly_plans").insert({
    user_id: userId,
    exam_profile_id: profileId,
    week_start_date: week.start,
    week_end_date: week.end,
    available_minutes: 420,
    planning_budget_minutes: 420,
    planned_minutes: 30,
    status: "active",
    generation_version: 1,
  }).select("id").single(), `${label} plan`);
  await requireOk(await actor.from("tasks").insert({
    user_id: userId,
    exam_profile_id: profileId,
    weekly_plan_id: plan.id,
    subject_id: SUBJECT,
    curriculum_node_id: TOPIC,
    task_type: "custom",
    title: "W8A protected current-day work",
    planned_date: today,
    estimated_minutes: 30,
    importance: "important",
    priority_score: 50,
    status: "ready",
    source_reason: "manual",
    dedupe_key: `w8a-current-day-${randomUUID()}`,
  }), `${label} protected task`);

  const resource = await requireOk(await actor.from("resources").insert({
    user_id: userId,
    exam_profile_id: profileId,
    subject_id: SUBJECT,
    name: `W8A ${label} video`,
    resource_type: "video_course",
    resource_role: "primary",
    difficulty: "normal",
    status: "active",
  }).select("id").single(), `${label} resource`);
  await requireOk(await actor.from("p48_resource_targets").insert({
    user_id: userId,
    exam_profile_id: profileId,
    resource_id: resource.id,
    planned_minutes: 60,
    sequence_order: 1,
    work_mode: "video",
  }), `${label} resource target`);
  const playlist = await requireOk(await actor.from("youtube_playlists").insert({
    user_id: userId,
    exam_profile_id: profileId,
    source_url: `https://www.youtube.com/playlist?list=w8a-${label}`,
    youtube_playlist_id: `w8a-${label}-${randomUUID()}`,
    title: `W8A ${label}`,
  }).select("id").single(), `${label} playlist`);
  await requireOk(await actor.from("topic_resource_links").insert({
    user_id: userId,
    exam_profile_id: profileId,
    curriculum_node_id: TOPIC,
    resource_id: resource.id,
    youtube_playlist_id: playlist.id,
    is_primary: true,
  }), `${label} topic resource link`);
  const video = await requireOk(await actor.from("youtube_playlist_videos").insert({
    user_id: userId,
    exam_profile_id: profileId,
    youtube_playlist_id: playlist.id,
    youtube_video_id: `w8a-${label}-${randomUUID()}`,
    title: `W8A ${label} exact video`,
    position: 1,
    duration_seconds: 1800,
  }).select("id").single(), `${label} video`);
  await requireOk(await actor.from("youtube_video_topic_links").insert({
    user_id: userId,
    exam_profile_id: profileId,
    youtube_playlist_video_id: video.id,
    curriculum_node_id: TOPIC,
    mapping_status: "validated",
    mapping_provenance: "reviewed_mapping",
  }), `${label} video mapping`);

  return {
    actor,
    userId,
    profileId,
    planId: plan.id,
    accessToken: session.session.access_token,
  };
}

async function scopedCounts(fixture) {
  const count = async (table, configure = (query) => query) => {
    const result = await configure(admin.from(table).select("*", { count: "exact", head: true }));
    if (result.error) throw result.error;
    return result.count ?? 0;
  };
  const plan = await admin.from("weekly_plans")
    .select("id,status,available_minutes,planning_budget_minutes,planned_minutes,generation_version,updated_at")
    .eq("id", fixture.planId).single();
  if (plan.error) throw plan.error;
  const scope = (query) => query.eq("user_id", fixture.userId).eq("exam_profile_id", fixture.profileId);
  return {
    tasks: await count("tasks", scope),
    taskResourceUnits: await count("task_resource_units", (query) => query.eq("user_id", fixture.userId)),
    taskProgress: await count("task_progress", (query) => query.eq("user_id", fixture.userId)),
    studySessions: await count("study_sessions", scope),
    capacityOverrides: await count("p48_daily_capacity_overrides", scope),
    lifecycleRows: await count("confirmed_action_proposals", scope),
    plan: plan.data,
  };
}

function applicationState(counts) {
  return {
    tasks: counts.tasks,
    taskResourceUnits: counts.taskResourceUnits,
    taskProgress: counts.taskProgress,
    studySessions: counts.studySessions,
    capacityOverrides: counts.capacityOverrides,
    plan: counts.plan,
  };
}

async function call(fixture, path, method = "GET", body) {
  const response = await fetch(`${url}/functions/v1/app-api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { status: response.status, payload };
}

async function callUnauthenticated(path, method = "GET", body) {
  const response = await fetch(`${url}/functions/v1/app-api${path}`, {
    method,
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

async function waitForServer(child, output) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Function server exited early: ${output.value}`);
    if (output.value.includes("Serving functions on")) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Timed out waiting for local function server: ${output.value}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5_000)),
  ]);
  if (child.exitCode === null && process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
  }
}

async function withGates(gates, test) {
  const directory = await mkdtemp(join(tmpdir(), "kpss-w8a-"));
  const envFile = join(directory, "gates.env");
  const lines = ["W8A_LOCAL_HTTP_SMOKE=1"];
  if (gates.preview !== undefined) lines.push(`PLANNER_V2_PREVIEW_V1_PROFILE_IDS=${gates.preview}`);
  if (gates.confirm !== undefined) lines.push(`PLANNER_V2_CONFIRM_V1_PROFILE_IDS=${gates.confirm}`);
  if (gates.apply !== undefined) lines.push(`PLANNER_V2_APPLY_V1_PROFILE_IDS=${gates.apply}`);
  await writeFile(envFile, `${lines.join("\n")}\n`, "utf8");
  const output = { value: "" };
  const child = spawn(supabaseBinary, ["functions", "serve", "app-api", "--env-file", envFile], {
    cwd: repositoryRoot,
    windowsHide: true,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { output.value += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output.value += chunk.toString(); });
  try {
    await waitForServer(child, output);
    await test();
  } finally {
    await stopServer(child);
    await rm(directory, { recursive: true, force: true });
  }
}

function expectStatus(result, status, code) {
  if (result.status !== status || (code && result.payload?.error?.code !== code)) {
    throw new Error(`Expected ${status}/${code ?? "any"}, got ${result.status}: ${JSON.stringify(result.payload)}`);
  }
}

function exactIdentity(value) {
  return {
    recordId: value.recordId,
    proposalId: value.proposalId,
    proposalFingerprint: value.proposalFingerprint,
    snapshotFingerprint: value.snapshotFingerprint,
    plannerVersion: value.plannerVersion,
  };
}

const pilot = await createFixture(PILOT_PROFILE, "pilot");
const other = await createFixture(OTHER_PROFILE, "other");
const confirmFixture = await createFixture(CONFIRM_PROFILE, "confirm");
const matrix = {};
let pilotPreview;
let confirmedIdentity;

await withGates({}, async () => {
  const capability = await call(pilot, "/planner-v2/capability");
  expectStatus(capability, 200);
  if (capability.payload.enabled || capability.payload.previewEnabled || capability.payload.confirmationEnabled) {
    throw new Error(`No-gate capability did not fail closed: ${JSON.stringify(capability.payload)}`);
  }
  expectStatus(await call(pilot, "/planner-v2/preview", "POST"), 403, "PLANNER_V2_PREVIEW_DISABLED");
  expectStatus(await call(pilot, "/planner-v2/confirm", "POST", {}), 403, "PLANNER_V2_CONFIRM_DISABLED");
  expectStatus(await call(pilot, "/planner-v2/apply", "POST", {}), 403, "PLANNER_V2_APPLY_DISABLED");
  matrix.noGates = "PASS";
});

await withGates({ preview: PILOT_PROFILE }, async () => {
  const before = await scopedCounts(pilot);
  const capability = await call(pilot, "/planner-v2/capability");
  expectStatus(capability, 200);
  if (!capability.payload.previewEnabled || capability.payload.confirmationEnabled || capability.payload.applyEnabled) {
    throw new Error(`Preview-only capability mismatch: ${JSON.stringify(capability.payload)}`);
  }
  const preview = await call(pilot, "/planner-v2/preview", "POST");
  pilotPreview = { ...preview.payload, confirmation: exactIdentity(preview.payload.confirmation) };
  expectStatus(preview, 201);
  if (!preview.payload.preview?.proposalFingerprint || !preview.payload.preview?.snapshotFingerprint) {
    throw new Error("Preview did not return exact proposal and snapshot fingerprints");
  }
  expectStatus(
    await call(pilot, "/planner-v2/confirm", "POST", preview.payload.confirmation),
    403,
    "PLANNER_V2_CONFIRM_DISABLED",
  );
  const otherCapability = await call(other, "/planner-v2/capability");
  expectStatus(otherCapability, 200);
  if (otherCapability.payload.enabled) throw new Error("Other profile unexpectedly received preview authority");
  expectStatus(await call(other, "/planner-v2/preview", "POST"), 403, "PLANNER_V2_PREVIEW_DISABLED");
  expectStatus(await call(other, "/planner-v2/confirm", "POST", preview.payload.confirmation), 403, "PLANNER_V2_CONFIRM_DISABLED");
  expectStatus(await call(pilot, "/planner-v2/apply", "POST", {}), 403, "PLANNER_V2_APPLY_DISABLED");
  const after = await scopedCounts(pilot);
  if (JSON.stringify(applicationState(after)) !== JSON.stringify(applicationState(before))) {
    throw new Error(`Preview mutated application state: ${JSON.stringify({ before, after })}`);
  }
  if (after.lifecycleRows !== before.lifecycleRows + 1) {
    throw new Error(`Preview lifecycle delta must be exactly one: ${before.lifecycleRows} -> ${after.lifecycleRows}`);
  }
  matrix.previewOnly = {
    status: "PASS",
    lifecycleDelta: 1,
    applicationMutationDelta: 0,
    scheduledItems: preview.payload.preview.days.reduce((sum, day) => sum + day.items.length, 0),
    blockedDemand: preview.payload.preview.blocked.length,
  };
  matrix.otherProfile = "PASS";
});

await withGates({ preview: PILOT_PROFILE, apply: PILOT_PROFILE }, async () => {
  const capability = await call(pilot, "/planner-v2/capability");
  expectStatus(capability, 200);
  if (!capability.payload.previewEnabled || !capability.payload.applyEnabled || capability.payload.confirmationEnabled) {
    throw new Error(`Apply capability mismatch: ${JSON.stringify(capability.payload)}`);
  }
  expectStatus(
    await call(pilot, "/planner-v2/apply", "POST", pilotPreview.confirmation),
    409,
    "PLANNER_V2_EXPLICIT_CONFIRMATION_REQUIRED",
  );
  expectStatus(await callUnauthenticated("/planner-v2/apply", "POST", pilotPreview.confirmation), 401);
  matrix.applyPreviewedDenied = "PASS";
  matrix.applyUnauthenticatedDenied = "PASS";
});

const incidentCreated = await requireOk(await admin.from("confirmed_action_proposals")
  .select("created_at")
  .eq("id", pilotPreview.confirmation.recordId)
  .single(), "incident fixture creation time");
await requireOk(await admin.from("confirmed_action_proposals")
  .update({ expires_at: new Date(new Date(incidentCreated.created_at).getTime() + 100).toISOString() })
  .eq("id", pilotPreview.confirmation.recordId), "expire incident fixture");

await withGates({ preview: PILOT_PROFILE, confirm: PILOT_PROFILE }, async () => {
  const before = await scopedCounts(pilot);
  const expired = await call(pilot, "/planner-v2/confirm", "POST", pilotPreview.confirmation);
  expectStatus(expired, 409, "ACTION_PROPOSAL_EXPIRED");
  const row = await requireOk(await admin.from("confirmed_action_proposals")
    .select("status,confirmed_at")
    .eq("id", pilotPreview.confirmation.recordId)
    .single(), "expired incident row");
  if (row.status !== "expired" || row.confirmed_at !== null) {
    throw new Error(`Expired confirmation was falsely persisted: ${JSON.stringify(row)}`);
  }
  const after = await scopedCounts(pilot);
  if (JSON.stringify(applicationState(after)) !== JSON.stringify(applicationState(before))) {
    throw new Error("Expired confirmation mutated application state");
  }
  matrix.expiredConfirmRegression = { status: "PASS", confirmedAt: null, applicationMutationDelta: 0 };
});

await withGates({ preview: CONFIRM_PROFILE, confirm: CONFIRM_PROFILE }, async () => {
  const before = await scopedCounts(confirmFixture);
  const capability = await call(confirmFixture, "/planner-v2/capability");
  expectStatus(capability, 200);
  if (!capability.payload.previewEnabled || !capability.payload.confirmationEnabled || capability.payload.applyEnabled) {
    throw new Error(`Preview+confirm capability mismatch: ${JSON.stringify(capability.payload)}`);
  }
  const preview = await call(confirmFixture, "/planner-v2/preview", "POST");
  expectStatus(preview, 201);
  const previewIdentity = exactIdentity(preview.payload.confirmation);
  expectStatus(await call(confirmFixture, "/planner-v2/confirm", "POST", {
    ...previewIdentity,
    proposalFingerprint: `${previewIdentity.proposalFingerprint}-wrong`,
  }), 409, "PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  expectStatus(await call(confirmFixture, "/planner-v2/confirm", "POST", {
    ...previewIdentity,
    proposalId: `${previewIdentity.proposalId}-wrong`,
  }), 409, "PLANNER_V2_CONFIRMATION_IDENTITY_MISMATCH");
  const confirmed = await call(confirmFixture, "/planner-v2/confirm", "POST", previewIdentity);
  expectStatus(confirmed, 200);
  if (confirmed.payload.confirmation?.state !== "confirmed") {
    throw new Error(`Exact confirmation did not succeed: ${JSON.stringify(confirmed.payload)}`);
  }
  confirmedIdentity = previewIdentity;
  const after = await scopedCounts(confirmFixture);
  if (JSON.stringify(applicationState(after)) !== JSON.stringify(applicationState(before))) {
    throw new Error(`Confirmation mutated application state: ${JSON.stringify({ before, after })}`);
  }
  matrix.previewAndConfirmTestProfile = { status: "PASS", applicationMutationDelta: 0 };
  matrix.wrongFingerprint = "PASS";
  matrix.wrongProposal = "PASS";
});

await withGates({ preview: CONFIRM_PROFILE, apply: CONFIRM_PROFILE }, async () => {
  const before = await scopedCounts(confirmFixture);
  expectStatus(await call(confirmFixture, "/planner-v2/apply", "POST", {
    ...confirmedIdentity,
    actorUserId: confirmFixture.userId,
  }), 400, "PLANNER_V2_CLIENT_AUTHORITY_REFUSED");
  const applied = await call(confirmFixture, "/planner-v2/apply", "POST", confirmedIdentity);
  expectStatus(applied, 200);
  if (applied.payload.application?.state !== "applied" || applied.payload.application?.applied !== true) {
    throw new Error(`Exact Apply did not succeed: ${JSON.stringify(applied.payload)}`);
  }
  const after = await scopedCounts(confirmFixture);
  if (after.tasks <= before.tasks || after.lifecycleRows !== before.lifecycleRows) {
    throw new Error(`Apply mutation scope mismatch: ${JSON.stringify({ before, after })}`);
  }
  const replay = await call(confirmFixture, "/planner-v2/apply", "POST", confirmedIdentity);
  expectStatus(replay, 200);
  if (replay.payload.application?.idempotent !== true) {
    throw new Error(`Apply replay was not idempotent: ${JSON.stringify(replay.payload)}`);
  }
  const afterReplay = await scopedCounts(confirmFixture);
  if (JSON.stringify(applicationState(afterReplay)) !== JSON.stringify(applicationState(after))) {
    throw new Error("Idempotent replay changed application state");
  }
  matrix.applyExactConfirmed = {
    status: "PASS",
    createdTasks: after.tasks - before.tasks,
    replayIdempotent: true,
    clientActorRefused: true,
  };
});

await withGates({ preview: `${CONFIRM_PROFILE},${OTHER_PROFILE}`, apply: `${CONFIRM_PROFILE},${OTHER_PROFILE}` }, async () => {
  expectStatus(await call(other, "/planner-v2/apply", "POST", confirmedIdentity), 404, "PLANNER_V2_PROPOSAL_NOT_FOUND");
  matrix.applyWrongOwnerProfileDenied = "PASS";
});

await withGates({ preview: `${PILOT_PROFILE},*`, confirm: "not-a-uuid", apply: "*" }, async () => {
  const capability = await call(pilot, "/planner-v2/capability");
  expectStatus(capability, 200);
  if (capability.payload.enabled || capability.payload.previewEnabled || capability.payload.confirmationEnabled || capability.payload.applyEnabled) {
    throw new Error(`Invalid/wildcard settings did not fail closed: ${JSON.stringify(capability.payload)}`);
  }
  expectStatus(await call(pilot, "/planner-v2/preview", "POST"), 403, "PLANNER_V2_PREVIEW_DISABLED");
  matrix.invalidSettings = "PASS";
});

await withGates({ preview: `${PILOT_PROFILE},` }, async () => {
  const capability = await call(pilot, "/planner-v2/capability");
  expectStatus(capability, 200);
  if (capability.payload.enabled || capability.payload.previewEnabled || capability.payload.confirmationEnabled) {
    throw new Error(`Empty allowlist entry did not fail closed: ${JSON.stringify(capability.payload)}`);
  }
  expectStatus(await call(pilot, "/planner-v2/preview", "POST"), 403, "PLANNER_V2_PREVIEW_DISABLED");
  matrix.emptyEntrySetting = "PASS";
});

console.log(JSON.stringify({
  W8A_PREVIEW_ONLY_HTTP_SMOKE: "PASS",
  profiles: { pilot: PILOT_PROFILE, other: OTHER_PROFILE, confirmTest: CONFIRM_PROFILE },
  matrix,
  applyHttpRoute: "PRESENT_DEFAULT_OFF",
  productionMutationAuthority: "EXACT_LOCAL_TEST_PROFILE_ONLY",
}, null, 2));
