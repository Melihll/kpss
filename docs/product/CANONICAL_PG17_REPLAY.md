# PostgreSQL 17 migration replay ve CI

Durum: **ENG-002C / MERGED (PR #5); ENG-003A / MERGED (PR #6), KAPALI.** Güncelleme: 28 Ekim 2026, Europe/Istanbul. Migration CI **PASS**; [PR #6](https://github.com/Melihll/kpss/pull/6) develop'a 833cf6b ile merge edildi. PASS durumu kullanıcı kapanış bildirimine, merge kimliği fetch edilmiş Git geçmişine dayanır; ENG-004 CI'yı yeniden çalıştırmaz.

`migration-replay`, aktif develop branch protection'ın iki zorunlu kontrolünden biridir. Application CI ve sistem kapanışı için [Engineering System](ENGINEERING_SYSTEM.md#e-gate-matrisi) kullanılır. Önceki ECR preload hatası ve GHCR doğrulama bekleyişi kapanmıştır; aşağıdaki yerel kanıtlar tarihsel kapsamlarıyla korunur.

## Original task scope and identity (historical)

- Base: `origin/develop` / `d8b576b517f13aa06d0d52b03aa3233295d8592e` (PR #5 merged).
- Branch: `codex/eng-003a-migration-ci`, separate worktree.
- Original implementation scope: the three canonical replay/compatibility scripts,
  this report and `.github/workflows/migration-replay.yml`. Subsequent authorized
  integration completed through PR #6; the original pre-commit stop is historical.
- `supabase/config.toml` remains **major_version=15**. Production PostgreSQL is
  **UNKNOWN**; no production access or version assumption. PG17 is only a new,
  disposable test/CI target. Shared LOCAL, dirty develop and landing are preserved.

## Frozen history and chronological additions

The first 69 migrations are frozen at Git commit
`19fecf22386a9b8427f48f326927096a210d30ed`. The SHA-256 of the ordered JSON
`[canonicalPath, version, exact Git-blob SHA-256]` tuples is
`d25abe4aba0b721953c4b68a917ce38b53d916277183ba99f96a1881ca51410e`.
Every path, version and raw canonical source hash remains part of this identity.
Deletion, rename, same-count replacement, duplicate version, reordering and
backdated insertion fail. Checkout may differ only by LF/CRLF, as before.

New SQL comes from the candidate HEAD's Git blobs and must be a chronological
suffix. Untracked/modified SQL is rejected rather than silently replayed.
The total is dynamic **N**. The historical DB48 manifest stays exactly 48 records;
its source identity is protected against the immutable baseline. The known
21 snapshot-external files retain their exact identities, and the full extra-file
set is compared by path, not merely by count. A new file grows that set without
rewriting the DB48 manifest.

The candidate must also preserve the complete migration prefix at the comparison
commit, including migrations added after the frozen 69. In CI,
`MIGRATION_BASE_COMMIT` is the event's exact PR base SHA. Locally the default is the
locally recorded `refs/remotes/origin/develop` (not a live remote check); an explicit
40-character ancestor SHA can be supplied through the same variable. Missing
history/ref or invalid/non-ancestor comparison commits fail closed.

When adding a migration, commit only the new SQL in its own reviewed task, use a
unique version greater than the previous maximum, and run the offline checks and
isolated replay against the current develop base. Do **not** increment 69, change
the frozen digest/baseline, or add the file to historical DB48. Extend scoped
behavior/ACL/RLS checks when the new migration requires them. A newly encountered
production-specific guard is not automatically bypassed.

## Three fresh-install copies and private ledger

Only these canonical sources receive temporary test copies:

1. `20261010220000`: one missing semicolon, with exact byte reversal proof.
2. `20261017213000`: replace only the production count=46 condition with the
   exact successful 67-version prefix and prepend a test-only assertion.
3. `20261018234500`: the same treatment for count=47 / the 68-version prefix.

Reversing the replacements reproduces the original SQL exactly. Function hashes,
operator, role/membership, owner, schema/EXECUTE ACL and security postconditions
remain intact. No canonical SQL, production GUC or bypass switch is added.
History and the private successful-order/hash ledger are recorded only after SQL
success. Each next migration validates the completed prefix. The run ledger binds
UUID, candidate commit, frozen baseline commit and exact image; negative fixtures
roll back and recheck both positive guards and unchanged ledger/history.

## Local Docker and CI

- Windows: only `desktop-linux` with
  `npipe:////./pipe/dockerDesktopLinuxEngine`.
- Linux: only `default` with `unix:///var/run/docker.sock`.
- Remote/unexpected context endpoints and conflicting Docker host/context/TLS
  environment settings fail without printing their values. Daemon operations use
  the fixed local `--host`, with ambient connection overrides removed.
- The same digest-pinned Supabase PG17.6 image is used on both platforms:
  `ghcr.io/supabase/postgres@sha256:3866d94d8426927e8db3f1c5d790752292bfbe27b5f1f46e199ae1b7d3c1710b`.
- UUID/exact ID/name/image ownership, `network=none`, no ports or host/persistent
  mounts, tmpfs, non-superuser postgres and an empty baseline remain required.
  Cleanup removes only the verified task container/tmpfs; cleanup failure is FAIL.

The workflow runs on every `pull_request` targeting `develop`, on `ubuntu-24.04`,
with no path filter (including documentation-only PRs).
It uses commit-pinned official actions, full Git history, Node 24 and
`contents: read` / `packages: read`, with checkout credentials not persisted.
The job's GitHub token authenticates only the pinned GHCR preload through a
temporary Docker config; logout and credential cleanup are enforced.
No package install, repository secrets, existing DB, deploy or
`pull_request_target` is used.
It runs offline fixtures first, preloads only the pinned image on the local socket,
then runs the isolated replay. `TMPDIR` is the runner temp directory; `always()`
uploads only generated SQL/test evidence and the offline result for seven days.
The runner never pulls an image or starts Docker itself. No private local DB48
result is required in CI; `--db48-evidence <existing-result.json>` remains optional.

Commands (run from this worktree, with Docker already running and image present):

```text
node scripts/check-canonical-replay-compatibility.mjs
node scripts/replay-canonical-clean-install.mjs
```

## GHCR registry identity verification

The official [Supabase GHCR package](https://github.com/supabase/postgres/pkgs/container/postgres)
serves the exact same immutable index as ECR, tagged `17.6.1.155` in the local ECR cache.
Both registries' raw index bytes were independently SHA-256 checked against the
pinned digest above and compared byte-for-byte. The Linux/amd64 child manifest is
`sha256:3e2a7ab48783077d0122dc72ed5174afb543110c38266c845716c51d130658e4` in both.
Only the registry reference changes; no newer PostgreSQL build is substituted.
The shared image constant also updates container ownership and private-ledger
identity assertions. SQL, Docker isolation and cleanup logic are unchanged.

The evidence below belongs to the previous ECR reference and harness hashes.
It remains historical local evidence, separate from the later Migration CI PASS
reported at closure. It is not relabeled as a run of the updated GHCR harness.

## Historical local verification (ECR reference)

- Local Windows offline fixtures: **60/60 PASS**, including all 69 frozen hashes,
  N=70/N=71 append-only prefixes, prior-tail immutability, DB48/21 identity and
  Docker remote-endpoint/environment rejection with credential-redaction canaries.
- Fresh Windows Docker Desktop / **PG17.6 replay: 69/69 PASS**,
  **18/18 scoped ACL/RLS postchecks**, **30/30 live negative fixtures**.
  The six additional negatives bind candidate commit, frozen baseline and image
  at both historical guards. Each negative transaction rolled back.
- YAML/read-only trigger/full-history/pinned-image/base/artifact structure: PASS
  through local PyYAML validation. Official action commit refs verified read-only.
- Existing ownership/isolation/SQL execution, 18 postchecks and cleanup blocks
  compared byte-for-byte with the base runner: unchanged.
- 69 saved replay copies regenerated and compared; exactly three transformations.
  Result source/harness hashes match. The exact task container is absent after cleanup.
- This historical local run did not execute Linux replay. Early GitHub runs
  failed at ECR preload; later authenticated GHCR preload and CI acceptance
  closed ENG-003A as recorded above. The old failure is not a current blocker.

Local evidence (OS temp; not tracked or assumed in a clean clone):

- `eng003a-offline.json`; SHA-256 `3b6ee5c8f1268bb8feb02fc3bf1a9ca714bb714ace7793e684bd2bdcfc82c742`.
- `eng003a-pg17.log` and `kpss-eng002c-boundary-OFh1ze/result.json`.
- Replay result SHA-256: `6b300db455a29ed378ab8811cc67facbcc941dc9983eb5ff738bae6b91ac23bd`.
- Canonical source commit and comparison commit both
  `d8b576b517f13aa06d0d52b03aa3233295d8592e`; the dirty harness is identified below.

| Harness file | SHA-256 during replay |
| --- | --- |
| `scripts/replay-canonical-clean-install.mjs` | `df45cfb3a159bf48ecc9f9ea615182fe343419461257ed1e3bfb97df358a3b2a` |
| `scripts/lib/canonical-replay-compatibility.mjs` | `055372d450890fd64e6de0437c8b97365396d0aef229bb7f23d0d252572e890c` |
| `scripts/check-canonical-replay-compatibility.mjs` | `069e6f9bff4e0d698f891bea04c67b6cd3d1f70e5f8cac7db7ec5107f0366406` |
| `.github/workflows/migration-replay.yml` | `d2ad0200edc966d202642bbb6ce4e3264d5aa77ab65facf8103761ff0c4605f8` |

## Limits and historical evidence

PostgreSQL 15 replay remains incompatible with the PG16+ role membership syntax
and catalog fields in `20261015130000`, `20261017213000`, `20261018234500`.
No PG15 or full Supabase/application runtime acceptance is claimed. PG17 PASS
means replay of the three temporary compatibility copies, not unchanged canonical
fresh-install success or production acceptance.

**PG17 test ortamı production uyumluluğunu kanıtlamaz.** Production PostgreSQL
version remains UNKNOWN. Neither Migration CI nor Application CI proves parity
with the deployed database, full Auth/Edge/PostgREST runtime, all ACL/RLS behavior
or user acceptance. The 18 scoped postchecks are not comprehensive security
coverage. Canonical/applied SQL and production history remain unchanged.

Historical ENG-002C evidence remains a separate result: 69/69 PG17.6 replay,
18/18 scoped postchecks, 24/24 live negative fixtures and 20/20 offline checks.
Its OS-temp `kpss-eng002c-boundary-ZFkrt7/result.json` SHA-256 is
`e380404b1cdb1516eeba00dd47aabd23c9eb5ff6b9d49f37db7af88282c8031f`.
The previous DB48 48/48 replay / 10/10 postcheck result SHA-256 is
`d23906924870bb901f05bd2603c6d4a280f8d9a77282cecb552e41775ba10c45`.
These historical files are not copied into the repository or assumed in a clean clone.
