export interface ResourcePageProgress {
  readonly resourceId: string;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly progressPercent: number;
  readonly completed: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface ResourceProgressResponse {
  readonly resource: {
    readonly id: string;
    readonly name: string;
    readonly resourceType: string;
  };
  readonly progress: ResourcePageProgress | null;
}

export function resourceProgressPercent(
  forecastPercent: number,
  forecastCompleted: boolean,
  pageProgress: ResourcePageProgress | null,
): number {
  if (pageProgress) return pageProgress.progressPercent;
  return forecastCompleted ? 100 : forecastPercent;
}

export function resourcePageLabel(
  pageProgress: ResourcePageProgress | null,
): string | null {
  if (!pageProgress) return null;
  return `${pageProgress.currentPage} / ${pageProgress.totalPages} sayfa`;
}

export function validateResourcePageForm(input: {
  readonly totalPages: number;
  readonly currentPage: number;
}): string | null {
  if (!Number.isInteger(input.totalPages) || input.totalPages <= 0) {
    return "Toplam sayfa sayısı 1 veya daha büyük bir tam sayı olmalı.";
  }
  if (
    !Number.isInteger(input.currentPage) ||
    input.currentPage < 0 ||
    input.currentPage > input.totalPages
  ) {
    return "Kaldığınız sayfa 0 ile toplam sayfa arasında olmalı.";
  }
  return null;
}