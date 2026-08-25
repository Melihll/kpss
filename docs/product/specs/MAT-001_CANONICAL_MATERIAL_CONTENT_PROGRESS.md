# MAT-001 — Canonical Material Content & Progress

Status: MODEL_COMPLETE_SHADOW_VERIFIED — WORKLOAD_ENGINE_SHADOW_VERIFIED — PHYSICAL_PACE_EVIDENCE_PENDING — CANONICAL_RUNTIME_NOT_ACTIVATED
Last updated: 2026-08-25

## 1. Purpose

Make exact learning material a canonical planner input so KPSS Koçu can plan and track what the learner should execute, not only a subject and minute total.

The system must support every KPSS subject and future resource through one subject-agnostic material model.

The target product behavior is to answer:

- What topic is being studied?
- Which learning stage is active?
- Which exact resource should be used?
- Which exact pages, tests, chapters, readings, videos, or other units should be completed?
- Where did the learner stop?
- What exact scope remains today?
- What exact material destination is expected by the end of the week?

## 2. Architectural boundaries

- MAT-001 owns canonical material identity, ordering, topic mapping, progress facts, and planner-facing material normalization.
- PLN-004 owns pedagogical learning-stage state and prerequisites.
- PLN-005 owns resource pedagogical roles.
- PLN-003 owns duration bounds and normalization.
- PLN-002 owns Planned / Extra / Substitution / Carryover accounting semantics.
- Material completion does not automatically imply learning-stage satisfaction.
- Learning-stage changes must not rewrite historical material execution facts.
- AI may extract or propose material structure and mappings, but canonical publication requires deterministic validation/review.
- The material model must not contain subject-specific planner branches.

## 3. Canonical material hierarchy

Physical resources use the existing hierarchy:

`Resource → ResourceSection → ResourceUnit`

A `ResourceSection` represents a canonical source section such as a topic-aligned chapter or physical range.

A `ResourceUnit` represents an executable unit that may be assigned to a task.

Examples:

- page range;
- test;
- question set;
- chapter;
- reading;
- mock-exam segment;
- another explicitly defined executable unit.

YouTube keeps its existing authoritative hierarchy:

`YouTubePlaylist → YouTubePlaylistVideo → YouTubeVideoProgress`

YouTube videos are not duplicated into `resource_units` merely to satisfy the planner.

Instead, physical and YouTube material are normalized into one planner-facing contract.

## 4. Canonical identity rules

1. Every planner-visible material unit has a stable authoritative identity.
2. Physical-unit identity comes from the canonical physical resource/unit store.
3. YouTube-unit identity comes from the canonical playlist-video store.
4. Display text is never authoritative identity.
5. Page numbers, test numbers, playlist positions, and video titles are metadata, not primary identity.
6. A resource catalog update must not silently reinterpret historical completed units as different material.
7. Deactivated or superseded material remains historically traceable.
8. Exact unit ordering must be deterministic within its authoritative resource.
9. Material identity is independent from learning stage and resource role.
10. The same core identity rules apply to all KPSS subjects.

## 5. Physical resource semantics

Physical material continues to use `resources`, `resource_sections`, and `resource_units` as the authoritative catalog.

### 5.1 ResourceSection

A `ResourceSection` represents a canonical physical section of a resource and normally carries curriculum-topic scope.

Examples:

- `EBOB-EKOK · pages 42–59`;
- `Osmanlı Kültür ve Medeniyeti · pages 112–137`;
- `Türkiye'de İklim · pages 63–82`;
- `Temel Hak ve Hürriyetler · pages 91–108`.

Rules:

1. `resource_sections.curriculum_node_id` is the normal authoritative curriculum mapping for physical material.
2. `page_start/page_end` describe the canonical source range when the source provides meaningful physical pagination.
3. A section may contain multiple executable units.
4. A section is not automatically a daily task.
5. Section metadata must not imply that the entire section has been completed when only one child unit is executed.

### 5.2 ResourceUnit

A `ResourceUnit` is the smallest canonical execution unit that the planner may assign directly or combine with compatible units.

Examples:

- `pages 42–47`;
- `pages 48–53`;
- `Test 3`;
- `Test 4`;
- `Chapter 7`;
- `Reading 2`;
- `Mock segment 1`.

Rules:

1. Units must have stable identity and deterministic ordering.
2. Units normally inherit curriculum scope from their parent section.
3. Unit-level curriculum override should exist only when real source evidence proves that a section contains materially different curriculum targets.
4. Page slicing must preserve the source's real pedagogical boundaries when known.
5. The planner must not invent arbitrary page slices solely to fill remaining minutes.
6. A test is represented as a test unit when the source exposes a meaningful test boundary.
7. Page ranges and tests may coexist under the same section.
8. `estimated_minutes` is planning metadata, not completion truth.

## 6. Physical slicing policy

Canonical source scope and daily execution scope are different.

Example:

`ResourceSection: EBOB-EKOK · pages 42–59`

may contain:

- `Unit A: pages 42–47`;
- `Unit B: pages 48–53`;
- `Unit C: pages 54–59`;
- `Unit D: Test 3`;
- `Unit E: Test 4`.

The planner may assign only the units appropriate for the current day.

Therefore:

`canonical section range ≠ today execution slice`

Slicing rules:

1. Prefer source-defined boundaries such as tests, chapters, lessons, headings, or exercise groups.
2. If no explicit boundary exists, a reviewed page-range slice may be created.
3. Slices must be contiguous unless the source itself defines a non-contiguous unit.
4. Slices must not overlap accidentally.
5. Completion of one slice must not mark sibling slices complete.
6. Partial execution must preserve completed units and leave remaining units independently schedulable.
7. Re-slicing published historical units requires migration/reconciliation rules; historical identity must not be silently rewritten.

## 7. YouTube video-to-topic mapping

Playlist-level topic linkage is insufficient for exact planning.

The canonical requirement is an explicit many-to-many relationship between `youtube_playlist_videos` and `curriculum_nodes`.

Conceptually:

`YouTubePlaylistVideo ↔ CurriculumTopic`

The mapping must support:

- one topic mapped to multiple videos;
- one video mapped to multiple topics;
- deterministic ordering inherited from playlist position;
- optional segment boundaries when only part of a video applies to a topic;
- provenance and review status;
- activation/deactivation without deleting historical evidence.

Example:

`EBOB-EKOK`

- Video 5 · 31m 42s;
- Video 6 · 27m 18s.

Another valid example:

`Osmanlı Kültür ve Medeniyeti`

- Video 18;
- Video 19;
- Video 20.

No Mathematics-specific mapping table or planner branch is allowed.

### 7.1 Video segment semantics

A full video mapping is preferred when the entire video belongs to the target.

When a real video covers multiple curriculum targets, an optional mapping may specify:

- `segment_start_seconds`;
- `segment_end_seconds`.

Rules:

1. Segment bounds must be within the authoritative video duration.
2. Segment end must be greater than segment start.
3. Full-video completion history remains attached to the video.
4. Topic-specific segment evidence may be evaluated separately when required.
5. Segment support must not cause duplicate counting of the same watched seconds for planner workload.

## 8. Unified planner-facing MaterialUnitView

Physical and YouTube stores remain authoritative in their existing domains, but the planner consumes one normalized read model.

Conceptual contract:

`MaterialUnitView`

- `id`: stable source-qualified identity;
- `sourceKind`: `physical | youtube`;
- `resourceId`: owning planner-visible resource;
- `curriculumNodeId`: deterministic topic target;
- `unitType`: normalized executable type;
- `title`: display label;
- `sortOrder`: deterministic order inside the source;
- `pageStart/pageEnd`: physical pagination when applicable;
- `durationSeconds`: authoritative digital duration when applicable;
- `estimatedMinutes`: reviewed planning estimate when applicable;
- `progressState`: normalized execution progress;
- `completedAt`: historical completion timestamp when available;
- `mappingProvenance`: source of curriculum mapping;
- `isActive`: whether the unit may be selected for new planning.

The normalized view is not a second authoritative progress store.

Rules:

1. Physical progress is derived from the physical progress authority.
2. YouTube progress is derived from the YouTube progress authority.
3. The view must not duplicate or independently mutate progress.
4. The view must preserve the underlying authoritative identity so actions can be routed back safely.
5. Missing topic mapping makes the unit non-authoritative for topic-specific stage satisfaction.
6. Missing duration does not justify fabricated precision.
7. The same normalized contract is used for every KPSS subject.

## 9. Normalized executable unit types

Planner-facing unit types should remain small and semantic.

Initial normalized categories:

- `video`;
- `page_range`;
- `test`;
- `question_set`;
- `chapter`;
- `reading`;
- `mock`;
- `other`.

The normalized type does not replace source-specific metadata.

For example, two different publishers may expose very different internal structures while still producing valid `test` or `page_range` units for the planner.

Adding a new subject must not require adding a new planner branch. A new material type is added only when its execution semantics genuinely differ.

## 10. Material progress semantics

Material progress records execution history for a canonical material unit.

Normalized progress states:

- `not_started`;
- `in_progress`;
- `completed`;
- `skipped`.

Material progress does not answer whether the learner currently remembers, understands, or has mastered the curriculum target.

Therefore:

`Material Progress ≠ Learning Stage ≠ Mastery`

Rules:

1. A completed material unit remains historically completed unless the completion record itself is explicitly corrected.
2. Review or remediation must not reset valid historical completion to `not_started`.
3. A skipped unit remains distinct from a completed unit.
4. Skipping material does not fabricate learning-stage satisfaction.
5. A partially executed unit may remain `in_progress` when its source supports meaningful partial progress.
6. Progress mutations must preserve authoritative material identity.
7. Progress updates must be user-scoped and auditable.
8. AI may interpret progress statements but cannot silently mutate canonical progress.

## 11. Partial progress

Partial progress must follow the semantics of the source type rather than forcing every material into one representation.

Examples:

### Physical page range

Planned unit:

`pages 42–53`

Learner actually finishes:

`pages 42–49`

The system must preserve the completed scope and return only the unresolved valid scope to future planning.

Preferred result:

`completed: pages 42–49`

`remaining: pages 50–53`

The planner must not repeatedly assign pages 42–49 merely because the original task referenced pages 42–53.

### Test

A canonical test normally behaves as an atomic executable unit unless the source provides a meaningful smaller structure.

If Test 3 is only partially solved, progress may remain `in_progress`; the system must not invent a fake completed Test 3.

### YouTube video

YouTube progress may use authoritative `last_position_seconds`, `watched_seconds`, and `completed_at`.

A partially watched video remains incomplete and future planning may account for its remaining duration.

Rules:

1. Remaining workload must be derived from authoritative progress when available.
2. Partial progress must not cause duplicate workload accounting.
3. Completion thresholds must be explicit and deterministic.
4. Source-specific partial progress may be normalized for the planner without erasing source-specific detail.

## 12. Existing-progress import

A learner may enter KPSS Koçu after already using books, question banks, notes, or video courses.

The product must support explicit historical progress import without pretending that the work occurred inside the current planner.

Supported product patterns may include:

- mark one unit completed;
- select multiple completed units;
- mark individual videos watched;
- confirm `completed up to here` in an ordered source;
- enter a page boundary such as `I am up to page 53`;
- confirm a reviewed topic/resource boundary;
- import structured historical data with provenance.

Imported progress must record provenance.

Examples of provenance:

- `user_confirmed`;
- `trusted_import`;
- `observed_execution`;
- `reviewed_admin_import`;
- `corrected`.

An imported completion may participate in MAT-001 progress calculations immediately, while PLN-004 independently determines whether that evidence is sufficient for learning-stage progression.

## 13. Completed-up-to-here behavior

The product should make ordered resource onboarding easy.

For a video playlist, the learner may say:

`I watched through Video 12.`

For a physical resource, the learner may say:

`I completed through page 53.`

Or:

`I completed through Test 7.`

This operation must not be implemented as an unsafe blind range update.

Deterministic rules:

1. The selected boundary must belong to the same authoritative resource.
2. Only earlier eligible units in canonical order may be proposed for completion.
3. Already completed units remain unchanged.
4. Skipped/deactivated/ambiguous units must be surfaced rather than silently overwritten when their semantics conflict with the bulk boundary.
5. The product must preview the affected units before applying a large historical progress import when ambiguity or destructive reinterpretation exists.
6. Imported timestamps must not falsely claim exact historical study time when that information is unknown.

## 14. Forgotten material

`Completed before` and `currently retained` are different facts.

Example:

The learner previously watched Video 5 and Video 6, but later says:

`I watched these before, but I do not remember EBOB-EKOK.`

Correct behavior:

- Video 5 remains materially completed;
- Video 6 remains materially completed;
- historical progress is preserved;
- PLN-004 may reopen the curriculum target for review or remediation;
- future planner workload is based on the new pedagogical requirement rather than falsifying past material execution.

The product may offer actions such as:

- `I completed this before`;
- `I remember this well`;
- `I need a short review`;
- `I forgot this / relearn it`.

The exact pedagogical consequence belongs to PLN-004, not MAT-001.

## 15. Planner remaining-scope contract

For each eligible curriculum target/resource path, MAT-001 must be able to expose deterministic remaining material scope.

Conceptually:

`canonical ordered units - valid completed progress = remaining units`

The result must preserve:

- authoritative unit identity;
- curriculum target;
- order;
- source kind;
- current progress;
- remaining workload when measurable;
- mapping confidence/provenance;
- activation state.

The remaining-scope calculation must not:

- infer completion from elapsed minutes alone;
- infer topic membership from title text alone;
- count the same material twice through two normalized views;
- silently include inactive or superseded material;
- silently cross into another curriculum topic merely to fill capacity.

## 16. Today exact-scope contract

When canonical material coverage is sufficient, Today tasks should identify exact executable scope.

Example:

`Mathematics · EBOB-EKOK · Learn`

- `Video 5 · 31m 42s`;
- `Video 6 · 27m 18s`;
- `pages 42–53`.

Another subject may use:

`History · Ottoman Culture · Learn`

- `Video 18`;
- `Video 19`;
- `pages 112–129`.

Rules:

1. Exact scope is structured data, not only display prose.
2. Today may contain one or several compatible units in one coherent task/block.
3. The planner must preserve canonical order unless a documented rule justifies a different sequence.
4. Partial completion must return only remaining valid scope to later plans.
5. Today exact scope must remain explainable to the learner.
6. If exact material data is unavailable, the system degrades safely rather than inventing page/test/video detail.

## 17. Week exact-destination contract

The Week view must answer not only how many minutes are planned, but where the learner is expected to arrive in the material.

Example:

`This week — Mathematics`

- finish EBOB-EKOK Learn;
- Videos 5–6;
- pages 42–53;
- complete Test 3–4;
- begin Ratio-Proportion Video 7 if prerequisites and capacity permit.

The weekly destination must be derived from the same canonical units used by Today.

Rules:

1. Week scope is not a separate hand-written plan source.
2. Daily tasks are slices of the approved weekly material destination.
3. Completed daily work updates the remaining weekly destination.
4. Extra Study may advance material progress but follows PLN-002 accounting semantics and must not silently displace unrelated approved work.
5. A weekly destination may remain partially unfinished; carryover/replanning semantics must preserve identity and history.
6. The UI must make the relationship between weekly target and Today scope understandable without exposing internal planner complexity.

## 18. Content intake pipeline

MAT-001 must support converting real resource evidence into canonical planner-ready material without requiring manual database editing.

Supported intake sources may include:

- table-of-contents photos;
- photographed resource pages;
- PDF table of contents or indexes;
- manually entered section/unit information;
- existing reviewed catalog data;
- authoritative digital metadata such as the YouTube playlist API.

The conceptual intake pipeline is:

`Source evidence → extraction candidates → curriculum matching → deterministic validation → human review → canonical publish`

AI-assisted extraction is a candidate-generation step, not publication authority.

## 19. Extraction candidate contract

For physical source evidence, extraction may propose:

- resource title and publisher when visible;
- section title;
- subsection or heading;
- page start;
- page end;
- test number or test range;
- chapter/reading/unit boundary;
- ordering;
- candidate curriculum topic;
- candidate executable slices;
- extraction confidence;
- mapping confidence;
- provenance reference back to the source evidence.

Example:

Source photo contains:

`EBOB - EKOK ........ 42`

`Test 1 ............. 54`

`Test 2 ............. 56`

A candidate extraction may propose:

`Section: EBOB-EKOK · pages 42–53`

`Unit: pages 42–53`

`Unit: Test 1 · pages 54–55`

`Unit: Test 2 · pages 56–57`

These remain draft candidates until validated and approved.

## 20. Deterministic intake validation

Before canonical publication, the system must validate structural rules independently of AI confidence.

Validation includes:

1. Resource ownership and exam-profile scope are valid.
2. Referenced curriculum nodes exist and belong to the expected subject.
3. Page numbers are positive and page ranges are ordered.
4. Section and unit ordering is deterministic.
5. Duplicate canonical identities are rejected or explicitly reconciled.
6. Accidental overlapping physical ranges are surfaced for review.
7. Child units remain inside their canonical section range when a physical range is authoritative.
8. YouTube video mappings reference active canonical playlist videos.
9. Optional video segment bounds remain inside authoritative video duration.
10. Ambiguous curriculum matches remain unresolved rather than being silently guessed.
11. Existing published progress/history cannot be silently reassigned to a different material identity.
12. No validation rule may depend on a Mathematics-specific or other subject-specific planner branch.

AI confidence may influence review priority but cannot bypass deterministic validation.

## 21. Review and canonical publication

Canonical material is published only after review resolves required ambiguities.

The reviewer must be able to inspect:

- original source evidence;
- extracted section/unit candidates;
- proposed curriculum mappings;
- page/test/video boundaries;
- confidence and provenance;
- validation warnings/errors;
- the resulting planner-visible structure.

Publication behavior:

1. Valid approved candidates create or update canonical catalog data through sanctioned paths.
2. Rejected candidates do not become planner-visible.
3. Unresolved candidates remain outside authoritative planning.
4. Published records retain provenance sufficient to explain where their structure came from.
5. Re-importing a resource produces a reviewable diff rather than blindly overwriting the existing catalog.
6. Changes that would reinterpret already-completed historical units require explicit reconciliation.

## 22. Web resource setup experience

The resource-setup workflow must hide database complexity from the operator.

A target internal/admin setup flow is:

`Add Resource`

`→ Upload photos / PDF`

`→ AI extracts structure`

`→ Review sections and units`

`→ Review curriculum mappings`

`→ Resolve warnings`

`→ Publish`

The review UI should prioritize speed:

- show the source image/PDF evidence beside extracted candidates where practical;
- allow inline correction of names, pages, test numbers, and topic mapping;
- allow reorder when extraction order is wrong;
- allow split/merge of proposed units before publication;
- allow bulk approval only when deterministic validation has passed;
- clearly mark ambiguous mappings rather than burying them;
- show whether the resource is planner-ready before publication.

The operator should not need to know table names such as `resource_sections` or `resource_units`.

## 23. Planner-readiness status

A resource can exist in the catalog before it is sufficiently structured for exact-scope planning.

Planner readiness should therefore be derived from material quality rather than assumed from resource existence.

Conceptual readiness dimensions include:

- canonical section coverage;
- executable unit coverage;
- curriculum-topic mapping coverage;
- deterministic ordering;
- required duration/workload metadata where applicable;
- unresolved validation issues;
- active/inactive state.

A resource with incomplete mapping may remain visible to the user while being excluded from authoritative exact-scope decisions that require missing data.

The UI should explain incomplete readiness in product language such as:

`This resource is available, but exact topic planning is not ready yet.`

rather than silently fabricating scope.

## 24. Learner resource-progress experience

The learner-facing resource UI must be substantially simpler than the intake/admin UI.

For an ordered video resource, the learner should be able to see:

- completed videos;
- current video;
- upcoming videos;
- real video duration;
- topic grouping when canonical mapping exists;
- a simple `watched` or `completed up to here` action.

For a physical resource, the learner should be able to see:

- current topic/section;
- completed units;
- current page/test position;
- upcoming exact units;
- a simple progress-update action.

Useful actions may include:

- `Mark completed`;
- `I am up to here`;
- `I watched through this video`;
- `I completed through this page/test`;
- `I did this before`;
- `I forgot this / I need review`.

Bulk progress actions must preview meaningful consequences when ambiguity exists.

The learner must not be required to manually edit planner metadata.

## 25. Today and Week presentation

Internal planner richness must become simple learner-facing presentation.

Today should be capable of presenting a task such as:

`EBOB-EKOK · Learn · 80 min`

`Video 5 · 31 min`

`Video 6 · 27 min`

`Book · pages 42–53`

with completion controls at the material-unit level where appropriate.

Week should be capable of presenting:

`EBOB-EKOK`

`Videos 5–6`

`pages 42–53`

`Tests 3–4`

and the expected end-of-week learning destination.

Presentation rules:

1. The UI must show exact scope when canonical data exists.
2. The UI must not expose internal database or policy terminology unnecessarily.
3. A user must be able to understand why a unit is planned and what completing it advances.
4. Today and Week must read from the same canonical planner scope rather than maintaining conflicting manual copies.
5. Partial progress must be reflected without making the learner re-complete already-finished scope.

## 26. AI Coach interaction with material progress

AI Coach may use MAT-001 context to understand natural-language statements and explain material plans.

Examples:

`I finished pages 42 to 49 but did not reach 53.`

`I watched the first six videos before joining the app.`

`I solved Test 3 but EBOB-EKOK still feels weak.`

`I forgot this topic even though I watched the videos.`

AI may propose structured interpretations such as:

- progress boundary;
- affected material units;
- historical versus current execution;
- possible review/remediation need;
- clarification when the statement is ambiguous.

The flow remains:

`Natural language → AI interpretation → deterministic validation → preview/clarification → sanctioned apply`

AI must not:

- fabricate page/test/video mappings;
- silently mark large ranges complete;
- silently reset completed history;
- declare a learning stage satisfied;
- mutate Today/Week directly;
- infer destructive substitution from material progress.

## 27. Catalog update and history safety

Resources may change after initial publication.

Examples include publisher corrections, a YouTube playlist gaining new videos, reordered videos, corrected topic mapping, or a revised physical edition.

Update rules:

1. Catalog synchronization may add new authoritative units without rewriting unrelated historical progress.
2. Removed/deactivated source units remain historically traceable when previously referenced or completed.
3. A changed title does not create a new identity by itself.
4. A materially different edition or unit must not reuse identity merely because its display name is similar.
5. Mapping corrections preserve previous provenance/audit information.
6. Planner remaining scope uses the current active canonical catalog while historical execution remains explainable.
7. A catalog update must not silently mutate Today work through an uncontrolled side effect.

## 28. Safety invariants

`MAT-001-001` Material identity must be stable and source-qualified.
`MAT-001-002` Display text alone is never authoritative identity.
`MAT-001-003` Material completion does not automatically imply learning-stage satisfaction.
`MAT-001-004` Historical completion is not silently reset when review or remediation is required.
`MAT-001-005` Playlist-level linkage alone does not prove individual video topic scope.
`MAT-001-006` Missing or ambiguous topic mapping cannot silently satisfy topic-specific progress.
`MAT-001-007` Exact page/test/video scope must not be fabricated merely to fill capacity.
`MAT-001-008` Partial progress must not cause already-completed scope to be scheduled again.
`MAT-001-009` Physical and YouTube progress authorities are not duplicated into an independent planner-owned progress store.
`MAT-001-010` AI extraction or interpretation has no direct canonical publication or progress-mutation authority.
`MAT-001-011` Bulk "completed up to here" operations must preserve conflicting skipped, inactive, or ambiguous units for review.
`MAT-001-012` Catalog updates must preserve historical traceability.
`MAT-001-013` Today and Week scope must derive from the same canonical material identities.
`MAT-001-014` Extra Study may advance material progress but cannot silently displace unrelated planned work.
`MAT-001-015` The material model must remain subject-agnostic across all KPSS subjects.

## 29. Acceptance scenarios

The implementation and tests must cover at least:

1. A physical topic section with ordered page-range and test units.
2. A page range partially completed so only the remaining range returns to planning.
3. A test marked `in_progress` without being falsely completed.
4. A YouTube video partially watched with remaining workload derived from authoritative progress.
5. Multiple videos mapped to one curriculum topic in playlist order.
6. One video explicitly mapped to multiple curriculum topics.
7. A playlist linked to a topic without individual video mapping; videos remain non-authoritative for exact topic planning.
8. A completed unit with ambiguous topic mapping; history is preserved but topic-specific progress is not inferred.
9. A learner marks an ordered resource `completed up to here` and earlier eligible units are proposed deterministically.
10. A conflicting skipped or inactive unit prevents unsafe blind bulk completion.
11. Previously completed material is later reported forgotten; completion history remains while PLN-004 may reopen review/remediation.
12. A resource has incomplete canonical coverage and remains visible but not planner-ready for exact scope.
13. AI extraction proposes incorrect page or topic data; deterministic validation prevents publication.
14. Re-imported resource evidence creates a reviewable diff rather than overwriting existing canonical identities.
15. Today returns exact structured material units when coverage exists.
16. Week exposes a destination composed from the same canonical units used by Today.
17. Extra Study completes additional material but keeps PLN-002 accounting semantics.
18. Equivalent material structures in different KPSS subjects use the same normalization and remaining-scope engine.

## 30. Non-goals

MAT-001 does not:
- decide learning-stage prerequisites; PLN-004 owns that;
- assign Instruction / Primary Practice / Reinforcement / Revision roles; PLN-005 owns that;
- determine final study-block duration; PLN-003 owns that;
- implement mastery scoring or forgetting curves;
- permit AI to publish canonical catalog changes directly;
- require every resource to be fully structured before it can exist in the product;
- activate production-authoritative exact-scope planning merely because local domain code exists.

## 31. Implementation sequence

Implementation proceeds in this order:

1. Define and test subject-agnostic `MaterialUnitView` normalization.
2. Define and test deterministic remaining-scope calculation.
3. Normalize physical resource units and progress into the view.
4. Normalize YouTube playlist videos and progress into the view.
5. Define and test individual video-to-topic mappings.
6. Define existing-progress import and `completed up to here` proposal behavior.
7. Define planner-readiness calculation.
8. Integrate exact material scope into planner inputs without enabling unsafe production behavior.
9. Add Today and Week presentation contracts.
10. Add reviewed photo/PDF content-intake paths.

Each stage follows `SPEC → TEST → IMPLEMENT → VERIFY`.

## 32. Rollout gates

Before production-authoritative exact-scope planning:

1. physical and YouTube normalization tests must pass;
2. remaining-scope tests must pass;
3. video-topic mapping constraints and RLS must be verified if schema is introduced;
4. historical progress preservation must have regression coverage;
5. PLN-004 stage integration must consume only accepted canonical evidence;
6. PLN-005 resource-role requirements for the activated path must be available;
7. missing material coverage must degrade safely;
8. planner simulation must show no silent Today disappearance or cross-topic fabricated scope;
9. production migration/deployment requires a separate approved release.

## 33. Local foundation verification

MAT-001 first domain foundation is locally implemented and verified.

- `MaterialUnitView` normalizes physical and YouTube material without creating a second authoritative progress store.
- Physical page ranges, tests, YouTube duration/progress, ambiguous mappings, and inactive historical units are covered.
- Deterministic remaining-scope calculation excludes completed/skipped/ineligible material, preserves canonical order, avoids resource/topic crossing, trims partial physical page scope, and calculates real remaining YouTube seconds.
- MAT-001 foundation targeted tests: `12/12` PASS.
- Repository non-integration regression before the strict-test typing correction: `666/666` tests across `97/97` test files PASS.
- Domain typecheck must remain PASS before checkpoint.
- No database migration, production mutation path, or production-authoritative planner activation is introduced by this foundation.

Next implementation slice: video-to-topic mapping validation, planner readiness, and safe `completed up to here` proposal semantics.

## 34. Production schema and catalog inventory

Read-only linked production inventory completed on 2026-08-24.

Observed catalog state:

- resources: `80`;
- resource sections: `475`;
- resources with sections: `33`;
- sections with curriculum mapping: `463`;
- resource units: `79`;
- resources with units: `25`;
- active physical units: `79`;
- physical units with page ranges: `78`;
- physical progress rows: `1`;
- YouTube playlists: `1`;
- YouTube playlist videos: `91`;
- active YouTube videos: `91`;
- YouTube videos with authoritative duration: `91/91`;
- YouTube progress rows: `2`;
- topic-resource links: `14`;
- playlist-topic links: `14`.

Confirmed persistence gaps:

- `resource_unit_progress` has no `completed_through_page`; exact physical partial-page position cannot currently be persisted.
- no canonical `youtube_video_topic_links` relation exists;
- no video-topic segment-boundary persistence exists;
- playlist-level topic linkage alone is insufficient for exact individual-video topic planning.

Architectural decision:

Existing authoritative physical and YouTube stores will be preserved. MAT-001 will add adapters into `MaterialUnitView`; missing persistence will be introduced only through a later minimal reviewed migration. No duplicate planner-owned progress store will be created.

## 35. MAT-001 persistence migration candidate

A minimal persistence migration candidate is implemented and locally verified.

The candidate adds:

- `resource_unit_progress.completed_through_page` for exact partial-page progress;
- canonical individual `youtube_video_topic_links` for video-to-topic mappings;
- validated mapping status and explicit mapping provenance;
- optional deterministic video segment boundaries;
- ownership-preserving foreign keys across user, profile, and YouTube video;
- authenticated RLS for user-owned mapping rows;
- video-duration validation for segment bounds.

Safety guarantees:

- existing physical progress rows are not backfilled with fabricated page progress;
- playlist-level topic links are not promoted automatically to individual video mappings;
- new mappings default to `ambiguous` and `ai_candidate`;
- AI-only mappings remain planner-ineligible;
- inactive mapping rows may preserve historical mapping decisions;
- exact partial-page state remains separate from learning-stage satisfaction;
- production schema deployment remains explicitly gated.

Verification:

- MAT-001 persistence contract: PASS;
- material adapter and canonical material domain gates: PASS;
- domain typecheck: PASS;
- full non-integration regression: 106/106 files, 710/710 tests PASS;
- linked Supabase migration dry-run: PASS;
- production migration: APPLIED on 2026-08-24 under the separately approved MAT-001 schema release; no migration was run by W1.

## 36. Canonical workload engine (W1)

The canonical workload engine is implemented and production-shadow verified without activating canonical planning.

Authority rules:

- authoritative full-video workload is exact from `duration_seconds - watched_seconds`;
- completed canonical material has exact zero remaining workload;
- physical page duration is calibrated only from a causally linked actual-time and actual-progress observation;
- historical planned/unit estimates are never intrinsic material duration;
- missing evidence returns `estimatedMinutes = null`, `authority = unknown`, and `plannerEligible = false`;
- segment, ambiguous, unmapped, and AI-candidate video mappings remain blocked;
- physical calibration uses exact-resource/type, then subject/type, then user/type evidence, with no cross-material-type leakage;
- calibrated planning requires medium/high confidence under the contract-tested sample, observed-time, and dispersion gates.

The production audit found that study sessions contain real elapsed time but do not atomically record physical page deltas. Exact resource progress contains progress but not paired elapsed time. The only currently legitimate pace shape is a first exact-unit page-ranged test completion whose actual `test_results.duration_minutes` and atomic `resource_unit_progress.completed_at` match. No such accepted samples exist for the target production profile.

Production workload readiness on 2026-08-25:

- `341` total views;
- `76` exact, `0` calibrated, `0` fallback, `265` unknown;
- `76` planner-eligible views;
- `3,323` exact YouTube remaining minutes;
- `0` calibrated physical pages and `5,103` unknown physical pages;
- blockers: `245 pace_evidence_unavailable`, `20 mapping_missing`;
- read-only production guards remained `79` resource units, `76` video-topic links, and `0` non-null partial-page boundaries before and after.

The existing app-api workload path remains active and unchanged. Canonical workload runtime remains OFF.

## 37. Atomic physical pace evidence (W2)

W2 is implemented and locally verified as a production-inactive migration/RPC candidate. The detailed contract is `MAT-001_ATOMIC_PHYSICAL_PACE_EVIDENCE.md`.

The sanctioned candidate flow owns both sides of a future physical pace sample:

- a protected start snapshot records server time, exact material identity, page range, and last-completed-page boundary;
- protected physical pause/resume records exclude inactive time without trusting directly editable generic break rows;
- one finish transaction validates unchanged identity/progress, records exact progress, performs existing session accounting, and inserts one immutable accepted event;
- causal idempotency is enforced by unique `study_session_id`;
- generic study, retroactive, task-completion, test, app-api, and Telegram behavior remains unchanged.

W1 ingestion can consume accepted `physical_pace_evidence` only when explicitly capability-enabled after schema deployment. Reading/content `page_range` evidence and problem-solving `test` evidence remain incompatible calibration pools. Three compatible fixture samples satisfy the unchanged medium-confidence gate; one sample does not make a synthetic span planner-eligible.

Local gates pass: targeted `25/25`, non-integration `792/792` across `123/123` files, integration `114/114` across `12/12` files, domain typecheck, bundle rebuild, and local PostgreSQL migration apply/lint. The linked production shadow remains unchanged and read-only. Migration `20260825130000_atomic_physical_pace_evidence.sql` is not deployed, accepted historical physical pace samples remain `0`, and canonical runtime remains OFF.
