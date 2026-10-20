// Offline, read-only verification of the historical DB48 release snapshot.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(root, "supabase/migrations");
const manifestPath = path.join(root, "docs/product/migration-provenance/db48.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Byte-level CRLF -> LF only: preserve BOMs, spaces, lone CR and final newlines.
function normalizeCRLF(bytes) {
  const result = Buffer.allocUnsafe(bytes.length);
  let length = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10) continue;
    result[length++] = bytes[index];
  }
  return result.subarray(0, length);
}

function verify() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.snapshot.id !== "DB48" ||
      manifest.snapshot.liveProductionVerified !== false ||
      manifest.snapshot.productionSqlBytesDirectlyVerified !== false ||
      !Array.isArray(manifest.migrations) || manifest.migrations.length !== 48) {
    throw new Error("Invalid historical DB48 manifest or snapshot boundary.");
  }

  const failures = [];
  const versions = new Set();
  const expectedFiles = new Set();
  const counts = {
    checked: 0,
    manifestSourceVsReleaseRawExact: 0,
    manifestSourceVsReleaseCrlfOnly: 0,
    checkoutVsSourceRawExact: 0,
    checkoutVsSourceCrlfOnly: 0,
    checkoutVsReleaseRawExact: 0,
    checkoutVsReleaseCrlfOnly: 0,
  };

  for (const row of manifest.migrations) {
    const validName = /^\d{14}_[a-z0-9_]+\.sql$/.test(row.filename);
    const validHashes = [
      row.releaseArtifactSha256,
      row.canonicalSourceSha256,
      row.lfNormalizedSha256,
    ].every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value));
    if (!validName || row.version !== row.filename.slice(0, 14) ||
        row.canonicalPath !== `supabase/migrations/${row.filename}` ||
        !validHashes || versions.has(row.version) || expectedFiles.has(row.filename)) {
      failures.push({ file: row.filename, reason: "INVALID_MANIFEST_ENTRY" });
      continue;
    }
    versions.add(row.version);
    expectedFiles.add(row.filename);

    const rawSourceEqualsRelease = row.canonicalSourceSha256 === row.releaseArtifactSha256;
    if (row.canonicalVsRelease.rawSha256Equal !== rawSourceEqualsRelease ||
        row.canonicalVsRelease.equalAfterCRLFToLF !== true ||
        row.canonicalVsRelease.classification !== (rawSourceEqualsRelease ? "RAW_EXACT" : "CRLF_ONLY")) {
      failures.push({ file: row.filename, reason: "INCONSISTENT_HASH_CLASSIFICATION" });
      continue;
    }
    counts[rawSourceEqualsRelease ? "manifestSourceVsReleaseRawExact" : "manifestSourceVsReleaseCrlfOnly"]++;

    const absolute = path.join(root, row.canonicalPath);
    let bytes;
    try {
      const metadata = lstatSync(absolute);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        failures.push({ file: row.filename, reason: "NOT_A_REGULAR_CANONICAL_FILE" });
        continue;
      }
      bytes = readFileSync(absolute);
    } catch (error) {
      failures.push({ file: row.filename, reason: error.code === "ENOENT" ? "MISSING_FILE" : "UNREADABLE_FILE" });
      continue;
    }

    const raw = sha256(bytes);
    const normalized = sha256(normalizeCRLF(bytes));
    if (normalized !== row.lfNormalizedSha256) {
      failures.push({
        file: row.filename,
        reason: "CONTENT_DRIFT",
        actualRawSha256: raw,
        actualLfNormalizedSha256: normalized,
        expectedLfNormalizedSha256: row.lfNormalizedSha256,
      });
      continue;
    }
    counts.checked++;
    counts[raw === row.canonicalSourceSha256 ? "checkoutVsSourceRawExact" : "checkoutVsSourceCrlfOnly"]++;
    counts[raw === row.releaseArtifactSha256 ? "checkoutVsReleaseRawExact" : "checkoutVsReleaseCrlfOnly"]++;
  }

  const unexpectedMigrationFiles = readdirSync(migrationDirectory, { withFileTypes: true })
    .filter((entry) => entry.name.toLowerCase().endsWith(".sql") && !expectedFiles.has(entry.name))
    .map((entry) => `supabase/migrations/${entry.name}`)
    .sort();
  for (const file of unexpectedMigrationFiles) {
    if (versions.has(path.basename(file).slice(0, 14))) {
      failures.push({ file, reason: "DUPLICATE_DB48_VERSION_OUTSIDE_MANIFEST" });
    }
  }

  const result = {
    status: failures.length === 0 && counts.checked === 48 ? "PASS" : "FAIL",
    snapshot: "Historical release evidence; not live production verification.",
    counts,
    unexpectedMigrationFiles,
    unexpectedMigrationPolicy: "Reported separately; not evidence of applied or pending production migrations. Duplicate DB48 versions fail.",
    failures,
    freshInstall: "BLOCKED: 20261010220000 missing statement terminator; ENG-002B.",
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "PASS" ? 0 : 1;
}

try {
  verify();
} catch (error) {
  console.error(`Migration provenance FAIL: ${error.message}`);
  process.exitCode = 1;
}
