import { StrictMode, useCallback, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { callAppApi } from "./lib/app-api";
import type { RoadmapTask } from "./lib/roadmap";
import { taskMaterialPresentation } from "./lib/task-material-presentation";
import { taskWithVideoProgress } from "./lib/task-video";
import type { VideoProgress } from "./components/VideoPlayerDrawer";
import { StudyMaterialWorkspace } from "./components/StudyMaterialWorkspace";

function DevVideoReview() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [selectedId, setSelectedId] = useState(new URLSearchParams(window.location.search).get("task") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setTasks([]);
    if (!user) return;
    let cancelled = false;
    setLoading(true); setError(false);
    void callAppApi<{ tasks: RoadmapTask[] }>("/weekly-plan/current")
      .then((payload) => {
        if (!cancelled) setTasks(payload.tasks.filter((task) => task.status !== "cancelled" && task.material_scope?.kind === "full_video"));
      })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, retry]);
  const onVideoProgress = useCallback((progress: VideoProgress) => {
    setTasks((current) => current.map((task) => taskWithVideoProgress(task, progress)));
  }, []);
  const selected = tasks.find((task) => task.id === selectedId) ?? null;
  const presentation = selected ? taskMaterialPresentation(selected) : null;
  return <main className="dev-video-review">
    <header><a href="/ux-lab/today?concept=coach">← UX Lab’e dön</a><span className="page-eyebrow">UX LAB · YEREL GERÇEK VERİ</span><h1>Video çalışma alanı</h1><p>Yerel hesabının mevcut görevleri ve kayıtlı video ilerlemesi.</p></header>
    {authLoading ? <p role="status">Oturum yükleniyor…</p> : !user ? <div className="inline-state"><p>Gerçek görevleri görmek için yerel hesabınla giriş yap.</p><a href="/login">Giriş yap</a></div> : loading ? <p role="status">Görevler yükleniyor…</p> : error ? <div role="alert">Yerel görevler alınamadı. <button type="button" onClick={() => setRetry((value) => value + 1)}>Tekrar dene</button></div> : <>
      {tasks.length === 0 ? <p>Bu haftanın planında kesin video kapsamı olan görev yok. Kaynak senkronizasyonu ve doğrulanmış video–konu eşlemesi olan mevcut bir görev gerekir.</p> : <label className="dev-video-select">İncelenecek çalışma<select value={selected ? selectedId : ""} onChange={(event) => {
        setSelectedId(event.target.value);
        const url = new URL(window.location.href);
        if (event.target.value) url.searchParams.set("task", event.target.value);
        else url.searchParams.delete("task");
        window.history.replaceState(null, "", url);
      }}><option value="">Bir çalışma seç</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.material_scope?.kind === "full_video" ? task.material_scope.title : ""}</option>)}</select></label>}
      {selectedId && !selected && <p role="alert">Seçilen görev bu haftanın mevcut video görevleri arasında bulunamadı.</p>}
      {selected && <section aria-label="Gerçek görev videosu"><h2>{selected.title}</h2>{presentation && <p>{presentation.scopeLabel} · {presentation.progressLabel}</p>}<StudyMaterialWorkspace key={selected.id} task={selected} capture={null} pageDraft="" onPageDraft={() => undefined} playback="ready" visible onVideoProgress={onVideoProgress} /></section>}
    </>}
  </main>;
}

export function DevVideoReviewEntry() {
  return <StrictMode><AuthProvider><DevVideoReview /></AuthProvider></StrictMode>;
}
