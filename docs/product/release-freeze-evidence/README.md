# Release freeze evidence — 2026-10-06

> **2026-10-07 preservation note:** This NO-GO record remains historical. Current closure is [release-blocker-evidence/README.md](../release-blocker-evidence/README.md). The generated `app-api-audit.bundle.js` named below was retained in ignored `.release/app-api-audit.bundle.js`; it is reproducible local output and excluded from the release commit. Historical commands/results below were not rewritten.

Result: **NO-GO / DIRTY / NOT DEPLOYED**. [Full report](../CONCEPT_B_RELEASE_FREEZE.md).

This evidence identifies audited local source/artifacts, not a release commit or deployed production revision. No secret values are included. Only read-only remote Git refs were accessed; no production service/DB operation was performed.

## Files

| File | Scope |
| --- | --- |
| `snapshot.json` | Git preflight/status, final runtime input/build file SHA-256 manifests, bundle markers and literal server env names |
| `change-inventory.json` | Two exact baseline comparisons, baseline-to-HEAD and tracked/untracked dirty candidate paths/categories |
| `edge-import-closures.json` | Static relative imports; comparison anchor is documented app-api source 735de8d, not other functions' live version proof |
| `regression.log` | Fresh final 1509/1509 test, 200/200 file non-integration run after minimal accessibility fix |
| `app-api-audit.bundle.js` | Local esbuild compatibility evidence with external npm/https imports; not a production function artifact; exclude from deploy inputs |
| `today-mobile-aria-390.png` | CUA real LOCAL authenticated product at 390×844; named 44 px action buttons, zero measured overflow; no current task, no playback/mutation acceptance |
| `audit-snapshot.mjs` | Inventory/hash/sweep helper; Git/source/build reads and writes to this evidence directory only, no network/DB/auth calls |

## Fresh final commands

All run after adding only `aria-label="Görev Ekle"` and `aria-label="Koça Sor"` in `StudyTodayPanel.tsx`:

```text
node node_modules/vitest/vitest.mjs run --exclude tests/integration/**
node node_modules/typescript/bin/tsc -b packages/domain apps/web --pretty false
node scripts/check-ux-lab.mjs
node node_modules/vite/bin/vite.js build                 [cwd: apps/web]
node scripts/check-ai-coach-safety.mjs
node scripts/check-ai-coach-plan-preview-safety.mjs
node scripts/check-ai-economics-v1-safety.mjs
node scripts/check-planning-v2-shadow-safety.mjs
node scripts/check-canonical-planner-v2-readonly-safety.mjs
node scripts/check-coach-context-v1-readonly-safety.mjs
node node_modules/esbuild/bin/esbuild supabase/functions/app-api/index.ts --bundle --format=esm --platform=neutral --target=es2022 --external:npm:* --external:https:* --outfile=docs/product/release-freeze-evidence/app-api-audit.bundle.js
git -c core.whitespace=cr-at-eol -c core.safecrlf=false diff --check
node docs/product/release-freeze-evidence/audit-snapshot.mjs
```

All above exit 0. Regression 1509 tests/200 files. Scoped lint 19 files. Vite 328 modules, main JS 452.36 kB/gzip 132.68 kB and CSS 162.23 kB/gzip 27.25 kB. app-api audit bundle 742.3 kB. Vite compilation PASS is **not** artifact approval: two chunks contain local backend `http://127.0.0.1:54321`; current artifact cannot be deployed.

The supplementary `node scripts/check-ai-coach-6g-local-acceptance.mjs` exited 1 on its old always-disabled production-orchestrator marker. This unchanged phase6G-A assertion already mismatched source 735de8d before this RC and predates the accepted exact-profile pilot. It is disclosed separately, never counted among the six current safety PASS results. No production provider execution was attempted.

No full linked SQL/integration suite, production smoke, new fixture apply or controlled Planner/session mutation was run in this audit. Historical authenticated successful video acceptance remains separate; complete product runtime smoke and video checkpoint failure/backpressure verification are release blockers in the full report.

## Reproduce inventory only

From the repository root, with the local `apps/web/dist` available, run the inventory helper. It records the *current* tree, so later edits legitimately produce different fingerprints. It does not build/deploy/query production. Do not treat its local endpoint scan as proof that correct production inputs were supplied.
