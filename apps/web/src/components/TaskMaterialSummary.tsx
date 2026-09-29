import type { RoadmapTask } from "../lib/roadmap";
import { taskMaterialPresentation } from "../lib/task-material-presentation";
import type { ResourceDetailTab } from "./ResourceDetailDrawer";
import { Icon } from "./Icon";

interface TaskMaterialSummaryProps {
  readonly task: RoadmapTask;
  readonly compact?: boolean;
}

export function TaskMaterialSummary({ task, compact = false }: TaskMaterialSummaryProps) {
  const material = taskMaterialPresentation(task);
  if (!material) {
    return <div className={`task-material-summary is-unavailable ${compact ? "is-compact" : ""}`}>
      <Icon name="book" />
      <div><strong>Materyal bağlı değil</strong><span>Bu görev için açılabilir bir kaynak yok.</span></div>
    </div>;
  }

  return <div className={`task-material-summary ${material.completed ? "is-complete" : ""} ${material.exact ? "is-exact" : "is-resource"} ${compact ? "is-compact" : ""}`}>
    <Icon name={material.completed ? "check" : "book"} weight={material.completed ? "bold" : "regular"} />
    <div>
      <span>{material.resourceName}</span>
      <strong>{material.scopeLabel}</strong>
      {material.progressLabel && <small>{material.progressLabel}</small>}
    </div>
  </div>;
}

interface TaskMaterialActionsProps {
  readonly task: RoadmapTask;
  readonly onOpen: (task: RoadmapTask, tab?: ResourceDetailTab) => void;
  readonly compact?: boolean;
}

export function TaskMaterialActions({
  task,
  onOpen,
  compact = false,
}: TaskMaterialActionsProps) {
  const available = Boolean(taskMaterialPresentation(task));
  const unavailableTitle = available ? undefined : "Bu göreve bağlı kaynak yok.";

  return <div className={`today-material-actions ${compact ? "is-compact" : ""}`}>
    <button
      type="button"
      disabled={!available}
      title={unavailableTitle}
      onClick={() => onOpen(task)}
    >
      <strong>Kaynakla çalış</strong>
      {!compact && <span>Bağlı materyali aç</span>}
    </button>
    <button
      type="button"
      disabled={!available}
      title={unavailableTitle}
      onClick={() => onOpen(task, "video")}
    >
      <strong>Video izle</strong>
      {!compact && <span>Video sekmesine geç</span>}
    </button>
    <button
      type="button"
      disabled={!available}
      title={unavailableTitle}
      onClick={() => onOpen(task, "page")}
    >
      <strong>Sayfa gir</strong>
      {!compact && <span>Sayfa ilerlemesini güncelle</span>}
    </button>
  </div>;
}

interface TaskMaterialOpenButtonProps {
  readonly task: RoadmapTask;
  readonly onOpen: (task: RoadmapTask, tab?: ResourceDetailTab) => void;
}

export function TaskMaterialOpenButton({ task, onOpen }: TaskMaterialOpenButtonProps) {
  const material = taskMaterialPresentation(task);
  if (!material) return null;
  return <button className="task-material-open" type="button" onClick={() => onOpen(task)}>
    <span>{task.material_scope?.kind === "full_video" ? "Videoyu aç" : "Materyali aç"}</span>
    <Icon name="arrow" />
  </button>;
}
