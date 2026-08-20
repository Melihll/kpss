import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ResourceForecast } from "../lib/roadmap";
import {
  AppApiError,
  FRIENDLY_API_ERRORS,
  callAppApi,
} from "../lib/app-api";
import {
  YOUTUBE_PROGRESS_CHECKPOINT_MS,
  clampYouTubeWatchedSeconds,
  countedYouTubeWatchDelta,
  shouldCheckpointYouTubeProgress,
  youtubeTimeLabel,
} from "../lib/youtube-player-progress";

export interface VideoProgress {
  readonly youtubePlaylistVideoId: string;
  readonly lastPositionSeconds: number;
  readonly watchedSeconds: number;
  readonly durationSeconds: number;
  readonly progressPercent: number;
  readonly remainingSeconds: number;
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

export interface VideoItem {
  readonly id: string;
  readonly youtubeVideoId: string;
  readonly title: string;
  readonly position: number;
  readonly durationSeconds: number;
  readonly thumbnailUrl: string | null;
  readonly channelTitle: string | null;
  readonly publishedAt: string | null;
  readonly progress: VideoProgress | null;
}

export interface PlaylistItem {
  readonly id: string;
  readonly sourceUrl: string;
  readonly youtubePlaylistId: string;
  readonly title: string | null;
  readonly totalDurationSeconds: number;
  readonly videoCount: number;
  readonly lastSyncedAt: string | null;
  readonly videos: readonly VideoItem[];
}

export interface ResourceVideoLibraryResponse {
  readonly resource: {
    readonly id: string;
    readonly name: string;
    readonly resourceType: string;
  };
  readonly playlists: readonly PlaylistItem[];
}

interface VideoProgressResponse {
  readonly video: {
    readonly id: string;
    readonly youtubePlaylistId: string;
    readonly youtubeVideoId: string;
    readonly title: string;
    readonly durationSeconds: number;
    readonly position: number;
  };
  readonly progress: VideoProgress | null;
}

interface YTPlayer {
  destroy(): void;
  getCurrentTime(): number;
  getPlaybackRate(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}

interface YTPlayerEvent {
  readonly target: YTPlayer;
  readonly data: number;
}

interface YTNamespace {
  readonly PlayerState: {
    readonly ENDED: number;
    readonly PLAYING: number;
    readonly PAUSED: number;
    readonly BUFFERING: number;
    readonly CUED: number;
  };
  readonly Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YTPlayer }) => void;
        onStateChange: (event: YTPlayerEvent) => void;
        onError: () => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let iframeApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YOUTUBE_IFRAME_API_UNAVAILABLE"));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-kpss-youtube-iframe-api="true"]',
    );
    if (existing) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset.kpssYoutubeIframeApi = "true";
    script.onerror = () => reject(new Error("YOUTUBE_IFRAME_API_UNAVAILABLE"));
    document.head.appendChild(script);
  });

  return iframeApiPromise;
}

function friendlyError(caught: unknown, fallback: string): string {
  if (caught instanceof AppApiError) {
    return FRIENDLY_API_ERRORS[caught.code] ?? fallback;
  }
  return fallback;
}

function flattenVideos(playlists: readonly PlaylistItem[]): VideoItem[] {
  return playlists.flatMap((playlist) => playlist.videos);
}

interface EmbeddedYouTubePlayerProps {
  readonly video: VideoItem;
  readonly initialProgress: VideoProgress | null;
  readonly onSaved: (progress: VideoProgress) => void;
  readonly onError: (message: string) => void;
  readonly playerRef: MutableRefObject<YTPlayer | null>;
}

function EmbeddedYouTubePlayer({
  video,
  initialProgress,
  onSaved,
  onError,
  playerRef,
}: EmbeddedYouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tickTimerRef = useRef<number | null>(null);
  const watchedRef = useRef(initialProgress?.watchedSeconds ?? 0);
  const positionRef = useRef(initialProgress?.lastPositionSeconds ?? 0);
  const previousPositionRef = useRef(initialProgress?.lastPositionSeconds ?? 0);
  const previousWallRef = useRef(performance.now());
  const lastSavedAtRef = useRef(performance.now());
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const destroyedRef = useRef(false);

  useEffect(() => {
    watchedRef.current = initialProgress?.watchedSeconds ?? 0;
    positionRef.current = initialProgress?.lastPositionSeconds ?? 0;
    previousPositionRef.current = initialProgress?.lastPositionSeconds ?? 0;
    previousWallRef.current = performance.now();
    lastSavedAtRef.current = performance.now();
  }, [initialProgress, video.id]);

  useEffect(() => {
    destroyedRef.current = false;
    let localPlayer: YTPlayer | null = null;

    const stopTicking = () => {
      if (tickTimerRef.current !== null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };

    const save = () => {
      const body = {
        lastPositionSeconds: Math.max(
          0,
          Math.min(video.durationSeconds, Math.floor(positionRef.current)),
        ),
        watchedSeconds: Math.max(
          0,
          Math.min(video.durationSeconds, Math.floor(watchedRef.current)),
        ),
      };

      saveChainRef.current = saveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const payload = await callAppApi<VideoProgressResponse>(
            `/youtube-videos/${video.id}/progress`,
            { method: "PUT", body },
          );
          if (!destroyedRef.current && payload.progress) {
            onSaved(payload.progress);
          }
          lastSavedAtRef.current = performance.now();
        })
        .catch(() => {
          if (!destroyedRef.current) {
            onError("Video ilerlemesi kaydedilemedi.");
          }
        });
    };

    const tick = () => {
      if (!localPlayer) return;
      const now = performance.now();
      const currentPosition = Math.max(
        0,
        Math.min(video.durationSeconds, localPlayer.getCurrentTime()),
      );
      const elapsedWallSeconds = Math.max(
        0,
        (now - previousWallRef.current) / 1000,
      );
      const added = countedYouTubeWatchDelta({
        previousPositionSeconds: previousPositionRef.current,
        currentPositionSeconds: currentPosition,
        elapsedWallSeconds,
        playbackRate: localPlayer.getPlaybackRate(),
      });

      watchedRef.current = clampYouTubeWatchedSeconds(
        watchedRef.current,
        added,
        video.durationSeconds,
      );
      positionRef.current = currentPosition;
      previousPositionRef.current = currentPosition;
      previousWallRef.current = now;

      if (
        shouldCheckpointYouTubeProgress(
          now,
          lastSavedAtRef.current,
          YOUTUBE_PROGRESS_CHECKPOINT_MS,
        )
      ) {
        save();
      }
    };

    const startTicking = () => {
      if (tickTimerRef.current !== null) return;
      previousWallRef.current = performance.now();
      previousPositionRef.current = localPlayer?.getCurrentTime() ?? positionRef.current;
      tickTimerRef.current = window.setInterval(tick, 1000);
    };

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (destroyedRef.current || !hostRef.current) return;

        localPlayer = new YT.Player(hostRef.current, {
          videoId: video.youtubeVideoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              playerRef.current = target;
              const resume = initialProgress?.lastPositionSeconds ?? 0;
              if (resume > 0 && resume < video.durationSeconds - 2) {
                target.seekTo(resume, true);
                positionRef.current = resume;
                previousPositionRef.current = resume;
              }
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                startTicking();
                return;
              }

              if (
                event.data === YT.PlayerState.PAUSED ||
                event.data === YT.PlayerState.ENDED ||
                event.data === YT.PlayerState.BUFFERING ||
                event.data === YT.PlayerState.CUED
              ) {
                tick();
                stopTicking();
              }

              if (
                event.data === YT.PlayerState.PAUSED ||
                event.data === YT.PlayerState.ENDED
              ) {
                if (event.data === YT.PlayerState.ENDED) {
                  positionRef.current = video.durationSeconds;
                }
                save();
              }
            },
            onError: () => {
              stopTicking();
              onError("YouTube videosu oynatılamadı.");
            },
          },
        });
        playerRef.current = localPlayer;
      })
      .catch(() => onError("YouTube oynatıcı yüklenemedi."));

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tick();
        save();
      }
    };
    const onPageHide = () => {
      tick();
      save();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      tick();
      save();
      destroyedRef.current = true;
      stopTicking();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      localPlayer?.destroy();
      if (playerRef.current === localPlayer) playerRef.current = null;
    };
  }, [
    initialProgress,
    onError,
    onSaved,
    playerRef,
    video.durationSeconds,
    video.id,
    video.youtubeVideoId,
  ]);

  return <div className="youtube-player-frame" ref={hostRef} />;
}

interface VideoPlayerPanelProps {
  readonly resource: ResourceForecast;
  readonly onProgressChanged?: (progress: VideoProgress) => void;
}

export function VideoPlayerPanel({
  resource,
  onProgressChanged,
}: VideoPlayerPanelProps) {
  const [library, setLibrary] = useState<ResourceVideoLibraryResponse | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const videos = library ? flattenVideos(library.playlists) : [];
  const selectedVideo = videos.find((video) => video.id === selectedVideoId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoadingLibrary(true);
    setError(null);
    setLibrary(null);
    setSelectedVideoId(null);
    setProgress(null);

    void callAppApi<ResourceVideoLibraryResponse>(
      `/resources/${resource.resourceId}/youtube-videos`,
    )
      .then((payload) => {
        if (cancelled) return;
        setLibrary(payload);
        const first = flattenVideos(payload.playlists)[0] ?? null;
        setSelectedVideoId(first?.id ?? null);
        setProgress(first?.progress ?? null);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(friendlyError(caught, "Video listesi yüklenemedi."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLibrary(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resource.resourceId]);

  useEffect(() => {
    if (!selectedVideo) {
      setProgress(null);
      return;
    }

    setProgress(selectedVideo.progress ?? null);
    let cancelled = false;
    setLoadingProgress(true);
    setError(null);

    void callAppApi<VideoProgressResponse>(
      `/youtube-videos/${selectedVideo.id}/progress`,
    )
      .then((payload) => {
        if (!cancelled) setProgress(payload.progress);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(friendlyError(caught, "Video ilerlemesi yüklenemedi."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProgress(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVideo?.id]);

  const saveProgress = (saved: VideoProgress) => {
    setProgress(saved);
    setLibrary((current) => current ? {
      ...current,
      playlists: current.playlists.map((playlist) => ({
        ...playlist,
        videos: playlist.videos.map((video) => (
          video.id === saved.youtubePlaylistVideoId
            ? { ...video, progress: saved }
            : video
        )),
      })),
    } : current);
    onProgressChanged?.(saved);
  };

  return <div className="youtube-player-panel">
    {loadingLibrary && <div className="youtube-player-state">Videolar yükleniyor…</div>}

    {!loadingLibrary && library && videos.length === 0 && (
      <div className="youtube-player-empty">
        <strong>Bu kaynağa bağlı senkronize video yok.</strong>
        <p>Playlist bağlantısı ve senkronizasyon tamamlandığında videolar burada görünecek.</p>
      </div>
    )}

    {selectedVideo && (
      <>
        <section className="youtube-player-stage">
          {loadingProgress
            ? <div className="youtube-player-state">İlerleme yükleniyor…</div>
            : <EmbeddedYouTubePlayer
                key={selectedVideo.id}
                video={selectedVideo}
                initialProgress={progress}
                onSaved={saveProgress}
                onError={setError}
                playerRef={playerRef}
              />}
        </section>

        <section className="youtube-current-video">
          <div>
            <span>Şimdi izleniyor</span>
            <strong>{selectedVideo.title}</strong>
            {selectedVideo.channelTitle && <small>{selectedVideo.channelTitle}</small>}
          </div>
          <div className="youtube-current-progress">
            <strong>%{progress?.progressPercent ?? 0}</strong>
            <span>
              {youtubeTimeLabel(progress?.watchedSeconds ?? 0)}
              {" / "}
              {youtubeTimeLabel(selectedVideo.durationSeconds)}
            </span>
          </div>
        </section>
      </>
    )}

    {error && <div className="youtube-player-error" role="alert">{error}</div>}

    {library?.playlists.map((playlist) => (
      <section className="youtube-playlist-section" key={playlist.id}>
        <header>
          <div>
            <span>Playlist</span>
            <strong>{playlist.title ?? "YouTube Playlist"}</strong>
          </div>
          <small>{playlist.videos.length} video</small>
        </header>

        <div className="youtube-video-list">
          {playlist.videos.map((video) => {
            const active = video.id === selectedVideoId;
            return <button
              type="button"
              className={active ? "is-active" : ""}
              aria-pressed={active}
              onClick={() => {
                setProgress(video.progress ?? null);
                setSelectedVideoId(video.id);
              }}
              key={video.id}
            >
              <span className="youtube-video-index">{video.position + 1}</span>
              <span className="youtube-video-copy">
                <strong>{video.title}</strong>
                <small>
                  {video.channelTitle ?? "YouTube"} · {youtubeTimeLabel(video.durationSeconds)}
                  {video.progress ? ` · %${video.progress.progressPercent}` : ""}
                </small>
              </span>
              {video.progress?.completed
                ? <span className="youtube-video-playing">Tamamlandı</span>
                : active && <span className="youtube-video-playing">İzleniyor</span>}
            </button>;
          })}
        </div>
      </section>
    ))}
  </div>;
}

interface VideoPlayerDrawerProps {
  readonly resource: ResourceForecast | null;
  readonly onClose: () => void;
}

export function VideoPlayerDrawer({
  resource,
  onClose,
}: VideoPlayerDrawerProps) {
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
      className="youtube-player-backdrop"
      type="button"
      aria-label="Video oynatıcıyı kapat"
      onClick={onClose}
    />
    <aside
      className="youtube-player-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="youtube-player-title"
    >
      <header className="youtube-player-header">
        <div>
          <span>Video çalışma</span>
          <h2 id="youtube-player-title">{resource.resourceName}</h2>
        </div>
        <button type="button" aria-label="Kapat" onClick={onClose}>×</button>
      </header>

      <div className="youtube-player-body">
        <VideoPlayerPanel resource={resource} />
      </div>
    </aside>
  </>;
}