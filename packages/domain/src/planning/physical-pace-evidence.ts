import type { PhysicalSourceUnitType } from "./material-unit-view";

export type PhysicalPaceMaterialType = "page_range" | "test";

export type PhysicalPaceCompletionResult =
  | {
      readonly status: "accepted";
      readonly startPageBoundary: number;
      readonly endPageBoundary: number;
      readonly progressedPages: number;
      readonly resultingProgressState: "in_progress" | "completed";
    }
  | {
      readonly status: "zero_progress";
      readonly startPageBoundary: number;
      readonly endPageBoundary: number;
      readonly progressedPages: 0;
      readonly resultingProgressState: "in_progress";
    }
  | {
      readonly status: "rejected";
      readonly reason: "invalid_page_boundary" | "progress_reversal";
    };

export interface PhysicalPaceCompletionInput {
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly startPageBoundary: number;
  readonly endPageBoundary: number;
}

export function physicalPaceMaterialType(
  sourceUnitType: PhysicalSourceUnitType,
  hasExactPageRange: boolean,
): PhysicalPaceMaterialType | null {
  if (!hasExactPageRange) return null;
  return sourceUnitType === "test"
    ? "test"
    : "page_range";
}

export function evaluatePhysicalPaceCompletion(
  input: PhysicalPaceCompletionInput,
): PhysicalPaceCompletionResult {
  const values = [
    input.pageStart,
    input.pageEnd,
    input.startPageBoundary,
    input.endPageBoundary,
  ];
  const validRange = values.every(Number.isInteger) &&
    input.pageStart > 0 &&
    input.pageEnd >= input.pageStart &&
    input.startPageBoundary >= input.pageStart - 1 &&
    input.startPageBoundary <= input.pageEnd &&
    input.endPageBoundary >= input.pageStart - 1 &&
    input.endPageBoundary <= input.pageEnd;

  if (!validRange) {
    return Object.freeze({
      status: "rejected" as const,
      reason: "invalid_page_boundary" as const,
    });
  }

  if (input.endPageBoundary < input.startPageBoundary) {
    return Object.freeze({
      status: "rejected" as const,
      reason: "progress_reversal" as const,
    });
  }

  const progressedPages = input.endPageBoundary - input.startPageBoundary;
  if (progressedPages === 0) {
    return Object.freeze({
      status: "zero_progress" as const,
      startPageBoundary: input.startPageBoundary,
      endPageBoundary: input.endPageBoundary,
      progressedPages: 0 as const,
      resultingProgressState: "in_progress" as const,
    });
  }

  return Object.freeze({
    status: "accepted" as const,
    startPageBoundary: input.startPageBoundary,
    endPageBoundary: input.endPageBoundary,
    progressedPages,
    resultingProgressState: input.endPageBoundary === input.pageEnd
      ? "completed" as const
      : "in_progress" as const,
  });
}
