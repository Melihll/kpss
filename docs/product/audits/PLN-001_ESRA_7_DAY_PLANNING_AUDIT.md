# PLN-001 — Sanitized 7-Day Planning Reality Audit

Status: Complete

Audit class: Read-only production investigation; sanitized product evidence

Audit window: 2026-08-16 through the 2026-08-22 snapshot, TRT (`Europe/Istanbul`)

Subject: `USER_A` / `PROFILE_A`

## 1. Executive summary

This audit confirms a historical P0 semantic failure: completed study—whether on the original day's task, ahead of schedule, or explicitly manual—was treated as capacity consumption and immediately passed to an automatic apply path. Applied `STUDY_DEVIATION` revisions could then move or backlog unrelated work without explicit substitution intent.

Two sanitized causal chains establish the risk:

- A 40-minute manual Mathematics session was followed by an applied revision that backlogged a 75-minute Finance task.
- A 58-minute Turkish session performed ahead of its original plan date was followed by an applied revision that backlogged 75 minutes of Finance and 70 minutes of Law.

These are not timestamp-only inferences. In each case the session completion, synchronous historical recalculation path, revision reason, before/after totals, and changed-task payload align with no intervening eligible event.

The reported Turkish-versus-Geography concern is not supported in this window. Geography moved during the first global reshuffle, which followed planned Mathematics study. An ahead-of-plan Turkish session later produced a zero-change revision; later Turkish-linked changes affected Turkish, Finance, and Law—not Geography.

The original Mon–Sat plan contained 25 blocks and 1,500 minutes. At snapshot, 770 minutes were creditable to those tasks (51.3%). Eleven of 25 tasks had progress at or above estimate, yet none had status `completed`. The full 1,785-minute Mon–Sun baseline had 944 credited minutes at the still-in-progress Saturday snapshot (52.9%).

Completed-session accounting stored 1,149 minutes. Overlapping intervals inflated exact clock time by 139.2 minutes; de-overlapped clock time was 1,024.3 minutes. Historical per-task duration calibration is therefore provisional.

The imported plan was fragmented across four subjects and three planned switches on each weekday, and five subjects/four switches on Saturday. Three 30-minute blocks were explicitly new-topic work combining video and notes. Current domain code has topic states and resource roles, but production tasks mixed learning, video, notes, and questions in prose. The Mathematics instruction video had no planning target and no task reference at snapshot.

Current P0 protections now route study completion through preview-only behavior and report that no plan mutation was applied. No later applied revision appeared after that protection was active. This mitigates the historical automatic-apply mechanism but does not solve the missing Planned/Extra/Substitution/Carryover semantics. `PLN-002` is the recommended next task.

## 2. Audit method and data sources

### Privacy treatment

This Git-tracked artifact retains product conclusions, aggregate measurements, causal event shapes, and neutral evidence IDs. It intentionally omits production account/profile IDs, task/session/resource IDs, project references, row fingerprints, exact private activity timestamps, and the full personal activity ledger.

### Method

- Production investigation used read-only queries only.
- No plan, task, session, capacity, resource progress, migration, deployment, repair, or secret was changed.
- No Planner Apply, capacity Apply, Quick Task, coach Apply, or synthetic activity was invoked.
- The original commitment was reconstructed from the canonical import artifact, not the mutable remaining-plan field.
- Historical facts are separated from inference. Missing historical state is labeled `UNKNOWN / NOT RECORDED`.
- Before/after production integrity was checked locally across 21 relevant datasets. Counts and fingerprints matched; sensitive fingerprint values are intentionally excluded here.

### Evidence categories

| Evidence category | Product use |
| --- | --- |
| Plan/task/progress snapshots | Original commitment, mutable placement, estimates, and completion state |
| Completed study intervals | Actual minutes, entry mode, task linkage, manual work, and overlap detection |
| Plan revisions and reschedule history | Applied revision order, moves, backlog actions, and remaining-plan totals |
| Capacity overrides and exceptions | Effective daily capacity and the one recorded capacity adjustment |
| Resource catalog, targets, and task links | Resource roles/types, sequence targets, and actual plan use |
| Action/proposal records | Search for explicit Quick Task, coach, recalculate, or confirmation intent |
| [Canonical Week 1 import](../../esra_kpss_p48_foundation_week1_v2_canonical_2026-08-17.json) | Original dates, ordering, descriptions, and 1,785-minute commitment |
| Current domain and Edge code | Current semantic model and preview-only protections |
| Git history at `fb0f938` | Historical study-finish apply path changed to preview-only |

### Capacity baseline

The week had 1,800 gross minutes, 15 reserve minutes, and a 1,785-minute planning budget. Daily overrides were 240 minutes on Aug 17–21 and 300 on Aug 22. Aug 23 had 300 gross minutes with a 15-minute reserve. One user-origin capacity exception added 60 minutes to Aug 17. No weekly-availability or calendar-period record existed.

The snapshot plan's `available_minutes` represented computed planning availability after reserve and the exception, not the original gross override. This is a reporting-semantic ambiguity, not a second capacity change.

## 3. Daily reconstruction

`Credited` is progress capped at each original task estimate. `Recorded` uses stored session-duration minutes. `Clock` is the union of overlapping session intervals within each Istanbul day. Actual blocks are completed session records.

| Day | Effective capacity | Original blocks / minutes | Credited | Recorded / de-overlapped clock | Actual blocks / subjects / switches | Applied revision outcome | Snapshot backlog from original-day tasks |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Aug 16 | `UNKNOWN / NOT RECORDED` | 0 / 0 | 0 | 0 / 0 | 0 / 0 / 0 | None; plan not yet recorded | 0 / 0 |
| Aug 17 | 300 | 4 / 240 | 160 | 284 / 217.8 | 8 / 2 / 1 | 8 revisions; first moved 22 tasks | 0 / 0 |
| Aug 18 | 240 | 4 / 240 | 140 | 245 / 224.0 | 7 / 2 / 1 | 6 revisions; 1 backlog + 1 move | 1 / 70 |
| Aug 19 | 240 | 4 / 240 | 75 | 117 / 119.2 | 4 / 1 / 0 | 4 revisions; 1 backlog | 2 / 135 |
| Aug 20 | 240 | 4 / 240 | 200 | 228 / 184.7 | 5 / 2 / 2 | 4 revisions; 2 backlogs | 0 / 0 |
| Aug 21 | 240 | 4 / 240 | 120 | 171 / 172.5 | 5 / 2 / 1 | 1 zero-change revision | 0 / 0 |
| Aug 22 | 300 | 5 / 300 | 75 | 104 / 106.1 | 1 / 1 / 0 | No revision through cutoff | 1 / 75 |

Small positive differences between stored minutes and interval time are integer rounding. Material overlap was present on three days.

### Sanitized day narratives

- **Aug 16:** no plan, capacity, task, session, or revision evidence. End state is `UNKNOWN / NOT RECORDED`.
- **Aug 17:** the plan was imported and capacity increased by 60 minutes. Planned Mathematics study triggered an automatic global reshuffle of 22 tasks, including both Geography moves. Later early work and overlapping Mathematics sessions produced additional zero-change revisions. Exact midnight task status is `UNKNOWN / NOT RECORDED`.
- **Aug 18:** Mathematics study caused a 60-minute Economics task to enter backlog. A 50-minute Turkish block done ahead of its original date produced no task change. Later Turkish study moved another Turkish task; Geography did not change. A cross-surface overlap inflated one Turkish task to 155 actual minutes against a 50-minute estimate.
- **Aug 19:** an explicit taskless manual Mathematics session caused a 75-minute Finance task to enter backlog. Subsequent Mathematics timer fragments produced no further task changes.
- **Aug 20:** a Turkish task originally due later in the week completed early. Its automatic revision credited 55 minutes and backlogged 145 minutes across Finance and Law. Later activity produced zero-change revisions. A separate overlap affected Turkish sessions.
- **Aug 21:** the first Mathematics session produced the last recorded zero-change applied revision. Later Mathematics and Accounting activity produced no applied revision, consistent with preview-only protection.
- **Aug 22:** one Mathematics session was recorded. No applied revision followed before the snapshot. The day was incomplete, so no end-of-day state exists.

### Original commitment summary by day

| Original day | Subjects | Planned block minutes | Snapshot credited | Snapshot backlog |
| --- | --- | --- | ---: | ---: |
| Aug 17 | Mathematics, Economics, Turkish, History | 90, 70, 50, 30 | 160 | 0 |
| Aug 18 | Mathematics, Law, Turkish, Geography | 90, 70, 50, 30 | 140 | Law 70 |
| Aug 19 | Mathematics, Finance, Economics, History | 75, 75, 60, 30 | 75 | Finance 75 + Economics 60 |
| Aug 20 | Mathematics, Accounting, Turkish, Geography | 75, 75, 50, 40 | 200 | 0 |
| Aug 21 | Mathematics, Economics, Law, Turkish | 75, 60, 60, 45 | 120 | 0 |
| Aug 22 | Mathematics, Finance, Accounting, History, Geography | 75, 75, 70, 40, 40 | 75 | Finance 75 |

No Quick Task, confirmed action, coach apply, or candidate-planning proposal was recorded. All baseline tasks lacked an explicit carryover link. Manual/retroactive evidence consisted of one 40-minute taskless session and task-linked work performed on dates other than the original commitment; the current schema cannot reliably label the latter as Extra Study.

## 4. Extra-study causality analysis

### Classification rule

An event is `PROVEN_CAUSAL` only when the completed session, synchronous historical recalculate/apply path, `STUDY_DEVIATION` revision, before/after state, and affected-task payload align with no intervening eligible event. `CORRELATED_ONLY` means sequence exists but the stored trace is insufficient. `NO_EFFECT` means the immediate revision changed no task. `INSUFFICIENT_EVIDENCE` covers ambiguous intent or missing history.

### Sanitized causal chains

| Evidence | Observed study event | Planner/system action | Affected work | Classification |
| --- | --- | --- | --- | --- |
| OBS-002 | 50-minute Turkish task studied ahead of original date | Automatic revision consumed/credited 50 minutes; changed tasks 0 | Geography unchanged | `NO_EFFECT` for movement; `PROVEN_CAUSAL` for capacity consumption and revision |
| OBS-003 | 55-minute Turkish task completion | Automatic revision credited the task and moved one Turkish task later | Turkish only; Geography unchanged | `PROVEN_CAUSAL`; intent as Extra Study not recorded |
| OBS-004 | 40-minute taskless manual Mathematics session | Automatic revision changed one task | 75-minute Finance task → backlog | `PROVEN_CAUSAL` |
| OBS-005 | 58-minute Turkish task completed ahead of original date | Automatic revision credited 55 minutes and changed two tasks | Finance 75 + Law 70 → backlog | `PROVEN_CAUSAL` for backlog; Extra Study intent is `INSUFFICIENT_EVIDENCE` |

The manual-session revision removed 75 remaining-plan minutes even though the session was 40 minutes because the selected Finance task lost its date. The early-Turkish revision reduced remaining plan by 200 minutes: 55 credited minutes plus 145 backlogged minutes. This proves that the mutable remaining-plan total is not a stable approved-plan denominator.

### Turkish versus Geography conclusion

The specific claim that extra Turkish reduced Geography is disproved for this audit window. Both Geography moves belonged to OBS-001, the first global reshuffle after planned Mathematics study. The ahead-of-plan Turkish event in OBS-002 changed no task. Later Turkish-linked actions affected Turkish, Finance, and Law.

## 5. Block-duration analysis

### Original planned blocks

| Duration | Count | Share |
| --- | ---: | ---: |
| `<20` | 0 | 0% |
| `20–29` | 0 | 0% |
| `30–44` | 6 | 24% |
| `45–59` | 4 | 16% |
| `60–89` | 13 | 52% |
| `90+` | 2 | 8% |

### Completed session records

| Duration | Count |
| --- | ---: |
| `<20` | 7 |
| `20–29` | 4 |
| `30–44` | 7 |
| `45–59` | 8 |
| `60–89` | 3 |
| `90+` | 1 |

Session records are timer fragments, not necessarily pedagogical blocks. Multiple short records sometimes accumulated into one planned task.

### Every planned block at or below 30 minutes

| Evidence | Subject / activity | Est. / actual | Structured representation | Audit interpretation |
| --- | --- | ---: | --- | --- |
| OBS-007A | History new topic | 30 / 0 | `learn_topic`, notes; 20-minute video + 10-minute notes | First exposure, not review |
| OBS-007B | Geography new topic | 30 / 0 | `learn_topic`, notes; 20-minute video + 10-minute mapped notes | First exposure, not review |
| OBS-007C | History new topic | 30 / 0 | `learn_topic`, notes; 20-minute video + 10-minute notes | First exposure, not review |

All three short planned blocks look like first-exposure learning. The audit proves that the imported plan accepted 30-minute new-topic blocks; it does not prove a universal pedagogical minimum or learning harm. H2 is partially confirmed.

## 6. Resource and study-flow analysis

### Resource use by subject

| Subject | Available resource pattern | Week 1 task use |
| --- | --- | --- |
| Mathematics | Primary question bank; reinforcement question bank; primary İlyas Güneş video course | 7 tasks / 550 min used primary question bank; other two unused |
| Turkish | Primary and reinforcement question banks | 5 / 250 used primary |
| Geography | Primary video notes and primary question bank | 3 / 110 used notes; 1 / 50 used question bank |
| History | Primary notes and primary question bank | 3 / 100 used notes; 1 / 45 used question bank |
| Economics | Primary instruction resources and reinforcement question banks | 3 / 190 used instruction; 1 / 65 used questions |
| Finance | Primary instruction and reinforcement questions | 2 / 150 used instruction |
| Accounting | Primary instruction and reinforcement questions | 2 / 145 used instruction |
| Law | Multiple primary instruction resources and reinforcement question banks | 2 / 130 used constitutional instruction |

### Mathematics resource roles

| Neutral reference | Resource | Production type | Production role | Planning target / sequence | Week 1 use |
| --- | --- | --- | --- | --- | --- |
| `RESOURCE_A` | Yediiklim Mathematics Question Bank | `question_bank` | `primary` | questions / sequence 1 | 7 tasks, 550 min |
| `RESOURCE_B` | Yargı Plus Mathematics Question Bank | `question_bank` | `reinforcement` | questions / sequence 2 | 0 tasks |
| `RESOURCE_C` | İlyas Güneş Mathematics Video Course | `video_course` | `primary` | no target/sequence | 0 tasks |

The two question banks have an explicit target-level sequence, so the claim that no sequencing rule exists is disproved at that level. The rule does not establish a prerequisite that instruction must precede questions. The video course had neither a planning target nor a Week 1 task reference and was absent from planning decisions at snapshot.

Current V0 resource choice is deterministic when eligible mappings exist: role rank, section order, then stable resource order select one candidate ([engine.ts](../../../packages/domain/src/planning/engine.ts#L67)). It emits separate learn and mapped-resource candidates ([engine.ts](../../../packages/domain/src/planning/engine.ts#L111)), but placement does not encode a durable prerequisite between them ([engine.ts](../../../packages/domain/src/planning/engine.ts#L160)). Imported tasks also placed video instructions in prose while linking notes or question banks. Resource behavior is deterministic for mapped practice, ambiguous in mixed imports, and absent for an unmapped instruction video.

## 7. Fragmentation analysis

| Day | Planned blocks / subjects / switches | Shortest / median / longest planned | Actual records / subjects / switches | Observation |
| --- | ---: | ---: | ---: | --- |
| Aug 16 | 0 / 0 / 0 | — | 0 / 0 / 0 | No plan recorded |
| Aug 17 | 4 / 4 / 3 | 30 / 60 / 90 | 8 / 2 / 1 | Planned high switching; timer fragmentation |
| Aug 18 | 4 / 4 / 3 | 30 / 60 / 90 | 7 / 2 / 1 | Planned high switching; overlap |
| Aug 19 | 4 / 4 / 3 | 30 / 67.5 / 75 | 4 / 1 / 0 | Actual work stayed in one subject |
| Aug 20 | 4 / 4 / 3 | 40 / 62.5 / 75 | 5 / 2 / 2 | Repeated subject return; overlap |
| Aug 21 | 4 / 4 / 3 | 45 / 60 / 75 | 5 / 2 / 1 | Timer fragmentation; mostly continuous |
| Aug 22 | 5 / 5 / 4 | 40 / 70 / 75 | 1 / 1 / 0 | Highest planned switching; day incomplete |

The imported production plan alternated subjects every block. Its tasks were baseline imports, so this audit does not claim that the current runtime builder generated the exact order. The current builder independently tracks `previousSubject` and prefers a different subject for the next candidate ([roadmap.ts](../../../packages/domain/src/p48/roadmap.ts#L327)), showing that the same tendency remains possible.

The baseline had 25 blocks and 19 planned switches over six planned days. Actual study had five subject switches because `USER_A` usually stayed with one or two subjects and split timers within them. No universal fragmentation threshold is asserted; the observed gap supports PLN-006.

## 8. Sanitized revision timeline

All 23 historical revisions were automatic, reason `STUDY_DEVIATION`, and had no recorded explicit user confirmation. Five revisions changed tasks; the rest only updated remaining-plan/accounting state.

| Date | Revision count | Study trigger class | Before→after remaining minutes | Material task actions |
| --- | ---: | --- | ---: | --- |
| Aug 17 | 8 | Planned and ahead-of-date task-linked study | 1,785→1,501 | First revision moved 22 tasks across the week |
| Aug 18 | 6 | Mathematics and Turkish study | 1,501→1,251 | Economics 60 → backlog; Turkish task moved later |
| Aug 19 | 4 | Manual Mathematics + planned Mathematics | 1,251→1,101 | Finance 75 → backlog |
| Aug 20 | 4 | Early Turkish + Economics/Turkish study | 1,101→786 | Finance 75 + Law 70 → backlog |
| Aug 21 | 1 | Mathematics study | 786→748 | No task change |
| Aug 22 | 0 | Mathematics study | unchanged | No applied revision |

The first revision's 22 moves included both Geography tasks, several future tasks pulled earlier, and multiple tasks pushed later. The later date-move event affected Turkish only. Across the window there were 23 planner-generated date changes and four backlog actions totaling 280 minutes. Earlier backlog transitions lacked dedicated transition records; immutable revision payloads preserved their task references.

No explicit manual recalculate, Quick Task apply, coach apply, or confirmed plan action was recorded. The only capacity event was the +60-minute exception.

Current P0 behavior would prevent study-completion revisions from applying automatically: app study routes call `previewCurrentPlan` and return `planMutationApplied: false` ([app-api/index.ts](../../../supabase/functions/app-api/index.ts#L1518)); Telegram study replanning is also preview-only ([telegram-webhook/index.ts](../../../supabase/functions/telegram-webhook/index.ts#L76)). Explicit user-approved mutation paths remain separate.

## 9. Initial product metrics

All metrics use Istanbul calendar boundaries and neutral single-user evidence. They are not population estimates.

| Metric | Formula | Result | Reliability |
| --- | --- | ---: | --- |
| Audit-window planned / credited | Original Aug 16–22 task minutes; sum of `min(estimated, completed)` | 1,500 / 770 | High |
| Audit-window execution rate | 770 ÷ 1,500 | **51.3%** | Provisional pending PLN-002 semantics |
| Full-week WPER snapshot | 944 credited ÷ 1,785 original budget | **52.9%** | Partial-week snapshot |
| Raw actual study | Sum stored completed-session durations | 1,149 min | Inflated by overlaps |
| Task-linked / explicit manual actual | Linked minutes / taskless custom minutes | 1,109 / 40 | Extra intent unresolved for linked work |
| De-overlapped clock time | Union of session intervals by day | 1,024.3 min | Best clock-time view |
| Overlap inflation | Exact interval sum − interval union | 139.2 min | High-confidence timestamps; allocation ambiguous |
| Explicit manual | Taskless custom sessions | 1 / 40 min | High; undercounts behaviorally extra linked work |
| Early task-linked work | Sessions before original baseline date | 8 / 351 raw min | Timing high; intent ambiguous |
| Carryover | Tasks with explicit carryover link | 0 / 0 min | High for explicit model only |
| Backlog | Tasks without a planned date | 4 / 280 min | High at snapshot |
| Task completion rate (status) | `completed` ÷ 25 original-window tasks | 0 / 25 = **0%** | Status conflicts with progress |
| Progress-complete rate | completed minutes ≥ estimate ÷ 25 | 11 / 25 = **44%** | Diagnostic, not canonical status |
| Estimated vs actual | 11 progress-complete tasks | +162 min; 932/770 = **1.21×** | Distorted by overlap/duplicate time |
| Study days | Days with ≥1 completed session | 6 of 7 | High |
| Actual subject switches | Cross-subject transitions in session order | 5 | High under session-block definition |
| Planned subject switches | Cross-subject transitions in original task order | 19 | High |
| Planner-generated date moves | Applied task date changes | 23 | High |
| Planner backlog actions | Backlog actions in revision payloads | 4 / 280 min | High; dedicated transition history incomplete |
| User-requested plan changes | Explicit recalculate/substitution/confirmed actions | 0 | High for recorded actions |

The mutable plan total fell from 1,785 to 748 because it combined credited progress with backlogged-task removal. It must not be used as the approved-plan denominator. The status/progress mismatch—11 fully credited tasks but zero status-completed tasks—must remain visible rather than normalized away.

## 10. Current planner semantic model

| Concept | Classification | Current representation and audit implication |
| --- | --- | --- |
| Planned Study | `EXPLICIT_MODEL` | Plan/task/date/estimate/source/progress are explicit, but an immutable approved baseline is needed because remaining-plan minutes mutate. |
| Extra Study | `NOT_MODELED` | Sessions may be taskless or task-linked; no explicit extra intent exists. Ahead-of-date work is semantically ambiguous. |
| Substitution | `NOT_MODELED` | No confirmed source/replacement relationship exists. |
| Carryover | `EXPLICIT_MODEL` but unused | Carryover source and parent-task link exist ([types.ts](../../../packages/domain/src/types.ts#L222)); audited tasks did not use them. |
| Learn vs practice | `EXPLICIT_MODEL` but incomplete | Topic states and lifecycle transitions exist ([types.ts](../../../packages/domain/src/types.ts#L5), [lifecycle.ts](../../../packages/domain/src/planning/lifecycle.ts#L31)); imported tasks still mix activity types in prose. |
| Resource roles | `EXPLICIT_MODEL` | Primary/reinforcement/revision/advanced/mock exist ([types.ts](../../../packages/domain/src/types.ts#L34)); no instruction role exists. |
| Task duration policy | `IMPLICIT_BEHAVIOR` | V0 defaults learn=60 and units=30–60 ([config.ts](../../../packages/domain/src/planning/config.ts#L3)); P48 chunks use a 30-minute minimum and 60-minute maximum ([roadmap.ts](../../../packages/domain/src/p48/roadmap.ts#L341)). Imported durations lack stage-specific rationale. |
| Daily capacity | `EXPLICIT_MODEL` | Day/week overrides, reserves, exceptions, and gross/planning helpers exist ([capacity-overrides.ts](../../../supabase/functions/_shared/capacity-overrides.ts#L24)). |
| Excess beyond plan | `IMPLICIT_BEHAVIOR` | Adaptive replanning subtracts all actual minutes from day remaining and computes deviation from planned consumption ([replan.ts](../../../packages/domain/src/adaptive/replan.ts#L50)); extra intent is not exempt. |
| Subject switching | `IMPLICIT_BEHAVIOR` | Current P48 generation prefers a different next subject; no switch budget or continuity objective exists. |
| Backlog decisions | `EXPLICIT_MODEL` with incomplete trace | Replanner emits backlog actions; atomic apply removes the date and marks rescheduled ([make_plan_revision_atomic.sql](../../../supabase/migrations/20260817130000_make_plan_revision_atomic.sql#L45)). Historical explanations lacked constraint-level detail. |

## 11. Hypothesis results

| Hypothesis | Result | Evidence |
| --- | --- | --- |
| H1 — Extra study can silently displace planned subjects | **CONFIRMED** | OBS-004 manual Mathematics → Finance backlog; OBS-005 early Turkish → Finance/Law backlog; no substitution intent |
| H2 — New-topic blocks can be too short | **PARTIALLY_CONFIRMED** | Three 30-minute new-topic video+notes blocks; no outcome evidence establishes harm or a universal minimum |
| H3 — Learn → Practice → Review is inadequately distinguished | **PARTIALLY_CONFIRMED** | Domain has stages/types, but production imports mix activities and lack durable task-stage sequencing evidence |
| H4 — Resource roles do not sufficiently sequence instruction/practice | **CONFIRMED** | Roles and question-bank sequence exist, but no instruction prerequisite; Mathematics video had no target/task |
| H5 — Daily schedules can be unnecessarily fragmented | **CONFIRMED** | Four or five subjects per planned day, 19 planned switches, and a current different-subject preference |

## 12. Ranked findings

### CRITICAL — F-001: historical study completion automatically applied unrelated plan changes

- What happened: 23 automatic revisions followed completed study; five changed tasks, producing 23 date moves and four backlogs.
- Evidence: OBS-001, OBS-003, OBS-004, OBS-005; revision payloads; historical apply path.
- User impact: planned subjects moved or lost dates without explicit request.
- Current rule: all actual minutes reduced remaining capacity, and the historical route automatically applied recalculation.
- Confidence: High.
- Hypothesis: confirms H1. Current preview-only protection mitigates the apply mechanism.

### CRITICAL — F-002: Planned, Extra, Substitution, and Carryover intent is not represented

- What happened: ahead-of-date task-linked work and manual work competed with planned commitments; no substitution/carryover relationship explained intent.
- Evidence: 351 early task-linked minutes, 40 manual minutes, zero confirmed actions, zero explicit carryovers.
- User impact: voluntary effort can silently displace commitments and cannot be explained later.
- Current rule: study accounting consumes actual minutes without an extra/substitution semantic.
- Confidence: High.
- Hypothesis: confirms H1 and motivates PLN-002.

### HIGH — F-003: overlapping historical sessions inflated actual time and planner input

- What happened: session intervals overlapped by 139.2 minutes; one task stored 155 actual against a 50-minute estimate.
- Evidence: OBS-006 and exact interval analysis.
- User impact: distorted duration estimates, capacity, plan risk, and execution reporting.
- Current rule: overlap rejection was added after the affected records.
- Confidence: High.

### HIGH — F-004: resource roles do not establish instructional sequencing

- What happened: Mathematics tasks used the primary question bank; reinforcement bank and instruction video were unused. The video had no planning target.
- Evidence: OBS-009, resource roles/targets, and task links.
- User impact: practice may appear without evidence of prerequisite instruction or a useful resource explanation.
- Current rule: roles rank mapped resources, but no instruction role/prerequisite exists.
- Confidence: High.
- Hypothesis: confirms H4; partially confirms H3.

### HIGH — F-005: the imported baseline and current P48 selection favor subject alternation

- What happened: every planned weekday had four subjects; Saturday had five; the baseline contained 19 switches.
- Evidence: OBS-008, canonical order, and current different-subject preference.
- User impact: setup cost and plans that diverge from observed one-to-two-subject execution.
- Current rule: current P48 generation prefers a different next subject and has no continuity budget.
- Confidence: High.
- Hypothesis: confirms H5.

### MEDIUM — F-006: three new-topic learning blocks were only 30 minutes

- What happened: three first-exposure blocks combined 20 minutes of video and 10 minutes of notes.
- Evidence: OBS-007A–C.
- User impact: potentially shallow first exposure; outcome harm is unproven.
- Current rule: imported durations were stage-agnostic; P48 minimum chunk is 30.
- Confidence: Medium.
- Hypothesis: partially confirms H2.

### MEDIUM — F-007: completion status and credited progress disagree

- What happened: 11 audit-window tasks were fully credited but none had status `completed`.
- Evidence: snapshot task/progress comparison.
- User impact: misleading completion rate and unclear task state.
- Current rule: task/resource-unit lifecycle requirements can leave fully credited tasks partial.
- Confidence: High for mismatch; Medium for root cause.

### LOW — F-008: capacity fields carry multiple meanings

- What happened: gross capacity, planning budget, and computed available minutes represented different concepts in similarly named fields.
- Evidence: capacity override, reserve, exception, and plan snapshot comparison.
- User impact: reports can compare unlike totals.
- Confidence: High.

## 13. Sanitized evidence table

| ID | Date band | Observed event | Planner/system action | Affected work | Evidence source | Confidence | Expected behavior | Backlog link |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OBS-001 | Aug 17 | Planned Mathematics study | Automatic revision moved 22 tasks | All subjects; Geography included | session class + revision + moves | High | Preview/explain; no silent global apply | PLN-007/008 |
| OBS-002 | Aug 18 | Turkish studied ahead of plan | Automatic zero-change revision; capacity consumed | Geography unchanged | session class + revision | High | Record extra intent separately | PLN-002 |
| OBS-003 | Aug 18 | Turkish task completed | Automatic revision moved one Turkish task | Turkish only | session class + revision + move | High | Explicit, user-visible consequence | PLN-002/007 |
| OBS-004 | Aug 19 | Manual taskless Mathematics, 40m | Automatic revision backlogged one task | Finance 75 | manual session + revision + historical code | High | Extra must not displace plan silently | PLN-002 |
| OBS-005 | Aug 20 | Turkish task completed early, 58m | Automatic revision backlogged two tasks | Finance 75 + Law 70 | session class + revision + historical code | High | Extra classification and explicit choice | PLN-002 |
| OBS-006 | Three audit days | Simultaneous sessions | Stored overlapping time | Mathematics/Turkish accounting | interval analysis + progress | High | Reject overlap; expose historical ambiguity | PLN-003/metrics |
| OBS-007 | Aug 17–19 | Three 30m new-topic blocks | Accepted in imported baseline | History/Geography | task type + sanitized descriptions | High | Stage-specific duration policy | PLN-003/004 |
| OBS-008 | Planned week | Four/five subjects per day | 19 planned switches | Whole plan | canonical order + current code | High | Optimize continuity with exceptions | PLN-006 |
| OBS-009 | Snapshot | Math instruction video had no target/task | Primary question bank dominated | Mathematics | roles + targets + task links | High | Explicit instruction path | PLN-005 |
| OBS-010 | Full window | No explicit product-action records | Revisions remained automatic | Whole plan | action/proposal categories | High | Durable decision trace | PLN-007 |
| OBS-011 | After preview-only protection | Later study produced no applied revision | Plan remained unchanged | Mathematics/Accounting | session/revision counts + code | Medium-High | Preserve preview-only invariant | PLN-008 |
| OBS-012 | Aug 18–20 | Four backlog actions | Dedicated transition history absent | Economics, Finance, Law | revision payloads + migration history | High | Every backlog transition durable | PLN-007 |

## 14. Unknowns and data gaps

- Historical task status and placement were not snapshotted at each midnight. Unchanged end-of-day fields are `UNKNOWN / NOT RECORDED`.
- Earlier backlog actions lack dedicated transition rows; revision payloads preserve the action but not a complete decision trace.
- No explicit Extra Study field exists. Ahead-of-date task-linked work cannot be asserted as user-declared extra intent.
- The capacity exception lacks a durable confirmation reference.
- Overlapping historical sessions cannot be uniquely allocated to simultaneous tasks. De-overlapped total is reliable; corrected per-task actual minutes are not.
- No resource-progress evidence proves that instructional or question-bank units were completed as intended.
- No test result or learning outcome establishes a causal pedagogical threshold for 30-minute new-topic blocks.
- The cutoff occurred before the full week ended. Full-week WPER is a provisional snapshot.
- Revisions lack a stored session reference and complete constraint trace. Causality classifications use the synchronous historical path plus unique adjacent completion and changed-task payload.

## 15. Recommended next backlog decisions

1. Make `PLN-002` the next single task. Voluntary extra study must not silently replace, cancel, move, backlog, or reduce another planned commitment. Define classification at accounting time and require an explicit source/replacement link for substitution.
2. Preserve study-completion preview-only behavior as a release invariant. Encode OBS-004 and OBS-005 as sanitized simulation fixtures before any automatic planner mutation is re-enabled.
3. Refine `PLN-003` with OBS-007A–C and overlap-safe duration calibration; do not assume a universal threshold.
4. Refine `PLN-004` so intended stage is structured and completion status has a documented relationship to progress/resource evidence.
5. Refine `PLN-005` around `RESOURCE_A`–`RESOURCE_C`: instruction path, primary practice, reinforcement sequence, and deterministic missing-mapping behavior.
6. Refine `PLN-006` with the measured baseline of 25 blocks/19 planned switches versus five actual switches.
7. Keep overlap and status-mismatch cases within PLN-003/004/005/008 unless separate scope is explicitly approved.

Do not begin PLN-002 from this audit task.

## Validation record

- Production integrity: 21 relevant datasets were compared before/after; all row counts and fingerprints matched. Sensitive fingerprint values are not stored in this tracked report.
- Repository scope: only this sanitized report, [PRODUCT_BACKLOG.md](../PRODUCT_BACKLOG.md), and [CURRENT_SPRINT.md](../CURRENT_SPRINT.md) are changed from `origin/main`.
- Application/source behavior: unchanged.
- Public-history check: `origin/main..HEAD` contains only the amended sanitized commit; the obsolete unsanitized commit is not reachable from the branch.
