import type { ResourceUnitType } from "./types";
import { DomainValidationError } from "./capacity";

const RESOURCE_UNIT_TYPES: readonly ResourceUnitType[] = [
  "test",
  "video",
  "chapter",
  "reading",
  "mock",
  "other",
];

export interface BulkResourceUnitInput {
  prefix: string;
  start: number;
  end: number;
  unitType: ResourceUnitType;
  existingNames?: readonly string[];
}

export interface GeneratedResourceUnit {
  name: string;
  unitType: ResourceUnitType;
  sortOrder: number;
}

export function createBulkResourceUnits(input: BulkResourceUnitInput): GeneratedResourceUnit[] {
  const prefix = input.prefix.trim();
  if (!prefix) throw new DomainValidationError("Unit prefix is required");
  if (!Number.isInteger(input.start) || !Number.isInteger(input.end)) {
    throw new DomainValidationError("Unit range must use integers");
  }
  if (input.start < 1 || input.end < input.start || input.end - input.start + 1 > 200) {
    throw new DomainValidationError("Unit range must contain between 1 and 200 items");
  }
  if (!RESOURCE_UNIT_TYPES.includes(input.unitType)) {
    throw new DomainValidationError(`Invalid resource unit type: ${input.unitType}`);
  }

  const existing = new Set((input.existingNames ?? []).map((name) => name.trim().toLocaleLowerCase("tr")));
  const units = Array.from({ length: input.end - input.start + 1 }, (_, offset) => {
    const number = input.start + offset;
    return { name: `${prefix} ${number}`, unitType: input.unitType, sortOrder: number };
  });

  const duplicate = units.find((unit) => existing.has(unit.name.toLocaleLowerCase("tr")));
  if (duplicate) throw new DomainValidationError(`Duplicate resource unit: ${duplicate.name}`);
  return units;
}
