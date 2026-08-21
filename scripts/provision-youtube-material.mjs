#!/usr/bin/env node

function parseArgs(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--apply" || key === "--primary") {
      result.set(key.slice(2), true);
      continue;
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    result.set(key.slice(2), value);
    index += 1;
  }
  return result;
}

function required(args, name) {
  const value = args.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`--${name} is required`);
  }
  return value.trim();
}

async function request(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${response.status} ${body?.error?.code ?? "REQUEST_FAILED"}: ${body?.error?.message ?? "Unknown error"}`);
  }
  return body;
}

const args = parseArgs(process.argv.slice(2));
const apiUrl = required(args, "api-url").replace(/\/$/, "");
const accessToken = required(args, "access-token");
const topicId = required(args, "topic-id");
const resourceId = required(args, "resource-id");
const playlistId = required(args, "playlist-id");
const playlistUrl = required(args, "playlist-url");
const isPrimary = args.get("primary") === true;
const apply = args.get("apply") === true;

const contract = {
  topicId,
  resourceId,
  playlist: { sourceUrl: playlistUrl, youtubePlaylistId: playlistId },
  isPrimary,
};

if (!apply) {
  process.stdout.write(`${JSON.stringify({ mode: "DRY_RUN", request: contract }, null, 2)}\n`);
  process.stdout.write("No request was sent. Re-run with --apply after reviewing these exact IDs.\n");
  process.exit(0);
}

const linked = await request(
  `${apiUrl}/topics/${encodeURIComponent(topicId)}/material-links`,
  accessToken,
  { method: "PUT", body: JSON.stringify({ resourceId, isPrimary, playlist: contract.playlist }) },
);
const persistedPlaylistId = linked?.playlist?.id;
if (!persistedPlaylistId) throw new Error("Link response did not include a playlist database ID");

const synced = await request(
  `${apiUrl}/youtube-playlists/${encodeURIComponent(persistedPlaylistId)}/sync`,
  accessToken,
  { method: "POST", body: "{}" },
);
const verified = await request(
  `${apiUrl}/resources/${encodeURIComponent(resourceId)}/youtube-videos`,
  accessToken,
);

process.stdout.write(`${JSON.stringify({ mode: "APPLIED", linked, synced, verified }, null, 2)}\n`);
