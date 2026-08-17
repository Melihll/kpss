type TaskResource = { name: string; resource_type?: string | null };

function firstObject(value: unknown): any | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === "object" ? value : null;
}

function resourceFrom(value: unknown): TaskResource | null {
  const candidate = firstObject(value);
  return typeof candidate?.name === "string" && candidate.name.trim()
    ? { name: candidate.name, resource_type: candidate.resource_type ?? null }
    : null;
}

/** Reads the importer-owned baseline dedupe metadata; it is not a priority score. */
export function baselineExecutionOrder(task: { source_reason?: unknown; dedupe_key?: unknown }): number | null {
  if (task.source_reason !== "baseline_import" || typeof task.dedupe_key !== "string") return null;
  const parts = task.dedupe_key.split(":");
  if (parts.length !== 5 || parts[0] !== "baseline" || !/^\d{4}-\d{2}-\d{2}$/.test(parts[1] ?? "")
    || !/^\d{4}-\d{2}-\d{2}$/.test(parts[2] ?? "") || !/^\d+$/.test(parts[3] ?? "")) return null;
  const order = Number(parts[3]);
  return Number.isSafeInteger(order) && order > 0 ? order : null;
}

/** Resolves a real relation, never a title/description-derived resource name. */
export function resolveTaskResource(task: any): TaskResource | null {
  const direct = resourceFrom(task?.resources);
  if (direct) return direct;

  const section = firstObject(task?.resource_sections);
  const fromSection = resourceFrom(section?.resources);
  if (fromSection) return fromSection;

  for (const link of task?.task_resource_units ?? []) {
    const unit = firstObject(link?.resource_units);
    const fromUnit = resourceFrom(unit?.resources);
    if (fromUnit) return fromUnit;
  }
  return null;
}

export function hydrateTaskResource(task: any) {
  const resources = resolveTaskResource(task);
  return resources ? { ...task, resources } : task;
}
