export interface ResourceProgressInput {
  readonly totalPages: number;
  readonly currentPage: number;
}

export interface NormalizedResourceProgress {
  readonly totalPages: number;
  readonly currentPage: number;
  readonly progressPercent: number;
  readonly completed: boolean;
}

export interface ResourceProgressRow {
  readonly resource_id: string;
  readonly current_page: number;
  readonly total_pages: number;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
}

export interface ResourceProgressView {
  readonly resourceId: string;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly progressPercent: number;
  readonly completed: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export function normalizeResourceProgress(
  input: ResourceProgressInput,
): NormalizedResourceProgress {
  if (
    !Number.isFinite(input.totalPages) ||
    !Number.isInteger(input.totalPages) ||
    input.totalPages <= 0
  ) {
    throw new Error("RESOURCE_PROGRESS_INVALID_TOTAL_PAGES");
  }

  if (
    !Number.isFinite(input.currentPage) ||
    !Number.isInteger(input.currentPage) ||
    input.currentPage < 0 ||
    input.currentPage > input.totalPages
  ) {
    throw new Error("RESOURCE_PROGRESS_INVALID_CURRENT_PAGE");
  }

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round((input.currentPage / input.totalPages) * 100)),
  );

  return Object.freeze({
    totalPages: input.totalPages,
    currentPage: input.currentPage,
    progressPercent,
    completed: input.currentPage === input.totalPages,
  });
}

export function presentResourceProgress(
  row: ResourceProgressRow,
): ResourceProgressView {
  const normalized = normalizeResourceProgress({
    totalPages: Number(row.total_pages),
    currentPage: Number(row.current_page),
  });

  return Object.freeze({
    resourceId: row.resource_id,
    currentPage: normalized.currentPage,
    totalPages: normalized.totalPages,
    progressPercent: normalized.progressPercent,
    completed: normalized.completed,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  });
}