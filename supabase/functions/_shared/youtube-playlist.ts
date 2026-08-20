export interface YouTubePlaylistVideo {
  readonly youtubeVideoId: string;
  readonly title: string;
  readonly position: number;
  readonly durationSeconds: number;
  readonly thumbnailUrl: string | null;
  readonly channelTitle: string | null;
  readonly publishedAt: string | null;
}

export interface YouTubePlaylistCatalog {
  readonly title: string;
  readonly videoCount: number;
  readonly totalDurationSeconds: number;
  readonly skippedVideoCount: number;
  readonly videos: readonly YouTubePlaylistVideo[];
}

interface FetchPlaylistInput {
  readonly apiKey: string;
  readonly youtubePlaylistId: string;
  readonly fetchImpl?: typeof fetch;
}

function youtubeApiUrl(
  resource: "playlists" | "playlistItems" | "videos",
  params: Record<string, string>,
): string {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<any> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch {
    throw new Error("YOUTUBE_API_REQUEST_FAILED");
  }
  if (!response.ok) throw new Error("YOUTUBE_API_REQUEST_FAILED");
  try {
    return await response.json();
  } catch {
    throw new Error("YOUTUBE_API_INVALID_RESPONSE");
  }
}

export function parseYouTubeDurationSeconds(value: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) throw new Error("YOUTUBE_API_INVALID_RESPONSE");
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("YOUTUBE_API_INVALID_RESPONSE");
  return total;
}

function bestThumbnail(snippet: any): string | null {
  const thumbnails = snippet?.thumbnails;
  return thumbnails?.maxres?.url ?? thumbnails?.standard?.url ?? thumbnails?.high?.url ??
    thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export async function fetchYouTubePlaylistCatalog(
  input: FetchPlaylistInput,
): Promise<YouTubePlaylistCatalog> {
  const apiKey = input.apiKey.trim();
  const youtubePlaylistId = input.youtubePlaylistId.trim();
  if (!apiKey || !youtubePlaylistId) throw new Error("YOUTUBE_API_INVALID_RESPONSE");

  const fetchImpl = input.fetchImpl ?? fetch;

  const playlistPayload = await fetchJson(
    fetchImpl,
    youtubeApiUrl("playlists", {
      part: "snippet,contentDetails",
      id: youtubePlaylistId,
      key: apiKey,
      maxResults: "1",
    }),
  );
  const playlist = playlistPayload?.items?.[0];
  if (!playlist?.id || !playlist?.snippet?.title) throw new Error("YOUTUBE_PLAYLIST_NOT_FOUND");

  const playlistItems: Array<{ videoId: string; position: number }> = [];
  let pageToken: string | undefined;
  do {
    const payload = await fetchJson(
      fetchImpl,
      youtubeApiUrl("playlistItems", {
        part: "contentDetails,snippet",
        playlistId: youtubePlaylistId,
        key: apiKey,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      }),
    );
    if (!Array.isArray(payload?.items)) throw new Error("YOUTUBE_API_INVALID_RESPONSE");
    for (const item of payload.items) {
      const videoId = String(item?.contentDetails?.videoId ?? item?.snippet?.resourceId?.videoId ?? "").trim();
      const position = Number(item?.snippet?.position);
      if (!videoId || !Number.isInteger(position) || position < 0) continue;
      playlistItems.push({ videoId, position });
    }
    pageToken = typeof payload?.nextPageToken === "string" ? payload.nextPageToken : undefined;
  } while (pageToken);

  const details = new Map<string, any>();
  for (const batch of chunks([...new Set(playlistItems.map((item) => item.videoId))], 50)) {
    if (!batch.length) continue;
    const payload = await fetchJson(
      fetchImpl,
      youtubeApiUrl("videos", {
        part: "snippet,contentDetails",
        id: batch.join(","),
        key: apiKey,
        maxResults: "50",
      }),
    );
    if (!Array.isArray(payload?.items)) throw new Error("YOUTUBE_API_INVALID_RESPONSE");
    for (const video of payload.items) if (typeof video?.id === "string") details.set(video.id, video);
  }

  const videos: YouTubePlaylistVideo[] = [];
  let skippedVideoCount = 0;
  for (const item of playlistItems.sort((a, b) => a.position - b.position)) {
    const detail = details.get(item.videoId);
    if (!detail?.snippet?.title || !detail?.contentDetails?.duration) {
      skippedVideoCount += 1;
      continue;
    }
    videos.push(Object.freeze({
      youtubeVideoId: item.videoId,
      title: String(detail.snippet.title),
      position: item.position,
      durationSeconds: parseYouTubeDurationSeconds(String(detail.contentDetails.duration)),
      thumbnailUrl: bestThumbnail(detail.snippet),
      channelTitle: detail.snippet.channelTitle ? String(detail.snippet.channelTitle) : null,
      publishedAt: detail.snippet.publishedAt ? String(detail.snippet.publishedAt) : null,
    }));
  }

  const totalDurationSeconds = videos.reduce((sum, video) => sum + video.durationSeconds, 0);
  return Object.freeze({
    title: String(playlist.snippet.title),
    videoCount: videos.length,
    totalDurationSeconds,
    skippedVideoCount,
    videos: Object.freeze(videos),
  });
}