begin;

create table public.youtube_playlist_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  youtube_playlist_id uuid not null,
  youtube_video_id text not null,
  title text not null,
  position integer not null,
  duration_seconds integer not null,
  thumbnail_url text null,
  channel_title text null,
  published_at timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint youtube_playlist_videos_playlist_owner_fk
    foreign key (youtube_playlist_id, user_id, exam_profile_id)
    references public.youtube_playlists(id, user_id, exam_profile_id)
    on delete cascade,

  constraint youtube_playlist_videos_identity_unique
    unique (youtube_playlist_id, youtube_video_id),

  constraint youtube_playlist_videos_title_not_blank check (btrim(title) <> ''),
  constraint youtube_playlist_videos_video_id_not_blank check (btrim(youtube_video_id) <> ''),
  constraint youtube_playlist_videos_position_nonnegative check (position >= 0),
  constraint youtube_playlist_videos_duration_nonnegative check (duration_seconds >= 0)
);

create index youtube_playlist_videos_order_idx
on public.youtube_playlist_videos(youtube_playlist_id, position)
where is_active=true;

create index youtube_playlist_videos_user_idx
on public.youtube_playlist_videos(user_id, exam_profile_id);

create trigger youtube_playlist_videos_set_updated_at
before update on public.youtube_playlist_videos
for each row execute function public.set_updated_at();

alter table public.youtube_playlist_videos enable row level security;

revoke all on public.youtube_playlist_videos from public, anon, authenticated;
grant select, insert, update, delete on public.youtube_playlist_videos to authenticated;

create policy "Users own youtube playlist videos"
on public.youtube_playlist_videos
for all
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.youtube_playlists yp
    where yp.id = youtube_playlist_videos.youtube_playlist_id
      and yp.user_id = (select auth.uid())
      and yp.exam_profile_id = youtube_playlist_videos.exam_profile_id
  )
);

create or replace function public.sync_youtube_playlist_catalog(
  p_playlist_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_playlist public.youtube_playlists;
  v_video jsonb;
  v_seen integer := 0;
  v_video_count integer;
  v_total_duration integer;
  v_title text;
begin
  select *
  into v_playlist
  from public.youtube_playlists
  where id = p_playlist_id
    and user_id = auth.uid()
  for update;

  if not found then raise exception 'YOUTUBE_PLAYLIST_NOT_FOUND'; end if;

  v_title := nullif(btrim(p_payload->>'title'), '');
  v_video_count := (p_payload->>'videoCount')::integer;
  v_total_duration := (p_payload->>'totalDurationSeconds')::integer;

  if v_title is null
    or v_video_count < 0
    or v_total_duration < 0
    or jsonb_typeof(p_payload->'videos') <> 'array'
    or jsonb_array_length(p_payload->'videos') <> v_video_count
  then
    raise exception 'YOUTUBE_API_INVALID_RESPONSE';
  end if;

  update public.youtube_playlist_videos
  set is_active = false
  where youtube_playlist_id = v_playlist.id
    and user_id = auth.uid()
    and is_active = true;

  for v_video in select value from jsonb_array_elements(p_payload->'videos')
  loop
    if nullif(btrim(v_video->>'youtubeVideoId'), '') is null
      or nullif(btrim(v_video->>'title'), '') is null
      or (v_video->>'position')::integer < 0
      or (v_video->>'durationSeconds')::integer < 0
    then
      raise exception 'YOUTUBE_API_INVALID_RESPONSE';
    end if;

    insert into public.youtube_playlist_videos(
      user_id, exam_profile_id, youtube_playlist_id, youtube_video_id,
      title, position, duration_seconds, thumbnail_url, channel_title,
      published_at, is_active
    )
    values(
      auth.uid(), v_playlist.exam_profile_id, v_playlist.id,
      v_video->>'youtubeVideoId', v_video->>'title',
      (v_video->>'position')::integer,
      (v_video->>'durationSeconds')::integer,
      nullif(v_video->>'thumbnailUrl', ''),
      nullif(v_video->>'channelTitle', ''),
      nullif(v_video->>'publishedAt', '')::timestamptz,
      true
    )
    on conflict(youtube_playlist_id, youtube_video_id)
    do update set
      title = excluded.title,
      position = excluded.position,
      duration_seconds = excluded.duration_seconds,
      thumbnail_url = excluded.thumbnail_url,
      channel_title = excluded.channel_title,
      published_at = excluded.published_at,
      is_active = true;

    v_seen := v_seen + 1;
  end loop;

  if v_seen <> v_video_count then raise exception 'YOUTUBE_API_INVALID_RESPONSE'; end if;

  update public.youtube_playlists
  set title = v_title,
      video_count = v_video_count,
      total_duration_seconds = v_total_duration,
      last_synced_at = now()
  where id = v_playlist.id
    and user_id = auth.uid();

  return jsonb_build_object(
    'playlistId', v_playlist.id,
    'videoCount', v_video_count,
    'totalDurationSeconds', v_total_duration,
    'syncedAt', now()
  );
end;
$$;

revoke all on function public.sync_youtube_playlist_catalog(uuid, jsonb) from public, anon;
grant execute on function public.sync_youtube_playlist_catalog(uuid, jsonb) to authenticated;

commit;