import type { ResourceRole, ResourceUnitType } from "../types";

export const DEFAULT_WEEKLY_UTILIZATION = 0.85;
export const MAX_RESOURCE_UNITS_PER_TASK = 2;
export const DEFAULT_LEARN_TOPIC_MINUTES = 60;
export const PLANNING_GENERATION_VERSION = 1;

export const DEFAULT_RESOURCE_UNIT_MINUTES: Readonly<Record<ResourceUnitType, number>> = {
  test: 30,
  video: 45,
  chapter: 45,
  reading: 30,
  mock: 60,
  other: 30,
};

export const RESOURCE_ROLE_ORDER: readonly ResourceRole[] = [
  "primary",
  "reinforcement",
  "revision",
  "advanced",
  "mock",
];

export const PRIORITY = {
  base: 40,
  carryover: 30,
  remediation: 20,
  practicing: 10,
  learning: 5,
  primaryResource: 5,
} as const;
