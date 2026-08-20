import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AppApiError,
  FRIENDLY_API_ERRORS,
  callAppApi,
} from "../lib/app-api";
import {
  canPreviewQuickAdd,
  initialQuickAddForm,
  quickAddDateBounds,
  type QuickAddFormValue,
  type QuickAddOptions,
  type QuickAddPreviewResponse,
} from "../lib/quick-add-task-ui";
import { Icon } from "./Icon";

interface QuickAddTaskDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const EMPTY_FORM: QuickAddFormValue = {
  subjectId: "",
  title: "",
  estimatedMinutes: "30",
  plannedDate: "",
};

export function QuickAddTaskDrawer({
  open,
  onClose,
}: QuickAddTaskDrawerProps) {
  const [options, setOptions] = useState<QuickAddOptions | null>(null);
  const [form, setForm] = useState<QuickAddFormValue>(EMPTY_FORM);
  const [preview, setPreview] = useState<QuickAddPreviewResponse | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingOptions(true);
    setPreview(null);
    setError(null);

    void callAppApi<QuickAddOptions>("/tasks/quick-add/options")
      .then((result) => {
        if (cancelled) return;
        setOptions(result);
        setForm(initialQuickAddForm(result));
      })
      .catch((caught) => {
        if (cancelled) return;
        console.error("QUICK_ADD_OPTIONS_FAILED", caught);
        setError("Görev seçenekleri yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  const bounds = useMemo(
    () => options ? quickAddDateBounds(options) : null,
    [options],
  );
  const canPreview = options
    ? canPreviewQuickAdd(form, options)
    : false;

  function updateForm<K extends keyof QuickAddFormValue>(
    key: K,
    value: QuickAddFormValue[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!options || !canPreview) return;

    setPreviewing(true);
    setError(null);
    try {
      const result = await callAppApi<QuickAddPreviewResponse>(
        "/tasks/quick-add/preview",
        {
          method: "POST",
          body: {
            subjectId: form.subjectId,
            title: form.title.trim(),
            estimatedMinutes: Number(form.estimatedMinutes),
            plannedDate: form.plannedDate,
          },
        },
      );
      setPreview(result);
    } catch (caught) {
      console.error("QUICK_ADD_PREVIEW_FAILED", caught);
      if (caught instanceof AppApiError) {
        setError(
          FRIENDLY_API_ERRORS[caught.code] ??
          "Görev önizlemesi hazırlanamadı.",
        );
      } else {
        setError("Görev önizlemesi hazırlanamadı.");
      }
    } finally {
      setPreviewing(false);
    }
  }

  if (!open) return null;

  return <>
    <button
      className="quick-add-backdrop"
      type="button"
      aria-label="Görev ekleme panelini kapat"
      onClick={onClose}
    />
    <aside
      className="quick-add-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-title"
    >
      <header className="quick-add-header">
        <div>
          <span>Hızlı görev</span>
          <h2 id="quick-add-title">Görev Ekle</h2>
        </div>
        <button
          className="quick-add-close"
          type="button"
          aria-label="Kapat"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="quick-add-body">
        <p className="quick-add-intro">
          Haftayı yeniden oluşturmadan tek bir görev adayı hazırla.
          Bu ekran yalnızca önizleme yapar.
        </p>

        {loadingOptions ? (
          <div className="quick-add-loading" aria-live="polite">
            Seçenekler hazırlanıyor…
          </div>
        ) : options ? (
          <form className="quick-add-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span>Ders</span>
              <select
                value={form.subjectId}
                onChange={(event) => updateForm("subjectId", event.target.value)}
              >
                {options.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="quick-add-title-field">
              <span>Görev</span>
              <input
                type="text"
                maxLength={120}
                placeholder="Örn. Anayasa kısa tekrar"
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
              />
            </label>

            <div className="quick-add-form-row">
              <label>
                <span>Süre</span>
                <div className="quick-add-minute-input">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.estimatedMinutes}
                    onChange={(event) => updateForm("estimatedMinutes", event.target.value)}
                  />
                  <small>dk</small>
                </div>
              </label>

              <label>
                <span>Gün</span>
                <input
                  type="date"
                  min={bounds?.min}
                  max={bounds?.max}
                  value={form.plannedDate}
                  onChange={(event) => updateForm("plannedDate", event.target.value)}
                />
              </label>
            </div>

            <button
              className="quick-add-preview-button"
              type="submit"
              disabled={!canPreview || previewing}
            >
              <Icon name="spark" weight="fill" />
              {previewing ? "Önizleniyor…" : "Görevi Önizle"}
            </button>
          </form>
        ) : null}

        {error && (
          <div className="quick-add-error" role="alert">
            {error}
          </div>
        )}

        {preview && (
          <section
            className={`quick-add-preview ${preview.status === "READY" ? "is-ready" : "is-blocked"}`}
            aria-live="polite"
          >
            <div className="quick-add-preview-state">
              {preview.status === "READY" ? "Eklenebilir" : "Kapasite yetersiz"}
            </div>
            <span className="quick-add-preview-subject">
              {preview.candidate.subjectName}
            </span>
            <h3>{preview.candidate.title}</h3>
            <dl>
              <div>
                <dt>Süre</dt>
                <dd>{preview.candidate.estimatedMinutes} dk</dd>
              </div>
              <div>
                <dt>Gün</dt>
                <dd>{preview.candidate.plannedDate}</dd>
              </div>
              <div>
                <dt>Boş kapasite</dt>
                <dd>{preview.capacity.remainingMinutes} dk</dd>
              </div>
              <div>
                <dt>Sonrasında</dt>
                <dd>{preview.capacity.afterCandidateMinutes} dk</dd>
              </div>
            </dl>
            <p>
              {preview.status === "READY"
                ? "Bu görev mevcut haftayı değiştirmeden tek görev olarak eklenebilir."
                : "Bu süre mevcut günlük kapasiteye sığmıyor. Süreyi veya günü değiştir."}
            </p>
            <div className="quick-add-preview-only">
              <Icon name="check" weight="bold" />
              Önizleme tamamlandı · Henüz hiçbir görev oluşturulmadı
            </div>
          </section>
        )}
      </div>
    </aside>
  </>;
}