import { useEffect, useState, type FormEvent } from "react";
import {
  validatePhysicalFinishBoundary,
  type PhysicalFinishCapture,
} from "../lib/physical-study-finish";

interface Props {
  readonly capture: PhysicalFinishCapture | null;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onFinish: (completedThroughPage: number) => Promise<boolean>;
}

const ERROR_MESSAGES = {
  PHYSICAL_PAGE_BOUNDARY_REQUIRED: "Tamamladığın son sayfayı yaz.",
  PHYSICAL_PAGE_BOUNDARY_INVALID: "Sayfa numarası çalışma aralığının dışında.",
  PHYSICAL_PROGRESS_REVERSAL: "Önceki ilerlemeden daha düşük bir sayfa seçemezsin.",
} as const;

export function PhysicalStudyFinishDialog({ capture, busy, onCancel, onFinish }: Props) {
  const [rawBoundary, setRawBoundary] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRawBoundary("");
    setError(null);
  }, [capture?.pageEnd, capture?.startPageBoundary]);

  if (!capture) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validatePhysicalFinishBoundary(capture!, rawBoundary);
    if (!validation.ok) {
      setError(ERROR_MESSAGES[validation.code]);
      return;
    }
    setError(null);
    await onFinish(validation.boundary);
  }

  const zeroProgressLabel = capture.startPageBoundary === capture.pageStart - 1
    ? `${capture.startPageBoundary} (henüz yeni sayfa tamamlanmadı)`
    : `${capture.startPageBoundary} (yeni ilerleme yok)`;

  return <>
    <button className="physical-finish-backdrop" type="button" aria-label="Bitirme penceresini kapat" onClick={onCancel} />
    <aside className="physical-finish-dialog" role="dialog" aria-modal="true" aria-labelledby="physical-finish-title">
      <header>
        <div><span>Çalışmayı bitir</span><h2 id="physical-finish-title">Kaçıncı sayfaya kadar tamamladın?</h2></div>
        <button type="button" aria-label="Kapat" onClick={onCancel}>×</button>
      </header>
      <form onSubmit={submit}>
        <p>Ünite aralığı: <strong>{capture.pageStart}–{capture.pageEnd}</strong></p>
        <label>
          <span>Tamamlanan son sayfa</span>
          <input
            type="number"
            inputMode="numeric"
            min={capture.startPageBoundary}
            max={capture.pageEnd}
            step="1"
            value={rawBoundary}
            onChange={(event) => setRawBoundary(event.target.value)}
            autoFocus
            required
          />
        </label>
        <small>Yeni sayfa ilerlemediysen {zeroProgressLabel} gir. Bu durumda çalışma süren korunur, hız kanıtı oluşmaz.</small>
        {error && <p className="physical-finish-error" role="alert">{error}</p>}
        <div>
          <button className="ghost-action" type="button" disabled={busy} onClick={onCancel}>Vazgeç</button>
          <button className="primary-action" disabled={busy}>Çalışmayı Kaydet</button>
        </div>
      </form>
    </aside>
  </>;
}
