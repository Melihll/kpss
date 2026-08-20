export interface TopicResourcePlaylistInput {
  readonly sourceUrl: string;
  readonly youtubePlaylistId: string;
}

export interface TopicResourceLinkInput {
  readonly resourceId: string;
  readonly isPrimary: boolean;
  readonly playlist: TopicResourcePlaylistInput | null;
}

function youtubeHostAllowed(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "youtube.com" ||
    normalized === "www.youtube.com" ||
    normalized === "m.youtube.com" ||
    normalized === "music.youtube.com" ||
    normalized === "youtu.be"
  );
}

function normalizePlaylist(
  input: unknown,
): TopicResourcePlaylistInput | null {
  if (input == null) return null;
  if (typeof input !== "object") {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");
  }

  const value = input as Record<string, unknown>;
  const sourceUrl = String(value.sourceUrl ?? "").trim();
  const youtubePlaylistId = String(value.youtubePlaylistId ?? "").trim();

  if (!sourceUrl || !youtubePlaylistId) {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !youtubeHostAllowed(parsed.hostname)
  ) {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");
  }

  if (
    youtubePlaylistId.length < 4 ||
    youtubePlaylistId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(youtubePlaylistId)
  ) {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_PLAYLIST");
  }

  return Object.freeze({
    sourceUrl,
    youtubePlaylistId,
  });
}

export function normalizeTopicResourceLinkInput(
  input: unknown,
): TopicResourceLinkInput {
  if (!input || typeof input !== "object") {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_RESOURCE");
  }

  const value = input as Record<string, unknown>;
  const resourceId = String(value.resourceId ?? "").trim();

  if (!resourceId) {
    throw new Error("TOPIC_RESOURCE_LINK_INVALID_RESOURCE");
  }

  return Object.freeze({
    resourceId,
    isPrimary: value.isPrimary === true,
    playlist: normalizePlaylist(value.playlist),
  });
}