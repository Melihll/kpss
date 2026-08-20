import { useEffect, useState, type FormEvent } from "react";
import { AppApiError, FRIENDLY_API_ERRORS, callAppApi } from "../lib/app-api";
import type { ResourceForecast } from "../lib/roadmap";
import {
  validateResourcePageForm,
  type ResourcePageProgress,
  type ResourceProgressResponse,
} from "../lib/resource-progress-ui";

interface ResourceProgressPanelProps {
  readonly resource: ResourceForecast;
  readonly progress: ResourcePageProgress | null;
  readonly onSaved: (progress: ResourcePageProgress) => void;
}

export function ResourceProgressPanel({
  resource,
  progress,
  onSaved,
}: ResourceProgressPanelProps) {
  const [totalPages, setTotalPages] = useState("");
  const [currentPage, setCurrentPage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTotalPages(progress ? String(progress.totalPages) : "");
    setCurrentPage(progress ? String(progress.currentPage) : "0");
    setError(null);
  }, [progress, resource.resourceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = {
      totalPages: Number(totalPages),
      currentPage: Number(currentPage),
    };
    const validationError = validateResourcePageForm(parsed);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = await callAppApi<ResourceProgressResponse>(
        `/resources/${resource.resourceId}/progress`,
        {
          method: "PUT",
          body: parsed,
        },
      );
      if (!payload.progress) {
        setError("Kaynak ilerlemesi kaydedilemedi.");
        return;
      }
      onSaved(payload.progress);
    } catch (caught) {
      if (caught instanceof AppApiError) {
        setError(
          FRIENDLY_API_ERRORS[caught.code] ??
          "Kaynak ilerlemesi kaydedilemedi.",
        );
      } else {
        setError("Kaynak ilerlemesi kaydedilemedi.");
      }
    } finally {
      setSaving(false);
    }
  }

  return <form
    className="resource-progress-panel"
    onSubmit={(event) => void submit(event)}
  >
    <div className="resource-progress-intro">
      <strong>Gerçek sayfa ilerlemesi</strong>
      <p>
        Kaynağın toplam sayfasını ve şu an kaldığınız sayfayı girin.
        Bu kayıt çalışma planını otomatik olarak değiştirmez.
      </p>
    </div>

    <label>
      <span>Toplam sayfa</span>
      <input
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        value={totalPages}
        onChange={(event) => setTotalPages(event.target.value)}
        placeholder="Örn. 420"
      />
    </label>

    <label>
      <span>Kaldığınız sayfa</span>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={currentPage}
        onChange={(event) => setCurrentPage(event.target.value)}
        placeholder="Örn. 145"
      />
    </label>

    {progress && (
      <div className="resource-progress-current">
        <span>Mevcut kayıt</span>
        <strong>
          {progress.currentPage} / {progress.totalPages} sayfa · %{progress.progressPercent}
        </strong>
      </div>
    )}

    {error && <div className="resource-progress-error" role="alert">{error}</div>}

    <footer>
      <button type="submit" className="primary" disabled={saving}>
        {saving ? "Kaydediliyor…" : "Sayfa ilerlemesini kaydet"}
      </button>
    </footer>
  </form>;
}

interface ResourceProgressDrawerProps {
  readonly resource: ResourceForecast | null;
  readonly progress: ResourcePageProgress | null;
  readonly onClose: () => void;
  readonly onSaved: (progress: ResourcePageProgress) => void;
}

export function ResourceProgressDrawer({
  resource,
  progress,
  onClose,
  onSaved,
}: ResourceProgressDrawerProps) {
  useEffect(() => {
    if (!resource) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, resource]);

  if (!resource) return null;

  return <>
    <button
      className="resource-progress-backdrop"
      type="button"
      aria-label="Sayfa ilerlemesini kapat"
      onClick={onClose}
    />
    <aside
      className="resource-progress-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-progress-title"
    >
      <header>
        <div>
          <span>Kaynak ilerlemesi</span>
          <h2 id="resource-progress-title">{resource.resourceName}</h2>
        </div>
        <button
          type="button"
          aria-label="Kapat"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <ResourceProgressPanel
        resource={resource}
        progress={progress}
        onSaved={onSaved}
      />
    </aside>
  </>;
}