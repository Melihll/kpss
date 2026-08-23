import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "..");

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");

const hoursArg = args.find((arg) => arg.startsWith("--hours="));
const hours = hoursArg ? Number(hoursArg.split("=")[1]) : 72;

if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
  console.error("ERROR: --hours must be an integer between 1 and 168.");
  process.exit(2);
}

const sql = `
with latest as (
  select
    a.id as allocation_id,
    a.user_id,
    a.exam_profile_id,
    a.session_id,
    a.accounting_intent,
    a.target_task_id,
    a.actual_minutes,
    a.planned_credit_minutes,
    a.intent_source,
    a.substitution_id,
    a.reason as allocation_reason,
    a.recorded_at,

    s.task_id as session_task_id,
    s.started_at,
    s.ended_at,
    s.duration_minutes,
    s.status as session_status,
    s.entry_source,
    s.session_mode,

    t.title as task_title,
    t.status as task_status,
    t.planned_date as task_planned_date,
    t.estimated_minutes as task_estimated_minutes

  from public.study_session_allocations a
  join public.study_sessions s
    on s.id = a.session_id
   and s.user_id = a.user_id
  left join public.tasks t
    on t.id = coalesce(a.target_task_id, s.task_id)
   and t.user_id = a.user_id
  where a.superseded_at is null
    and a.recorded_at >= now() - interval '${hours} hours'
  order by a.recorded_at desc
  limit 1
)
select
  case
    when not exists(select 1 from latest) then
      jsonb_build_object(
        'found', false,
        'lookback_hours', ${hours}
      )
    else (
      select jsonb_build_object(
        'found', true,
        'lookback_hours', ${hours},

        'accounting_intent', l.accounting_intent,
        'intent_source', l.intent_source,
        'actual_minutes', l.actual_minutes,
        'planned_credit_minutes', l.planned_credit_minutes,
        'allocation_reason', l.allocation_reason,
        'recorded_at', l.recorded_at,

        'session_status', l.session_status,
        'session_duration_minutes', l.duration_minutes,
        'session_started_at', l.started_at,
        'session_ended_at', l.ended_at,
        'entry_source', l.entry_source,
        'session_mode', l.session_mode,

        'has_target_task', l.target_task_id is not null,
        'session_has_task', l.session_task_id is not null,
        'target_matches_session_task',
          case
            when l.target_task_id is null then null
            else l.target_task_id = l.session_task_id
          end,

        'task_title', l.task_title,
        'task_status', l.task_status,
        'task_planned_date', l.task_planned_date,
        'task_estimated_minutes', l.task_estimated_minutes,

        'current_allocation_count', (
          select count(*)
          from public.study_session_allocations a2
          where a2.session_id = l.session_id
            and a2.user_id = l.user_id
            and a2.superseded_at is null
        ),

        'revision_events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'revision_type', pr.revision_type,
              'reason_code', pr.reason_code,
              'changed_task_count', pr.changed_task_count,
              'created_at', pr.created_at
            )
            order by pr.created_at
          )
          from public.plan_revisions pr
          where pr.user_id = l.user_id
            and pr.created_at between
              l.recorded_at - interval '1 minute'
              and l.recorded_at + interval '5 minutes'
        ), '[]'::jsonb),

        'reschedule_events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'reason', tre.reason,
              'from_date', tre.from_date,
              'to_date', tre.to_date,
              'task_title', rt.title,
              'is_same_task',
                tre.task_id = coalesce(l.target_task_id, l.session_task_id),
              'created_at', tre.created_at
            )
            order by tre.created_at
          )
          from public.task_reschedule_events tre
          left join public.tasks rt
            on rt.id = tre.task_id
           and rt.user_id = tre.user_id
          where tre.user_id = l.user_id
            and tre.created_at between
              l.recorded_at - interval '1 minute'
              and l.recorded_at + interval '5 minutes'
        ), '[]'::jsonb),

        'substitution_events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'status', ss.status,
              'source_minutes_replaced', ss.source_minutes_replaced,
              'proposed_at', ss.proposed_at,
              'applied_at', ss.applied_at
            )
            order by ss.proposed_at
          )
          from public.study_substitutions ss
          where ss.user_id = l.user_id
            and ss.replacement_session_id = l.session_id
        ), '[]'::jsonb),

        'carryover_events', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'status', tc.status,
              'remaining_minutes', tc.remaining_minutes,
              'from_date', tc.from_date,
              'to_date', tc.to_date,
              'proposed_at', tc.proposed_at,
              'applied_at', tc.applied_at
            )
            order by tc.proposed_at
          )
          from public.task_carryovers tc
          where tc.user_id = l.user_id
            and (
              tc.applied_at between
                l.recorded_at - interval '1 minute'
                and l.recorded_at + interval '5 minutes'
              or
              tc.proposed_at between
                l.recorded_at - interval '1 minute'
                and l.recorded_at + interval '5 minutes'
            )
        ), '[]'::jsonb)

      )
      from latest l
    )
  end as observer;
`;

function runSupabase(cliArgs) {
  const isWindows = process.platform === "win32";

  const command = isWindows ? "powershell.exe" : "supabase";

  const commandArgs = isWindows
    ? [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolve(process.env.APPDATA, "npm", "supabase.ps1"),
        ...cliArgs,
      ]
    : cliArgs;

  return spawnSync(command, commandArgs, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
    maxBuffer: 1024 * 1024 * 4,
  });
}

const result = runSupabase([
  "db",
  "query",
  "--linked",
  "--output-format",
  "json",
  sql,
]);

if (!result) {
  console.error("ERROR: Supabase CLI could not be started.");
  process.exit(1);
}

if (result.error) {
  console.error(`ERROR: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  if (result.stderr) {
    console.error(result.stderr.trim());
  }
  process.exit(result.status ?? 1);
}

const stdout = result.stdout ?? "";
const jsonStart = stdout.indexOf("[");
const jsonEnd = stdout.lastIndexOf("]");

if (jsonStart === -1 || jsonEnd === -1) {
  console.error("ERROR: Could not locate JSON in Supabase CLI output.");
  if (verbose) {
    console.error(stdout);
    console.error(result.stderr ?? "");
  }
  process.exit(1);
}

let rows;

try {
  rows = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
} catch (error) {
  console.error(`ERROR: Invalid JSON returned by Supabase CLI: ${error.message}`);
  process.exit(1);
}

let observer = rows?.[0]?.observer;

if (typeof observer === "string") {
  try {
    observer = JSON.parse(observer);
  } catch {
    // Keep original value; validation below will report the issue.
  }
}

if (!observer || typeof observer !== "object") {
  console.error("ERROR: Observer query returned an unexpected payload.");
  process.exit(1);
}

console.log("");
console.log("PLN-002 ACCEPTANCE OBSERVER");
console.log("===========================");

if (!observer.found) {
  console.log("");
  console.log(`No PLN-002 allocation found in the last ${observer.lookback_hours} hours.`);
  console.log("");
  console.log("RESULT: WAITING_FOR_REAL_USE");
  console.log("");
  process.exit(0);
}

const revisions = Array.isArray(observer.revision_events)
  ? observer.revision_events
  : [];

const reschedules = Array.isArray(observer.reschedule_events)
  ? observer.reschedule_events
  : [];

const substitutions = Array.isArray(observer.substitution_events)
  ? observer.substitution_events
  : [];

const carryovers = Array.isArray(observer.carryover_events)
  ? observer.carryover_events
  : [];

const hardFailures = [];
const reviews = [];

if (observer.session_status !== "completed") {
  hardFailures.push("Latest accounted session is not completed.");
}

if (observer.actual_minutes !== observer.session_duration_minutes) {
  hardFailures.push(
    "Allocation actual_minutes does not match session duration_minutes.",
  );
}

if (Number(observer.current_allocation_count) !== 1) {
  hardFailures.push(
    `Expected exactly 1 current allocation, found ${observer.current_allocation_count}.`,
  );
}

if (
  observer.planned_credit_minutes < 0 ||
  observer.planned_credit_minutes > observer.actual_minutes
) {
  hardFailures.push("Planned credit is outside the valid accounting range.");
}

if (observer.accounting_intent === "extra") {
  if (observer.has_target_task) {
    hardFailures.push("EXTRA allocation unexpectedly targets a planned task.");
  }

  if (observer.planned_credit_minutes !== 0) {
    hardFailures.push("EXTRA allocation received planned workload credit.");
  }
} else if (observer.accounting_intent === "planned") {
  if (!observer.has_target_task) {
    hardFailures.push("PLANNED allocation has no target task.");
  }

  if (observer.target_matches_session_task === false) {
    hardFailures.push(
      "PLANNED allocation target does not match the study session task.",
    );
  }
} else {
  reviews.push(
    `Accounting intent is '${observer.accounting_intent}', not planned/extra.`,
  );
}

const implicitDeviationRevisions = revisions.filter(
  (event) => event.reason_code === "study_deviation",
);

if (implicitDeviationRevisions.length > 0) {
  hardFailures.push(
    "A study_deviation plan revision appeared around study accounting.",
  );
}

const suspiciousReschedules = reschedules.filter(
  (event) => event.reason !== "carryover" && event.is_same_task !== true,
);

if (suspiciousReschedules.length > 0) {
  reviews.push(
    `${suspiciousReschedules.length} unrelated reschedule event(s) appeared near study accounting.`,
  );
}

const nonDeviationRevisions = revisions.filter(
  (event) => event.reason_code !== "study_deviation",
);

if (nonDeviationRevisions.length > 0) {
  reviews.push(
    `${nonDeviationRevisions.length} non-study_deviation plan revision(s) appeared in the observation window.`,
  );
}

console.log("");
console.log("Latest study");
console.log(`Intent:            ${String(observer.accounting_intent).toUpperCase()}`);
console.log(`Actual minutes:    ${observer.actual_minutes}`);
console.log(`Planned credit:    ${observer.planned_credit_minutes}`);
console.log(`Intent source:     ${observer.intent_source}`);
console.log(`Entry source:      ${observer.entry_source ?? "-"}`);
console.log(`Task:              ${observer.task_title ?? "(custom / no task)"}`);
console.log(`Recorded at:       ${observer.recorded_at}`);

console.log("");
console.log("Accounting");
console.log(
  `Current allocation: ${
    Number(observer.current_allocation_count) === 1 ? "OK" : "PROBLEM"
  }`,
);
console.log(
  `Actual = session:    ${
    observer.actual_minutes === observer.session_duration_minutes
      ? "YES"
      : "NO"
  }`,
);

console.log("");
console.log("Planner safety");
console.log(
  `study_deviation:     ${
    implicitDeviationRevisions.length === 0 ? "NO" : "YES"
  }`,
);
console.log(`Plan revisions:      ${revisions.length}`);
console.log(`Reschedule events:   ${reschedules.length}`);
console.log(`Substitutions:       ${substitutions.length}`);
console.log(`Carryovers:          ${carryovers.length}`);

if (verbose) {
  console.log("");
  console.log("Diagnostic details");
  console.log(
    JSON.stringify(
      {
        revisions,
        reschedules,
        substitutions,
        carryovers,
      },
      null,
      2,
    ),
  );
}

console.log("");

if (hardFailures.length > 0) {
  for (const problem of hardFailures) {
    console.log(`FAIL: ${problem}`);
  }

  for (const review of reviews) {
    console.log(`REVIEW: ${review}`);
  }

  console.log("");
  console.log("RESULT: FAIL");
  console.log("");
  process.exit(1);
}

if (reviews.length > 0) {
  for (const review of reviews) {
    console.log(`REVIEW: ${review}`);
  }

  console.log("");
  console.log("RESULT: REVIEW");
  console.log("");
  process.exit(0);
}

console.log("RESULT: PASS");
console.log("");