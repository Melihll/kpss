#!/usr/bin/env node
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";
import { ACCEPTANCE_EMAIL, acceptanceDates, assertLocalVideoEnvironment, fixtureId, verifyLocalAccessToken } from "./local-video-acceptance.mjs";
import { adaptPhysicalMaterialRow } from "../supabase/functions/_shared/planning.bundle.js";

const args = process.argv.slice(2);
const profileId = args[args.indexOf("--profile-id") + 1];
if (args.indexOf("--profile-id") < 0 || args.some((arg, index) => !["--apply", "--profile-id"].includes(arg) && index !== args.indexOf("--profile-id") + 1)) throw new Error("Use --profile-id UUID [--apply].");
const local = readLocalSupabaseStatus();
assertLocalVideoEnvironment(local, profileId, ACCEPTANCE_EMAIL);
const dates = acceptanceDates();
const id = (label) => fixtureId(profileId, `release-physical:${label}`);
const manifest = { profileId, ...dates, resourceId: id("book"), sectionId: id("section"), unitId: id("unit"), taskId: id("task"), planId: fixtureId(profileId, `week:${dates.weekStart}`) };
if (!args.includes("--apply")) { console.log(JSON.stringify({ mode: "DRY_RUN", manifest, writes: "none" })); process.exit(0); }
const password = process.env.KPSS_VIDEO_ACCEPTANCE_PASSWORD;
if (!password || password.length < 12) throw new Error("LOCAL acceptance password is required in the environment.");
const actor = createClient(local.url, local.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await actor.auth.signInWithPassword({ email: ACCEPTANCE_EMAIL, password });
if (login.error || !login.data.session) throw new Error("Real LOCAL Auth required before fixture writes.");
const verified = await verifyLocalAccessToken(local.url, login.data.session.access_token);
const userId = login.data.user.id;
const sql = postgres(local.dbUrl, { max: 1 });
const inserted = [], reused = [];
try {
  await sql.begin(async (tx) => {
    const owned = await tx`select id from exam_profiles where id=${profileId}::uuid and user_id=${userId}::uuid and status='active'`;
    const plan = await tx`select id from weekly_plans where id=${manifest.planId}::uuid and user_id=${userId}::uuid and exam_profile_id=${profileId}::uuid`;
    if (owned.length !== 1 || plan.length !== 1) throw new Error("Existing dedicated LOCAL profile/current plan required.");
    async function insert(table, row) {
      const found = row.id ? await tx`select * from ${tx(table)} where id=${row.id}::uuid` :
        table === "resource_progress" ? await tx`select * from resource_progress where resource_id=${row.resource_id}::uuid and user_id=${userId}::uuid` :
        await tx`select * from task_resource_units where task_id=${row.task_id}::uuid and resource_unit_id=${row.resource_unit_id}::uuid`;
      if (found.length) {
        const current = found[0];
        for (const field of ["user_id", "exam_profile_id", "resource_id", "task_id", "resource_unit_id", "resource_section_id", "weekly_plan_id", "canonical_material_view_id"]) {
          if (row[field] !== undefined && current[field] !== row[field]) throw new Error(`Fixture ownership/linkage collision in ${table}.`);
        }
        reused.push(table); return current;
      }
      const result = await tx`insert into ${tx(table)} ${tx(row)} returning *`;
      inserted.push(table); return result[0];
    }
    const ownership = { user_id: userId, exam_profile_id: profileId };
    const subjectId = "20000000-0000-0000-0000-000000000002";
    const topicId = "30000000-0000-0000-0000-000000000001";
    await insert("resources", { id: manifest.resourceId, ...ownership, subject_id: subjectId, name: "Yerel kitap kabul testi", resource_type: "book", resource_role: "primary", difficulty: "normal", status: "active" });
    const section = await insert("resource_sections", { id: manifest.sectionId, resource_id: manifest.resourceId, curriculum_node_id: topicId, name: "İlk bölüm", sort_order: 1, page_start: 1, page_end: 100, is_active: true });
    const unit = await insert("resource_units", { id: manifest.unitId, resource_id: manifest.resourceId, resource_section_id: manifest.sectionId, name: "Kaynak çalışması", unit_type: "reading", sort_order: 1, page_start: 10, page_end: 20, estimated_minutes: 20, is_active: true });
    await insert("resource_progress", { ...ownership, resource_id: manifest.resourceId, total_pages: 100, current_page: 9 });
    await insert("p48_resource_targets", { id: id("target"), ...ownership, resource_id: manifest.resourceId, planned_minutes: 20, sequence_order: 3, work_mode: "book" });
    const canonical = adaptPhysicalMaterialRow({ unit, section, progress: null, mappingProvenance: "reviewed_mapping" });
    if (!canonical.plannerEligible || canonical.sourceId !== manifest.unitId) throw new Error("Existing physical canonical adapter rejected the fixture.");
    manifest.materialViewId = canonical.id;
    await insert("tasks", { id: manifest.taskId, ...ownership, weekly_plan_id: manifest.planId, subject_id: subjectId, curriculum_node_id: topicId, resource_id: manifest.resourceId, task_type: "solve_resource_units", work_mode: "book", title: "Kitap çalışması · sayfa 10–20", description: "Kısa kaynak çalışması.", planned_date: dates.today, estimated_minutes: 20, importance: "important", priority_score: 80, status: "ready", source_reason: "planner_v2", dedupe_key: "local-release-physical", canonical_workload_identity: `physical:${manifest.unitId}`, canonical_material_view_id: canonical.id, canonical_boundary: { kind: "physical_pages", pageStart: canonical.pageStart, pageEnd: canonical.pageEnd, remainingPageStart: canonical.pageStart, remainingPageEnd: canonical.pageEnd }, planner_version: "canonical-planner-v2-shadow-v1", planner_proposal_fingerprint: "local-release-physical-v1" });
    await insert("task_resource_units", { user_id: userId, task_id: manifest.taskId, resource_unit_id: manifest.unitId, status: "pending" });
    const totals = await tx`select coalesce(sum(estimated_minutes),0)::int as minutes from tasks where weekly_plan_id=${manifest.planId}::uuid and status not in ('cancelled','missed')`;
    await tx`update weekly_plans set planned_minutes=${totals[0].minutes} where id=${manifest.planId}::uuid and user_id=${userId}::uuid`;
  });
  console.log(JSON.stringify({ mode: "APPLIED", manifest, signatureVerified: verified.signatureVerified, inserted, reused, existingProgressAndSessions: "preserved", production: "NOT DEPLOYED" }, null, 2));
} finally { await sql.end(); }
