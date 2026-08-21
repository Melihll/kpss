# YouTube material provisioning contract

This is a user-scoped provisioning flow. It does not use a service-role token and is dry-run by default.

Required production inputs:

- `YOUTUBE_API_KEY` configured only as an Edge Function secret.
- The exact YouTube playlist URL.
- The exact YouTube playlist ID (`list=` value).
- The existing production resource UUID.
- The existing curriculum topic UUID.
- Whether this is the primary link for that topic.
- A short-lived authenticated access token for the owner of the resource/profile.

The topic and resource must belong to the same subject. The API enforces user/profile ownership, the primary-link invariant, playlist ownership, and link existence before sync.

Preview the exact request without sending it:

```powershell
node scripts/provision-youtube-material.mjs `
  --api-url "https://PROJECT.supabase.co/functions/v1/app-api" `
  --access-token "USER_ACCESS_TOKEN" `
  --topic-id "TOPIC_UUID" `
  --resource-id "RESOURCE_UUID" `
  --playlist-id "YOUTUBE_PLAYLIST_ID" `
  --playlist-url "https://www.youtube.com/playlist?list=YOUTUBE_PLAYLIST_ID" `
  --primary
```

After the dry-run is reviewed, append `--apply`. The script performs exactly three authenticated operations:

1. Upsert the topic/resource/playlist link.
2. Synchronize the linked playlist catalog using the server-side API key.
3. Read the resource video list back for verification.

Never place `YOUTUBE_API_KEY`, a service-role key, or the access token in source control, command transcripts, or release reports.
