import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildBaselineExecutionPlan,
  buildCanonicalModel,
  buildDataOnlyDryRun,
  canonicalUnitTypeToResourceUnitType,
  loadCanonicalInputs,
  repositoryRoot,
} from "../scripts/import-p48-canonical.mjs";

const inputs = await loadCanonicalInputs(repositoryRoot);
const model = buildCanonicalModel(inputs);
const baseline = buildBaselineExecutionPlan(model, inputs.baseline);

describe("P48 canonical data preparation", () => {
  it("freezes all 231 mappings without unresolved records", () => {
    expect(inputs.mapping.mappings).toHaveLength(231);
    expect(inputs.mapping.summary).toMatchObject({ total: 231, exact: 16, approved: 209, not_applicable: 6 });
    expect(inputs.mapping.mappings.some((row) => row.mapping_status === "unresolved")).toBe(false);
    expect(new Set(inputs.mapping.mappings.map((row) => `${row.resource}|${row.canonical_seq}`)).size).toBe(231);
  });

  it("contains the five human-approved curriculum nodes in the additive migration", async () => {
    const migration = await readFile(resolve(repositoryRoot, "supabase/migrations/20260816200000_p48_canonical_infrastructure.sql"), "utf8");
    for (const suffix of ["000306", "000307", "000308", "001309", "001310"]) {
      expect(migration).toContain(`30000000-0000-0000-0000-000000${suffix}`);
    }
  });

  it("preserves special planning roles and excludes them from curriculum mappings", () => {
    const special = inputs.mapping.mappings.filter((row) => row.planning_role !== "curriculum");
    expect(special).toHaveLength(6);
    expect(special.filter((row) => row.planning_role === "review_only")).toHaveLength(4);
    expect(special.filter((row) => row.planning_role === "mixed_review")).toHaveLength(1);
    expect(special.filter((row) => row.planning_role === "reference_only")).toHaveLength(1);
    expect(special.every((row) => row.mapping_status === "not_applicable" && row.candidate_curriculum_node_id === null)).toBe(true);
  });

  it("loads 13 complete resources plus only the three pilot-required previous resources", () => {
    expect(model.resources).toHaveLength(16);
    expect(model.sections).toHaveLength(237);
    expect(model.fullScopeReferences.size).toBe(13);
    expect(model.partialScopeReferences.size).toBe(3);
    expect(model.conflicts).toEqual([]);
  });

  it("uses stable resource aliases for both Economicus volume names", () => {
    expect(model.aliasByName.get("Economicus İktisat Soru Bankası Cilt 1 – Mikro / Uluslararası / Büyüme-Kalkınma / Türkiye Ekonomisi / Doktrinler"))
      .toBe("31000000-0000-0000-0000-000000000021");
    expect(model.aliasByName.get("Economicus İktisat Soru Bankası 1 – Mikro İktisat"))
      .toBe("31000000-0000-0000-0000-000000000021");
    expect(model.aliasByName.get("Economicus İktisat Soru Bankası Cilt 2 – Makro İktisat / Para-Banka-Kredi"))
      .toBe("31000000-0000-0000-0000-000000000022");
  });

  it("covers the same 26 stable reference resources as the catalog", async () => {
    const catalog = JSON.parse(await readFile(resolve(repositoryRoot, "docs/P48_RESOURCE_CATALOG.json"), "utf8"));
    expect(inputs.aliases.resources).toHaveLength(catalog.resources.length);
    for (const [index, resource] of catalog.resources.entries()) {
      const alias = inputs.aliases.resources[index];
      expect(alias.reference_resource_id).toBe(`31000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);
      expect(alias.aliases).toContain(resource.name);
    }
  });

  it("preserves page evidence metadata and fails closed on unknown unit types", () => {
    const consumer = model.sections.find((section) => section.resourceName === "Economicus Mikro İktisat – Konu Anlatımlı" && section.sortOrder === 2);
    expect(consumer).toMatchObject({ pageStart: 23, pageEnd: 70, physicalRange: "s.23–70", basis: "start_verified_end_inferred", confidence: "medium" });
    expect(consumer.evidence).toBeTruthy();
    expect(canonicalUnitTypeToResourceUnitType("konu")).toBe("chapter");
    expect(canonicalUnitTypeToResourceUnitType("soru_bankası_bloğu")).toBe("test");
    expect(canonicalUnitTypeToResourceUnitType("test")).toBe("test");
    expect(canonicalUnitTypeToResourceUnitType("çözüm")).toBe("reading");
    expect(() => canonicalUnitTypeToResourceUnitType("bilinmeyen")).toThrow("UNSUPPORTED_CANONICAL_UNIT_TYPE");
  });

  it("builds two independent Tüketici execution units", () => {
    const units = baseline.units.filter((unit) => unit.sectionCanonicalKey.endsWith("000000000018:section:002"));
    expect(units.map((unit) => [unit.pageStart, unit.pageEnd, unit.estimatedMinutes])).toEqual([[23, 46, 90], [47, 70, 90]]);
    expect(new Set(units.map((unit) => unit.externalKey)).size).toBe(2);
  });

  it("separates 35 academic tasks from seven reserve rows and keeps approved capacity semantics", () => {
    expect(baseline).toMatchObject({
      inputTaskCount: 42,
      academicTaskCount: 35,
      reserveRowCount: 7,
      capacityMinutes: 2520,
      planningBudgetMinutes: 2310,
      reserveMinutes: 210,
    });
    expect(baseline.tasks).toHaveLength(35);
    expect(baseline.tasks.every((task) => task.curriculumNodeId && task.resourceSectionCanonicalKey)).toBe(true);
    expect(baseline.units).toHaveLength(45);
    expect(baseline.dailyCapacity).toHaveLength(7);
    expect(baseline.dailyCapacity.map((day) => day.reserveMinutes)).toEqual([30, 15, 30, 30, 30, 30, 45]);
    expect(baseline.dailyCapacity.map((day) => day.capacityMinutes - day.reserveMinutes)).toEqual([330, 345, 330, 330, 330, 330, 315]);
    expect(baseline.conflicts).toEqual([]);
  });

  it("produces a non-writing dry-run with complete counts", () => {
    const dryRun = buildDataOnlyDryRun(model, baseline);
    expect(dryRun).toMatchObject({
      mode: "dry-run",
      inputResources: 16,
      inputSections: 237,
      executionUnits: 45,
      baselineAcademicTasks: 35,
      baselineReserveRows: 7,
      unresolved: 0,
      conflict: [],
      wouldWrite: false,
    });
    expect(dryRun.capacity.dailyCapacity.map((day: any) => day.planningCapacityMinutes)).toEqual([330, 345, 330, 330, 330, 330, 315]);
  });
});
