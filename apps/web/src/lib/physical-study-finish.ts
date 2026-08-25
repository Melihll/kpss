export interface PhysicalFinishCapture {
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly startPageBoundary: number;
}

export type PhysicalFinishBoundaryValidation =
  | { readonly ok: true; readonly boundary: number; readonly zeroProgress: boolean }
  | {
    readonly ok: false;
    readonly code:
      | "PHYSICAL_PAGE_BOUNDARY_REQUIRED"
      | "PHYSICAL_PAGE_BOUNDARY_INVALID"
      | "PHYSICAL_PROGRESS_REVERSAL";
  };

export function validatePhysicalFinishBoundary(
  capture: PhysicalFinishCapture,
  raw: string,
): PhysicalFinishBoundaryValidation {
  if (!raw.trim()) return { ok: false, code: "PHYSICAL_PAGE_BOUNDARY_REQUIRED" };
  const boundary = Number(raw);
  if (!Number.isInteger(boundary)) return { ok: false, code: "PHYSICAL_PAGE_BOUNDARY_INVALID" };
  if (boundary < capture.startPageBoundary) return { ok: false, code: "PHYSICAL_PROGRESS_REVERSAL" };
  if (boundary < capture.pageStart - 1 || boundary > capture.pageEnd) {
    return { ok: false, code: "PHYSICAL_PAGE_BOUNDARY_INVALID" };
  }
  return { ok: true, boundary, zeroProgress: boundary === capture.startPageBoundary };
}
