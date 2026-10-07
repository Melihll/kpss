import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ResourceForecast, TaskMaterialScope } from "../lib/roadmap";
import { playableCatalogVideo, resolveTaskVideo, verifiedVideoProgress } from "../lib/task-video";
import {
  AppApiError,
  FRIENDLY_API_ERRORS,
  callAppApi,
} from "../lib/app-api";
import {
  clampYouTubeWatchedSeconds,
  countedYouTubeWatchDelta,
  youtubeResumeIntentOnSessionPause,
  youtubeTimeLabel,
} from "../lib/youtube-player-progress";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { useAuth } from "../auth/AuthContext";
import { sharedYouTubeProgressWriter } from "../lib/youtube-progress-writer";

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

export interface VideoProgressResponse {
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
  playVideo(): void;
  pauseVideo(): void;
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
  readonly userId: string;
  readonly checkpointContext?: string;
  readonly playlistId: string;
  readonly playback?: "running" | "paused" | "ready";
  readonly video: VideoItem;
  readonly initialProgress: VideoProgress | null;
  readonly onSaved: (progress: VideoProgress) => void;
  readonly onError: (message: string) => void;
  readonly playerRef: MutableRefObject<YTPlayer | null>;
}

function EmbeddedYouTubePlayer({
  userId,
  checkpointContext,
  playlistId,
  playback = "ready",
  video,
  initialProgress,
  onSaved,
  onError,
  playerRef,
}: EmbeddedYouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const watchedRef = useRef(initialProgress?.watchedSeconds ?? 0);
  const positionRef = useRef(initialProgress?.lastPositionSeconds ?? 0);
  const previousPositionRef = useRef(initialProgress?.lastPositionSeconds ?? 0);
  const previousWallRef = useRef(performance.now());
  const flushRef = useRef<() => void>(() => undefined);
  const generationRef = useRef(0);
  const initialRef = useRef({ videoId: video.id, progress: initialProgress });
  if (initialRef.current.videoId !== video.id) initialRef.current = { videoId: video.id, progress: initialProgress };
  const playbackRef = useRef(playback);
  const playingRef = useRef(false);
  const resumeVideoRef = useRef(true);
  useEffect(() => { flushRef.current(); }, [checkpointContext]);
  useEffect(() => {
    const previousPlayback = playbackRef.current;
    playbackRef.current = playback;
    if (previousPlayback === "running" && playback !== "running") flushRef.current();
    if (playback === "paused") {
      resumeVideoRef.current = youtubeResumeIntentOnSessionPause(Boolean(playerRef.current), playingRef.current, resumeVideoRef.current);
      playerRef.current?.pauseVideo();
    }
    else if (playback === "ready" && previousPlayback !== "ready") playerRef.current?.pauseVideo();
    else if (playback === "running" && resumeVideoRef.current) playerRef.current?.playVideo();
  }, [playback, playerRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const generation = ++generationRef.current;
    let retired = false;
    const isCurrent = () => !retired && generationRef.current === generation;
    let tickTimer: number | null = null;
    let localPlayer: YTPlayer | null = null;
    let playerReady = false;
    let pauseAfterRestoreSeek = false;
    // React owns the host. Only this imperative subtree belongs to the SDK.
    const sdkRoot = document.createElement("div");
    sdkRoot.style.width = "100%";
    sdkRoot.style.height = "100%";
    const sdkTarget = document.createElement("div");
    sdkRoot.appendChild(sdkTarget);
    host.appendChild(sdkRoot);
    const initial = initialRef.current.progress;
    const writer = sharedYouTubeProgressWriter<VideoProgress>(`${userId}:${video.id}`, {
      initialCheckpoint: {
        lastPositionSeconds: initial?.lastPositionSeconds ?? 0,
        watchedSeconds: initial?.watchedSeconds ?? 0,
      },
      send: async (body) => {
        const payload = await callAppApi<VideoProgressResponse>(
          `/youtube-videos/${video.id}/progress`,
          { method: "PUT", body, expectedUserId: userId },
        );
        const saved = verifiedVideoProgress(video, playlistId, payload);
        if (!saved) throw new Error("VIDEO_PROGRESS_SAVE_MISSING");
        return saved;
      },
    });
    // A remount while the final PUT is in flight must not restore an older GET.
    const pending = writer.pendingCheckpoint();
    positionRef.current = pending?.lastPositionSeconds ?? initial?.lastPositionSeconds ?? 0;
    watchedRef.current = pending?.watchedSeconds ?? initial?.watchedSeconds ?? 0;
    previousPositionRef.current = positionRef.current;
    previousWallRef.current = performance.now();
    playingRef.current = false;
    const unsubscribe = writer.subscribe(
      (saved) => { if (isCurrent()) onSaved(saved); },
      () => { if (isCurrent()) onError("Video ilerlemesi kaydedilemedi."); },
    );

    const stopTicking = () => {
      if (tickTimer !== null) {
        window.clearInterval(tickTimer);
        tickTimer = null;
      }
    };

    const snapshot = () => ({
      lastPositionSeconds: Math.max(0, Math.min(video.durationSeconds, Math.floor(positionRef.current))),
      watchedSeconds: Math.max(0, Math.min(video.durationSeconds, Math.floor(watchedRef.current))),
    });
    const save = () => {
      if (!isCurrent() || !localPlayer || !playerReady) return;
      writer.flush(snapshot());
    };

    const sample = () => {
      if (!localPlayer || !playerReady) return;
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

    };
    const tick = () => {
      if (!isCurrent() || !playerReady) return;
      sample();
      writer.checkpoint(snapshot());
    };
    const flush = () => { tick(); save(); };
    flushRef.current = flush;

    const startTicking = () => {
      if (!isCurrent() || !playerReady || tickTimer !== null) return;
      previousWallRef.current = performance.now();
      previousPositionRef.current = localPlayer?.getCurrentTime() ?? positionRef.current;
      tickTimer = window.setInterval(tick, 1000);
    };

    void loadYouTubeIframeApi()
      .then((YT) => {
        if (!isCurrent()) return;

        localPlayer = new YT.Player(sdkTarget, {
          videoId: video.youtubeVideoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              if (!isCurrent()) return;
              playerReady = true;
              playerRef.current = target;
              const resume = positionRef.current;
              if (resume > 0 && resume < video.durationSeconds - 2) {
                pauseAfterRestoreSeek = playbackRef.current !== "running";
                target.seekTo(resume, true);
                positionRef.current = resume;
                previousPositionRef.current = resume;
              }
              if (playbackRef.current === "running") target.playVideo();
              else target.pauseVideo();
            },
            onStateChange: (event) => {
              if (!isCurrent() || !playerReady) return;
              playingRef.current = event.data === YT.PlayerState.PLAYING;
              if (event.data === YT.PlayerState.PLAYING) {
                // seekTo can finish asynchronously after the initial pause.
                if (playbackRef.current === "paused" || (pauseAfterRestoreSeek && playbackRef.current === "ready")) {
                  pauseAfterRestoreSeek = false;
                  playingRef.current = false;
                  stopTicking();
                  event.target.pauseVideo();
                  return;
                }
                pauseAfterRestoreSeek = false;
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
              if (!isCurrent()) return;
              stopTicking();
              onError("YouTube videosu oynatılamadı.");
            },
          },
        });
      })
      .catch(() => { if (isCurrent()) onError("YouTube oynatıcı yüklenemedi."); });

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
      if (retired) return;
      retired = true;
      if (generationRef.current === generation) generationRef.current++;
      stopTicking();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      unsubscribe();
      if (flushRef.current === flush) flushRef.current = () => undefined;
      if (playerRef.current === localPlayer) playerRef.current = null;
      if (playerReady) {
        // An unavailable SDK cannot discard the last successfully sampled point.
        try { sample(); } catch { /* Flush the cached snapshot below. */ }
        writer.flush(snapshot());
      }
      playerReady = false;
      try { localPlayer?.destroy(); } catch { /* The SDK subtree may already be detached. */ }
      finally { sdkRoot.remove(); }
    };
  }, [
    userId,
    playlistId,
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
  readonly checkpointContext?: string;
  readonly compact?: boolean;
  readonly playback?: "running" | "paused" | "ready";
  readonly resource: ResourceForecast;
  readonly initialVideoId?: string | null;
  /** undefined is resource browsing; null is a task without exact video scope. */
  readonly taskScope?: TaskMaterialScope | null;
  readonly onProgressChanged?: (progress: VideoProgress) => void;
}

export function VideoPlayerPanel({
  checkpointContext,
  compact = false,
  playback = "ready",
  resource,
  initialVideoId = null,
  taskScope,
  onProgressChanged,
}: VideoPlayerPanelProps) {
  const { user } = useAuth();
  const [library, setLibrary] = useState<ResourceVideoLibraryResponse | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const [verifiedVideoId, setVerifiedVideoId] = useState<string | null>(null);
  const [progressRetry, setProgressRetry] = useState(0);
  const [libraryRetry, setLibraryRetry] = useState(0);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const onProgressChangedRef = useRef(onProgressChanged);
  useEffect(() => { onProgressChangedRef.current = onProgressChanged; }, [onProgressChanged]);

  const videos = library ? flattenVideos(library.playlists) : [];
  const selectedVideo = videos.find((video) => video.id === selectedVideoId) ?? null;
  const selectedPlaylistId = library?.playlists.find((playlist) => playlist.videos.some((video) => video.id === selectedVideoId))?.id ?? null;
  const taskContext = taskScope !== undefined;
  const exactVideoId = taskScope?.kind === "full_video" ? taskScope.youtubePlaylistVideoId : initialVideoId;
  const exactDuration = taskScope?.kind === "full_video" ? taskScope.durationSeconds : null;
  const locked = taskScope?.kind === "full_video" || Boolean(exactVideoId);
  const libraryMatches = library?.resource.id === resource.resourceId && (!taskScope || taskScope.resourceId === resource.resourceId);
  const selectedVideoIdRef = useRef(selectedVideoId);
  selectedVideoIdRef.current = selectedVideoId;

  useEffect(() => {
    let cancelled = false;
    setLoadingLibrary(true);
    setError(null);
    setLibrary(null);
    setSelectedVideoId(null);
    setProgress(null);
    setVerifiedVideoId(null);

    void callAppApi<ResourceVideoLibraryResponse>(
      `/resources/${resource.resourceId}/youtube-videos`,
    )
      .then((payload) => {
        if (cancelled) return;
        if (payload.resource.id !== resource.resourceId) throw new Error("VIDEO_RESOURCE_MISMATCH");
        setLibrary(payload);
        const videos = flattenVideos(payload.playlists);
        const resolution = taskContext ? resolveTaskVideo(resource.resourceId, taskScope ?? null, payload) : null;
        if (resolution?.kind === "unavailable") { setError(resolution.message); return; }
        const selected = resolution?.kind === "exact" ? resolution.video
          : exactVideoId ? videos.find((video) => video.id === exactVideoId && playableCatalogVideo(video)) ?? null
          : taskContext ? null
          : videos.find((video) => playableCatalogVideo(video) && !video.progress?.completed) ?? videos.find(playableCatalogVideo) ?? null;
        if (exactVideoId && !selected) setError("Göreve bağlı video bu kaynakta bulunamadı. Kaynak bağlantısını kontrol et.");
        setSelectedVideoId(selected?.id ?? null);
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
  }, [exactVideoId, exactDuration, taskContext, taskScope?.kind, taskScope?.resourceId, resource.resourceId, libraryRetry]);

  useEffect(() => {
    setVerifiedVideoId(null);
    setProgress(null);
    if (!selectedVideo || !selectedPlaylistId || !libraryMatches || !playableCatalogVideo(selectedVideo) ||
        (locked && (selectedVideo.id !== exactVideoId || (exactDuration !== null && selectedVideo.durationSeconds !== exactDuration)))) {
      setProgress(null);
      return;
    }

    let cancelled = false;
    setLoadingProgress(true);
    setError(null);

    void callAppApi<VideoProgressResponse>(
      `/youtube-videos/${selectedVideo.id}/progress`,
    )
      .then((payload) => {
        const fresh = verifiedVideoProgress(selectedVideo, selectedPlaylistId, payload);
        if (!cancelled) {
          setProgress(fresh);
          setVerifiedVideoId(selectedVideo.id);
          setLibrary((current) => current ? {
            ...current,
            playlists: current.playlists.map((playlist) => ({
              ...playlist,
              videos: playlist.videos.map((video) => video.id === selectedVideo.id ? { ...video, progress: fresh } : video),
            })),
          } : current);
          if (fresh) onProgressChangedRef.current?.(fresh);
        }
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
  }, [selectedVideo?.id, selectedVideo?.youtubeVideoId, selectedVideo?.durationSeconds, selectedPlaylistId, libraryMatches, exactVideoId, exactDuration, progressRetry]);

  const saveProgress = useCallback((saved: VideoProgress) => {
    if (saved.youtubePlaylistVideoId !== selectedVideoIdRef.current) return;
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
    onProgressChangedRef.current?.(saved);
  }, []);

  const selectedIndex = videos.findIndex((video) => video.id === selectedVideoId);
  const completedCount = videos.filter((video) => video.progress?.completed).length;

  return <div className={`youtube-player-panel ${compact ? "is-inline" : ""}`}>
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
          {loadingProgress || !user || verifiedVideoId !== selectedVideo.id || !libraryMatches || !selectedPlaylistId || !playableCatalogVideo(selectedVideo) || (locked && (selectedVideo.id !== exactVideoId || (exactDuration !== null && selectedVideo.durationSeconds !== exactDuration)))
            ? <div className="youtube-player-state">{error && !loadingProgress ? "İlerleme doğrulanamadı." : "İlerleme yükleniyor…"}</div>
            : <EmbeddedYouTubePlayer
                userId={user.id}
                checkpointContext={checkpointContext}
                playlistId={selectedPlaylistId}
                video={selectedVideo}
                initialProgress={progress}
                onSaved={saveProgress}
                onError={setError}
                playerRef={playerRef}
                playback={playback}
              />}
        </section>

        <section className="youtube-current-video">
          <div>
            <span>{verifiedVideoId === selectedVideo.id ? "Şimdi izleniyor" : "Seçilen video"}</span>
            <strong>{selectedVideo.title}</strong>
            {selectedVideo.channelTitle && <small>{selectedVideo.channelTitle}</small>}
          </div>
          {verifiedVideoId === selectedVideo.id && <div className="youtube-current-progress">
            <strong>{youtubeTimeLabel(progress?.lastPositionSeconds ?? 0)} / {youtubeTimeLabel(selectedVideo.durationSeconds)}</strong>
            <span>
              Bu video · %{progress?.progressPercent ?? 0} izlendi
            </span>
          </div>}
        </section>
      </>
    )}

    {error && <div className="youtube-player-error" role="alert">{error} <button type="button" onClick={() => {
      setVerifiedVideoId(null);
      if (selectedVideo) setProgressRetry((value) => value + 1);
      else setLibraryRetry((value) => value + 1);
    }}>Tekrar dene</button></div>}
    {taskContext && !locked && !selectedVideo && libraryMatches && !loadingLibrary && <p>Bu görev için kesin video kapsamı belirtilmemiş. Kaynaktan izlemek istediğin videoyu seç.</p>}
    {locked && <p>Bu çalışma göreve bağlı video ile sınırlı. Diğer dersleri Kaynaklar’dan açabilirsin.</p>}
    {selectedVideo && !locked && <div className="youtube-series-controls"><button type="button" disabled={selectedIndex <= 0 || !playableCatalogVideo(videos[selectedIndex - 1]!)} onClick={() => setSelectedVideoId(videos[selectedIndex - 1]!.id)}>← Önceki</button><span>Seri · {completedCount} / {videos.length} tamamlandı</span><button type="button" disabled={selectedIndex >= videos.length - 1 || !playableCatalogVideo(videos[selectedIndex + 1]!)} onClick={() => setSelectedVideoId(videos[selectedIndex + 1]!.id)}>Sonraki →</button></div>}
    <details className="youtube-library-disclosure" open={compact ? undefined : true}><summary>Video listesi · {videos.length} ders</summary>{library?.playlists.map((playlist) => (
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
              disabled={locked || !libraryMatches || !playableCatalogVideo(video)}
              onClick={() => {
                setVerifiedVideoId(null);
                setProgress(null);
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
    ))}</details>
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
  const dialogRef = useDialogAccessibility<HTMLElement>(Boolean(resource), onClose);

  if (!resource) return null;

  return <>
    <button
      className="youtube-player-backdrop"
      type="button"
      aria-label="Video oynatıcıyı kapat"
      onClick={onClose}
    />
    <aside
      ref={dialogRef}
      tabIndex={-1}
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
