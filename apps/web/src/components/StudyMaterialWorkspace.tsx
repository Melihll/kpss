import { useEffect, useState } from "react";
import { callAppApi } from "../lib/app-api";
import type { RoadmapTask } from "../lib/roadmap";
import { taskMaterialResource } from "../lib/today-material-actions";
import type { ResourcePageProgress, ResourceProgressResponse } from "../lib/resource-progress-ui";
import type { PhysicalFinishCapture } from "../lib/physical-study-finish";
import { ResourceProgressPanel } from "./ResourceProgressDrawer";
import { VideoPlayerPanel, type ResourceVideoLibraryResponse, type VideoProgress } from "./VideoPlayerDrawer";

interface Props {
  checkpointContext?: string;
  task: RoadmapTask;
  capture: PhysicalFinishCapture | null;
  pageDraft: string;
  onPageDraft: (value: string) => void;
  playback: "running" | "paused" | "ready";
  visible: boolean;
  onVideoProgress?: (progress: VideoProgress) => void;
}

/** Material identity comes from the API projection, never from a title. */
export function StudyMaterialWorkspace({ checkpointContext, task, capture, pageDraft, onPageDraft, playback, visible, onVideoProgress }: Props) {
  const resource = taskMaterialResource(task);
  const [page, setPage] = useState<ResourcePageProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasVideo, setHasVideo] = useState(task.material_scope?.kind === "full_video" || task.work_mode === "video");
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const scope = task.material_scope;
  const videoOnly = scope?.kind === "full_video" || task.resources?.resource_type === "video_course";
  useEffect(() => {
    if (!resource) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(false); setNotice(""); setPage(null);
    setHasVideo(scope?.kind === "full_video" || task.work_mode === "video");
    void Promise.allSettled([
      videoOnly ? Promise.resolve(null) : callAppApi<ResourceProgressResponse>(`/resources/${resource.resourceId}/progress`),
      callAppApi<ResourceVideoLibraryResponse>(`/resources/${resource.resourceId}/youtube-videos`),
    ]).then(([pages, videos]) => {
      if (cancelled) return;
      if (pages.status === "fulfilled") setPage(pages.value?.progress ?? null);
      else setError(true);
      if (videos.status === "fulfilled") setHasVideo(scope?.kind === "full_video" || videos.value.playlists.some((playlist) => playlist.videos.length > 0));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [resource?.resourceId, task.id, retry, videoOnly]);
  if (!resource) return <div className="study-material-empty">Bu göreve kaynak bağlanmamış. Haftam’dan kaynak bilgilerini düzenleyebilirsin.</div>;
  const showPage = !videoOnly;
  return <div className={`study-materials ${hasVideo && showPage ? "is-mixed" : ""}`}>
    {hasVideo && <section className="study-inline-video" aria-label="Video çalışma alanı"><span className="page-eyebrow">Video · {resource.resourceName}</span><VideoPlayerPanel checkpointContext={checkpointContext} resource={resource} taskScope={scope ?? null} onProgressChanged={onVideoProgress} compact playback={visible ? playback : "paused"} /></section>}
    {showPage && <section className="study-inline-page" aria-label="Kitap çalışma alanı"><span className="page-eyebrow">Kitap</span><h3>{resource.resourceName}</h3>
      {scope?.kind === "page_range" && <div className="study-page-boundaries"><div><span>Başlangıç</span><strong>{scope.pageStart}</strong></div><div><span>Kaydedilen</span><strong>{scope.completedThroughPage ?? scope.pageStart - 1}</strong></div><div><span>Hedef</span><strong>{scope.pageEnd}</strong></div></div>}
      {capture ? <div className="study-page-capture"><label htmlFor="study-page-draft">Geldiğin sayfa</label><input id="study-page-draft" type="number" step="1" inputMode="numeric" min={capture.startPageBoundary} max={capture.pageEnd} value={pageDraft} onChange={(event) => onPageDraft(event.target.value)} /><p>Bu sayfa taslağı çalışmayı bitirdiğinde sürenle birlikte kaydedilir.</p></div> : loading ? <p role="status">Sayfa bilgileri yükleniyor…</p> : error ? <div className="inline-state error" role="alert">Sayfa bilgileri alınamadı.<button type="button" onClick={() => setRetry((value) => value + 1)}>Tekrar dene</button></div> : <ResourceProgressPanel compact resource={resource} progress={page} onSaved={(saved) => { setPage(saved); setNotice("Sayfa ilerlemesi kaydedildi."); window.dispatchEvent(new Event("kpss:material-changed")); }} />}
      {notice && <p className="study-material-notice" role="status">{notice}</p>}
    </section>}
  </div>;
}
