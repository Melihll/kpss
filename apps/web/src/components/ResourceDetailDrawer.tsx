import { useEffect, useMemo, useState } from "react";
import type { ResourceForecast } from "../lib/roadmap";
import type { ResourcePageProgress } from "../lib/resource-progress-ui";
import { callAppApi } from "../lib/app-api";
import { summarizeResourceVideoProgress } from "../lib/resource-material-progress";
import { youtubeTimeLabel } from "../lib/youtube-player-progress";
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
  readonly pageProgress: ResourcePageProgress | null;
  readonly initialTab: ResourceDetailTab;
  readonly onClose: () => void;
  readonly onPageSaved: (progress: ResourcePageProgress) => void;
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
  pageProgress,
  initialTab,
  onClose,
  onPageSaved,
}: ResourceDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<ResourceDetailTab>(initialTab);
  const [videoLibrary, setVideoLibrary] = useState<ResourceVideoLibraryResponse | null>(null);
  const [videoSummaryError, setVideoSummaryError] = useState(false);

  useEffect(() => {
    if (!resource) return;
    setActiveTab(initialTab);
  }, [initialTab, resource?.resourceId]);

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

  useEffect(() => {
    if (!resource) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, resource]);

  const videoSummary = useMemo(
    () => summarizeResourceVideoProgress(videoLibrary?.playlists ?? []),
    [videoLibrary],
  );

  if (!resource) return null;

  return <>
    <button
      className="resource-detail-backdrop"
      type="button"
      aria-label="Kaynak detayını kapat"
      onClick={onClose}
    />
    <aside
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
              onProgressChanged={(progress) => {
                setVideoLibrary((current) => updateVideoProgress(current, progress));
              }}
            />
          </section>
        )}
      </div>
    </aside>
  </>;
}