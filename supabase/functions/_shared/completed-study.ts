export interface CompletedStudySessionRow {
  resource_id?: string | null;
  duration_minutes?: number | null;
  started_at?: string | null;
}

export function aggregateCompletedStudySessions(
  rows: readonly CompletedStudySessionRow[],
  timeZone = "Europe/Istanbul",
) {
  const actualByDate = new Map<string, number>();
  const actualByResource = new Map<string, number>();

  for (const row of rows) {
    const minutes = Math.max(0, Number(row.duration_minutes ?? 0));
    if (row.started_at) {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(row.started_at));
      actualByDate.set(date, (actualByDate.get(date) ?? 0) + minutes);
    }
    if (row.resource_id) {
      actualByResource.set(row.resource_id, (actualByResource.get(row.resource_id) ?? 0) + minutes);
    }
  }

  return { actualByDate, actualByResource };
}

export interface PlannedCreditAllocationRow {
  planned_credit_minutes?: number | null;
  study_sessions?:
    | { started_at?: string | null }
    | Array<{ started_at?: string | null }>
    | null;
}

export function aggregatePlannedCreditByDate(
  rows: readonly PlannedCreditAllocationRow[],
  timeZone = "Europe/Istanbul",
) {
  const plannedCreditByDate = new Map<string, number>();

  for (const row of rows) {
    const session = Array.isArray(row.study_sessions)
      ? row.study_sessions[0]
      : row.study_sessions;
    if (!session?.started_at) continue;

    const minutes = Math.max(0, Number(row.planned_credit_minutes ?? 0));
    const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(session.started_at));
    plannedCreditByDate.set(date, (plannedCreditByDate.get(date) ?? 0) + minutes);
  }

  return plannedCreditByDate;
}
