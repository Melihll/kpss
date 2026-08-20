import { useEffect, useState } from "react";
import type { RoadmapTask } from "../lib/roadmap";
import { AppApiError, FRIENDLY_API_ERRORS, callAppApi } from "../lib/app-api";
import {
  taskActionLabel,
  taskActionMessage,
  taskActionStatusLabel,
  type TaskActionPreviewAction,
  type TaskActionPreviewResponse,
} from "../lib/task-action-preview-ui";
import { Icon } from "./Icon";

interface TaskActionRequest {
  readonly task: RoadmapTask;
  readonly action: TaskActionPreviewAction;
}

interface TaskActionPreviewDrawerProps {
  readonly request: TaskActionRequest | null;
  readonly onClose: () => void;
}

export function TaskActionPreviewDrawer({
  request,
  onClose,
}: TaskActionPreviewDrawerProps) {
  const [action, setAction] = useState<TaskActionPreviewAction | null>(null);
  const [preview, setPreview] = useState<TaskActionPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) {
      setAction(null);
      setPreview(null);
      setError(null);
      return;
    }
    setAction(request.action);
  }, [request]);

  useEffect(() => {
    if (!request || !action) return;

    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);

    void callAppApi<TaskActionPreviewResponse>(
      `/tasks/${request.task.id}/action-preview`,
      {
        method: "POST",
        body: { action },
      },
    )
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((caught) => {
        if (cancelled) return;
        console.error("TASK_ACTION_PREVIEW_FAILED", caught);
        if (caught instanceof AppApiError) {
          setError(
            FRIENDLY_API_ERRORS[caught.code] ??
            "Görev değişikliği önizlenemedi.",
          );
        } else {
          setError("Görev değişikliği önizlenemedi.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, request]);

  useEffect(() => {
    if (!request) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, request]);

  if (!request) return null;

  return <>
    <button
      className="task-action-backdrop"
      type="button"
      aria-label="Görev işlem önizlemesini kapat"
      onClick={onClose}
    />
    <aside
      className="task-action-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-action-title"
    >
      <header className="task-action-drawer-header">
        <div>
          <span>Görev işlemi · Önizleme</span>
          <h2 id="task-action-title">{request.task.title}</h2>
        </div>
        <button
          className="task-action-close"
          type="button"
          aria-label="Kapat"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="task-action-drawer-body">
        <div className="task-action-tabs" aria-label="Görev işlemleri">
          {(["DEFER", "REMOVE_TODAY", "DURATION_DETAILS"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={action === item ? "is-active" : ""}
              onClick={() => setAction(item)}
              disabled={loading}
            >
              {taskActionLabel(item)}
            </button>
          ))}
        </div>

        {loading && (
          <div className="task-action-loading" aria-live="polite">
            <span />
            Güvenli önizleme hazırlanıyor…
          </div>
        )}

        {error && (
          <div className="task-action-error" role="alert">
            {error}
          </div>
        )}

        {preview && (
          <section
            className={`task-action-result is-${preview.status.toLowerCase()}`}
            aria-live="polite"
          >
            <div className="task-action-result-state">
              {taskActionStatusLabel(preview)}
            </div>

            <span className="task-action-subject">
              {preview.task.subjectName ?? "Ders"}
              {preview.task.resourceName ? ` · ${preview.task.resourceName}` : ""}
            </span>
            <h3>{preview.task.title}</h3>
            <p>{taskActionMessage(preview)}</p>

            <dl>
              <div>
                <dt>Planlanan</dt>
                <dd>{preview.duration.estimatedMinutes} dk</dd>
              </div>
              <div>
                <dt>Tamamlanan</dt>
                <dd>{preview.duration.completedMinutes} dk</dd>
              </div>
              <div>
                <dt>Kalan</dt>
                <dd>{preview.duration.remainingMinutes} dk</dd>
              </div>
              <div>
                <dt>Değişiklik</dt>
                <dd>{preview.proposal.changedTaskCount}</dd>
              </div>
            </dl>

            {preview.changes.map((change) => (
              <div className="task-action-change-card" key={`${change.changeType}-${change.taskId}`}>
                <strong>{change.changeType}</strong>
                <span>
                  {change.fromDate}
                  {change.toDate ? ` → ${change.toDate}` : " → backlog"}
                </span>
                <small>{change.remainingMinutes} dk kalan çalışma</small>
              </div>
            ))}

            {preview.action === "DEFER" &&
              preview.status === "READY" &&
              preview.capacity.targetRemainingMinutes !== null && (
                <div className="task-action-capacity">
                  <span>Hedef gün boş kapasite</span>
                  <strong>{preview.capacity.targetRemainingMinutes} dk</strong>
                  <small>
                    Taşıma sonrası {preview.capacity.afterMoveMinutes ?? 0} dk kalır
                  </small>
                </div>
              )}

            <div className="task-action-preview-only">
              <Icon name="check" weight="bold" />
              <span>
                Yalnızca önizleme · Henüz plan veya görev değiştirilmedi
              </span>
            </div>
          </section>
        )}
      </div>
    </aside>
  </>;
}