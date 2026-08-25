# MAT-001 Physical Structural Coverage

Status: LOADER_INTEGRATED_SHADOW_ONLY — RUNTIME_NOT_ACTIVATED

## Decision

`resource_sections` are the canonical physical-content authority.

Persisted `resource_units` are not assumed to be the complete canonical content model. Historical production importers created them as execution slices derived from weekly tasks.

`estimated_minutes` on those historical units therefore represents planning/execution metadata and must not be treated as intrinsic material duration.

## Structural coverage

The canonical material layer may derive in-memory structural spans for pages in an active `resource_section` that are not covered by active persisted `resource_units`.

These spans:

- inherit the section resource and curriculum mapping;
- preserve exact page boundaries;
- never invent `estimated_minutes`;
- are never planner-eligible while duration authority is unresolved;
- are not inserted into `resource_units` merely to complete catalog coverage.

## Gap algorithm

1. Read the active section page range.
2. Collect active persisted unit ranges linked to the section.
3. Clip valid overlaps to the section boundary.
4. Merge overlapping or adjacent persisted ranges.
5. Emit the uncovered page intervals as structural spans.
6. Keep missing/invalid ranges explicit as anomalies instead of guessing.

## Runtime safety

This policy is initially local/shadow-only.

No production `resource_units` inserts are authorized by this spec.

Canonical planner cutover remains disabled until workload calibration and shadow verification are complete.

## H8B verification

- Structural coverage domain tests: GREEN.
- Structural material projection tests: GREEN.
- Material adapter regression: GREEN.
- Canonical loader structural contract: GREEN.
- Canonical shadow contract: GREEN.
- Domain typecheck: GREEN.
- Edge planning bundle contains structural coverage functions.
- Full non-integration regression: GREEN.
- Supabase persistence integration test is ENVIRONMENT_BLOCKED in this shell because the required integration environment variables are not present.
- ENVIRONMENT_BLOCKED is not treated as a product regression.
- No production data mutation occurred during H8B.
- Canonical runtime remains inactive.
