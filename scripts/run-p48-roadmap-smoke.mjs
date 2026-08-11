import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readLocalSupabaseStatus } from "./supabase-status.mjs";

const EDITION = "11000000-0000-0000-0000-000000000001";
const { url, anonKey } = readLocalSupabaseStatus();
const api = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const id = randomUUID();
const sign = await api.auth.signUp({ email: `p48-roadmap-${id}@example.test`, password: `Safe-${id}` });
if (sign.error) throw sign.error;
const user = sign.data.user.id;
const token = sign.data.session.access_token;
const profile = await api.from("exam_profiles").insert({
  user_id: user,
  exam_edition_id: EDITION,
  preparation_start_date: "2026-08-11",
  target_exam_date: "2027-09-06",
  status: "active",
}).select("id").single();
if (profile.error) throw profile.error;

const base = `${url}/functions/v1/app-api`;
async function http(path, { method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const before = await http("/p48/roadmap");
if (before.configured !== false) throw new Error("fresh profile should not be configured");
const boot = await http("/p48/bootstrap", { method: "POST" });
const roadmap = boot.roadmap;
if (!roadmap?.configured) throw new Error("P48 bootstrap failed");
if (roadmap.strategy.scoreType !== "KPSSP48") throw new Error("score type failed");
if (roadmap.strategy.targetExamDate !== "2027-09-06") throw new Error("target date failed");
if (roadmap.strategy.weeklyTargetMinutes !== 1800 || roadmap.strategy.monthlyTargetMinutes !== 7200) throw new Error("30h/120h target failed");
const subjectBudget = (roadmap.subjects ?? []).reduce((sum, subject) => sum + Number(subject.weeklyMinutes ?? 0), 0);
if (subjectBudget !== 1800) throw new Error(`subject budget should equal 1800, got ${subjectBudget}`);
if (roadmap.resourcesSummary.count !== 26) throw new Error(`resource catalog expected 26, got ${roadmap.resourcesSummary.count}`);
if (!(roadmap.subjectForecasts ?? []).every((subject) => subject.newSourceDate && subject.newSourceDate < roadmap.strategy.targetExamDate)) {
  throw new Error(`initial source pool should finish before exam: ${JSON.stringify(roadmap.subjectForecasts?.map((subject) => ({ subject: subject.subjectName, newSourceDate: subject.newSourceDate })))}`);
}
if (!roadmap.periods.some((period) => period.name.includes("Vize")) || !roadmap.periods.some((period) => period.name.includes("Final"))) throw new Error("academic gaps missing");
const jan = roadmap.months.find((month) => month.month === "2027-01");
if (!jan || jan.blockedDays < 14 || jan.plannedMinutes >= 7200) throw new Error(`final month capacity failed: ${JSON.stringify(jan)}`);
if (!roadmap.milestones.some((milestone) => milestone.type === "new_resource")) throw new Error("new resource milestone missing");
if (!roadmap.milestones.some((milestone) => milestone.type === "source_gap" && milestone.title.includes("Vatandaşlık"))) throw new Error("citizenship source gap missing");

const { data: availability, error: availabilityError } = await api.from("weekly_availability").select("weekday,start_time,end_time").eq("exam_profile_id", profile.data.id);
if (availabilityError) throw availabilityError;
const total = (availability ?? []).reduce((sum, row) => {
  const [sh, sm] = row.start_time.split(":").map(Number);
  const [eh, em] = row.end_time.split(":").map(Number);
  return sum + (eh * 60 + em - sh * 60 - sm);
}, 0);
if (total !== 1800) throw new Error(`availability should equal 1800, got ${total}`);

const current = await http("/weekly-plan/current");
if (current.plan && !current.tasks.some((task) => task.resource_id)) throw new Error("generated week does not use real resources");

console.log(JSON.stringify({
  P48_ROADMAP_SMOKE: "PASS",
  targetExamDate: roadmap.strategy.targetExamDate,
  weeklyTargetMinutes: roadmap.strategy.weeklyTargetMinutes,
  monthlyTargetMinutes: roadmap.strategy.monthlyTargetMinutes,
  resourceCount: roadmap.resourcesSummary.count,
  subjectBudgetMinutes: subjectBudget,
  academicGapCount: roadmap.periods.length,
  januaryPlannedMinutes: jan.plannedMinutes,
  newResourceMilestones: roadmap.milestones.filter((item) => item.type === "new_resource").length,
  weeklyAvailabilityMinutes: total,
  currentWeekTaskCount: current.tasks.length,
  currentWeekUsesRealResources: current.tasks.length ? current.tasks.some((task) => task.resource_id) : null,
}, null, 2));
