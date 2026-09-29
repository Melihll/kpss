import { useEffect, useMemo, useState } from "react";
import type { ResourceForecast, TaskMaterialScope } from "../lib/roadmap";
import type { ResourcePageProgress } from "../lib/resource-progress-ui";
import { callAppApi } from "../lib/app-api";
import { summarizeResourceVideoProgress } from "../lib/resource-material-progress";
import { youtubeTimeLabel } from "../lib/youtube-player-progress";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import {
  ResourceProgressPanel,
} from "./ResourceProgressDrawer";
import {
  VideoPlayerPanel,
  type ResourceVideoLibraryResponse,
  type VideoProgress,
} from "./VideoPlayerDrawer";

export type ResourceDetailTab = "page" | "video";

interface ResourceDetailDrawerProps {
  readonly resource: ResourceForecast | null;
  readonly materialScope?: TaskMaterialScope | null;
  readonly pageProgress: ResourcePageProgress | null;
  readonly initialTab: ResourceDetailTab;
  readonly onClose: () => void;
  readonly onPageSaved: (progress: ResourcePageProgress) => void;
  readonly onMaterialProgressChanged?: () => void;
}

function updateVideoProgress(
  library: ResourceVideoLibraryResponse | null,
  progress: VideoProgress,
): ResourceVideoLibraryResponse | null {
  if (!library) return library;
  return {
    ...library,
    playlists: library.playlists.map((playlist) => ({
      ...playlist,
      videos: playlist.videos.map((video) => (
        video.id === progress.youtubePlaylistVideoId
          ? { ...video, progress }
          : video
      )),
    })),
  };
}

export function ResourceDetailDrawer({
  resource,
  materialScope = null,
  pageProgress,
  initialTab,
  onClose,
  onPageSaved,
  onMaterialProgressChanged,
}: ResourceDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<ResourceDetailTab>(initialTab);
  const [videoLibrary, setVideoLibrary] = useState<ResourceVideoLibraryResponse | null>(null);
  const [videoSummaryError, setVideoSummaryError] = useState(false);
  const [presentedScope, setPresentedScope] = useState<TaskMaterialScope | null>(materialScope);
  const dialogRef = useDialogAccessibility<HTMLElement>(Boolean(resource), onClose);

  useEffect(() => {
    if (!resource) return;
    setActiveTab(initialTab);
    setPresentedScope(materialScope);
  }, [initialTab, materialScope, resource?.resourceId]);

  useEffect(() => {
    if (!resource) {
      setVideoLibrary(null);
      setVideoSummaryError(false);
      return;
    }

    let cancelled = false;
    setVideoLibrary(null);
    setVideoSummaryError(false);

    void callAppApi<ResourceVideoLibraryResponse>(
      `/resources/${resource.resourceId}/youtube-videos`,
    )
      .then((payload) => {
        if (!cancelled) setVideoLibrary(payload);
      })
      .catch(() => {
        if (!cancelled) setVideoSummaryError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [resource?.resourceId]);

  const videoSummary = useMemo(
    () => summarizeResourceVideoProgress(videoLibrary?.playlists ?? []),
    [videoLibrary],
  );

  if (!resource) return null;

  const scopeSummary = presentedScope?.kind === "page_range"
    ? {
        label: `Sayfa ${presentedScope.pageStart}–${presentedScope.pageEnd}`,
        progress: presentedScope.completed
          ? "Bu görev kapsamı tamamlandı"
          : presentedScope.completedThroughPage !== null && presentedScope.completedThroughPage >= presentedScope.pageStart
            ? `Sayfa ${Math.min(presentedScope.pageEnd, presentedScope.completedThroughPage)} seviyesine ulaşıldı`
            : "Bu görev için ayrılan sayfa aralığı",
      }
    : presentedScope?.kind === "full_video"
      ? {
          label: `${presentedScope.position > 0 ? `Video ${presentedScope.position}` : "Video"} · ${presentedScope.title}`,
          progress: presentedScope.completed
            ? "Video tamamlandı"
            : `${Math.round(presentedScope.watchedSeconds / 60)} / ${Math.round(presentedScope.durationSeconds / 60)} dk izlendi`,
        }
      : null;

  return <>
    <button
      className="resource-detail-backdrop"
      type="button"
      aria-label="Kaynak detayını kapat"
      onClick={onClose}
    />
    <aside
      ref={dialogRef}
      tabIndex={-1}
      className="resource-detail-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-detail-title"
    >
      <header className="resource-detail-header">
        <div>
          <span>Kaynak detayı</span>
          <h2 id="resource-detail-title">{resource.resourceName}</h2>
          <small>Sayfa ve video ilerlemesi tek yerde</small>
        </div>
        <button type="button" aria-label="Kapat" onClick={onClose}>×</button>
      </header>

      <nav className="resource-detail-tabs" role="tablist" aria-label="Materyal ilerlemesi">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "page"}
          className={activeTab === "page" ? "is-active" : ""}
          onClick={() => setActiveTab("page")}
        >
          <span>Sayfa</span>
          <strong>
            {pageProgress
              ? `${pageProgress.currentPage} / ${pageProgress.totalPages}`
              : "Takip yok"}
          </strong>
          <small>{pageProgress ? `%${pageProgress.progressPercent}` : "Sayfa ilerlemesi"}</small>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "video"}
          className={activeTab === "video" ? "is-active" : ""}
          onClick={() => setActiveTab("video")}
        >
          <span>Video</span>
          <strong>
            {videoSummaryError
              ? "Alınamadı"
              : videoLibrary
                ? `${videoSummary.completedVideos} / ${videoSummary.totalVideos}`
                : "Yükleniyor…"}
          </strong>
          <small>
            {videoSummaryError
              ? "Tekrar deneyin"
              : videoLibrary
                ? `%${videoSummary.progressPercent} · ${youtubeTimeLabel(videoSummary.watchedSeconds)} izlendi`
                : "Video ilerlemesi"}
          </small>
        </button>
      </nav>

      {scopeSummary && <section className="resource-detail-task-scope" aria-label="Görev kapsamı">
        <span>Bu görevde</span>
        <strong>{scopeSummary.label}</strong>
        <small>{scopeSummary.progress}</small>
      </section>}

      <div className="resource-detail-body">
        {activeTab === "page" ? (
          <section
            className="resource-detail-page"
            role="tabpanel"
            aria-label="Sayfa ilerlemesi"
          >
            <ResourceProgressPanel
              resource={resource}
              progress={pageProgress}
              onSaved={onPageSaved}
            />
          </section>
        ) : (
          <section
            className="resource-detail-video"
            role="tabpanel"
            aria-label="Video ilerlemesi"
          >
            <VideoPlayerPanel
              resource={resource}
              initialVideoId={presentedScope?.kind === "full_video"
                ? presentedScope.youtubePlaylistVideoId
                : null}
              onProgressChanged={(progress) => {
                setVideoLibrary((current) => updateVideoProgress(current, progress));
                setPresentedScope((current) => current?.kind === "full_video" &&
                  current.youtubePlaylistVideoId === progress.youtubePlaylistVideoId
                  ? {
                      ...current,
                      watchedSeconds: progress.watchedSeconds,
                      completed: progress.completed,
                    }
                  : current);
                onMaterialProgressChanged?.();
              }}
            />
          </section>
        )}
      </div>
    </aside>
  </>;
}
