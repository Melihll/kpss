begin;

create table public.youtube_video_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  youtube_playlist_video_id uuid not null references public.youtube_playlist_videos(id) on delete cascade,
  last_position_seconds integer not null default 0,
  watched_seconds integer not null default 0,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, youtube_playlist_video_id),

  constraint youtube_video_progress_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint youtube_video_progress_position_nonnegative
    check (last_position_seconds >= 0),

  constraint youtube_video_progress_watched_nonnegative
    check (watched_seconds >= 0)
);

create index youtube_video_progress_profile_idx
on public.youtube_video_progress(user_id, exam_profile_id);

create trigger youtube_video_progress_set_updated_at
before update on public.youtube_video_progress
for each row execute function public.set_updated_at();

alter table public.youtube_video_progress enable row level security;

revoke all on public.youtube_video_progress
from public, anon, authenticated;

grant select, insert, update, delete
on public.youtube_video_progress
to authenticated;

create policy "Users own youtube video progress"
on public.youtube_video_progress
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.youtube_playlist_videos video
    where video.id = youtube_video_progress.youtube_playlist_video_id
      and video.user_id = (select auth.uid())
      and video.exam_profile_id = youtube_video_progress.exam_profile_id
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.youtube_playlist_videos video
    where video.id = youtube_video_progress.youtube_playlist_video_id
      and video.user_id = (select auth.uid())
      and video.exam_profile_id = youtube_video_progress.exam_profile_id
  )
);

create or replace function public.record_youtube_video_progress(
  p_video_id uuid,
  p_position_seconds integer,
  p_watched_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_video public.youtube_playlist_videos;
  v_saved public.youtube_video_progress;
  v_position integer;
  v_watched integer;
  v_threshold integer;
begin
  if p_position_seconds is null or p_position_seconds < 0 then
    raise exception 'YOUTUBE_VIDEO_PROGRESS_INVALID_POSITION';
  end if;

  if p_watched_seconds is null or p_watched_seconds < 0 then
    raise exception 'YOUTUBE_VIDEO_PROGRESS_INVALID_WATCHED_SECONDS';
  end if;

  select *
  into v_video
  from public.youtube_playlist_videos
  where id = p_video_id
    and user_id = auth.uid()
    and is_active = true;

  if not found then
    raise exception 'YOUTUBE_VIDEO_NOT_FOUND';
  end if;

  if v_video.duration_seconds <= 0 then
    raise exception 'YOUTUBE_VIDEO_DURATION_UNAVAILABLE';
  end if;

  v_position := least(p_position_seconds, v_video.duration_seconds);
  v_watched := least(p_watched_seconds, v_video.duration_seconds);
  v_threshold := ceil(v_video.duration_seconds * 0.95)::integer;

  insert into public.youtube_video_progress(
    user_id,
    exam_profile_id,
    youtube_playlist_video_id,
    last_position_seconds,
    watched_seconds,
    completed_at
  )
  values(
    auth.uid(),
    v_video.exam_profile_id,
    v_video.id,
    v_position,
    v_watched,
    case when v_watched >= v_threshold then now() else null end
  )
  on conflict(user_id, youtube_playlist_video_id)
  do update set
    last_position_seconds = excluded.last_position_seconds,
    watched_seconds = greatest(
      public.youtube_video_progress.watched_seconds,
      excluded.watched_seconds
    ),
    completed_at = case
      when greatest(
        public.youtube_video_progress.watched_seconds,
        excluded.watched_seconds
      ) >= v_threshold
      then coalesce(public.youtube_video_progress.completed_at, now())
      else public.youtube_video_progress.completed_at
    end
  returning *
  into v_saved;

  return jsonb_build_object(
    'youtubePlaylistVideoId', v_saved.youtube_playlist_video_id,
    'lastPositionSeconds', v_saved.last_position_seconds,
    'watchedSeconds', v_saved.watched_seconds,
    'durationSeconds', v_video.duration_seconds,
    'progressPercent', least(
      100,
      round((v_saved.watched_seconds::numeric / v_video.duration_seconds::numeric) * 100)
    )::integer,
    'remainingSeconds', greatest(0, v_video.duration_seconds - v_saved.watched_seconds),
    'completed', v_saved.completed_at is not null,
    'completedAt', v_saved.completed_at,
    'createdAt', v_saved.created_at,
    'updatedAt', v_saved.updated_at
  );
end;
$$;

revoke all
on function public.record_youtube_video_progress(uuid, integer, integer)
from public, anon;

grant execute
on function public.record_youtube_video_progress(uuid, integer, integer)
to authenticated;

commit;