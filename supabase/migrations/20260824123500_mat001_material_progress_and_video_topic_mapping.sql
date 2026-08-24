begin;

-- MAT-001: exact partial progress for canonical physical units.
-- Historical progress rows intentionally remain NULL.
alter table public.resource_unit_progress
  add column completed_through_page integer null;

alter table public.resource_unit_progress
  add constraint resource_unit_progress_completed_through_page_positive
  check (completed_through_page is null or completed_through_page > 0);

create or replace function public.validate_resource_unit_progress_page_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_page_start integer;
  v_page_end integer;
begin
  if new.completed_through_page is null then
    return new;
  end if;

  select ru.page_start, ru.page_end
  into v_page_start, v_page_end
  from public.resource_units ru
  where ru.id = new.resource_unit_id;

  if not found or v_page_start is null or v_page_end is null then
    raise exception 'RESOURCE_UNIT_HAS_NO_PAGE_RANGE';
  end if;

  if new.completed_through_page < v_page_start
     or new.completed_through_page > v_page_end then
    raise exception 'COMPLETED_THROUGH_PAGE_OUT_OF_RANGE';
  end if;

  if new.status not in ('in_progress', 'completed') then
    raise exception 'COMPLETED_THROUGH_PAGE_STATUS_INVALID';
  end if;

  if new.status = 'completed'
     and new.completed_through_page <> v_page_end then
    raise exception 'COMPLETED_THROUGH_PAGE_COMPLETED_INCONSISTENT';
  end if;

  if new.status = 'in_progress'
     and new.completed_through_page >= v_page_end then
    raise exception 'COMPLETED_THROUGH_PAGE_IN_PROGRESS_INCONSISTENT';
  end if;

  return new;
end;
$$;

create trigger resource_unit_progress_validate_page_boundary
before insert or update of completed_through_page, status, resource_unit_id
on public.resource_unit_progress
for each row
execute function public.validate_resource_unit_progress_page_boundary();

-- Safe composite identity for user/profile-owned playlist videos.
alter table public.youtube_playlist_videos
  add constraint youtube_playlist_videos_id_owner_unique
  unique (id, user_id, exam_profile_id);

-- Canonical M:N individual video-to-curriculum mapping.
create table public.youtube_video_topic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  youtube_playlist_video_id uuid not null,
  curriculum_node_id uuid not null references public.curriculum_nodes(id),
  mapping_status text not null default 'ambiguous',
  mapping_provenance text not null default 'ai_candidate',
  segment_start_seconds integer null,
  segment_end_seconds integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint youtube_video_topic_links_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint youtube_video_topic_links_video_owner_fk
    foreign key (youtube_playlist_video_id, user_id, exam_profile_id)
    references public.youtube_playlist_videos(id, user_id, exam_profile_id)
    on delete cascade,

  constraint youtube_video_topic_links_mapping_status_valid
    check (mapping_status in ('validated', 'ambiguous')),

  constraint youtube_video_topic_links_mapping_provenance_valid
    check (mapping_provenance in ('reviewed_mapping', 'trusted_import', 'corrected', 'ai_candidate')),

  constraint youtube_video_topic_links_segment_pair
    check (
      (segment_start_seconds is null and segment_end_seconds is null)
      or
      (segment_start_seconds is not null and segment_end_seconds is not null)
    ),

  constraint youtube_video_topic_links_segment_start_nonnegative
    check (segment_start_seconds is null or segment_start_seconds >= 0),

  constraint youtube_video_topic_links_segment_end_positive
    check (segment_end_seconds is null or segment_end_seconds > 0),

  constraint youtube_video_topic_links_segment_order
    check (
      segment_start_seconds is null
      or segment_end_seconds > segment_start_seconds
    )
);

create unique index youtube_video_topic_links_active_unique
on public.youtube_video_topic_links (
  user_id,
  exam_profile_id,
  youtube_playlist_video_id,
  curriculum_node_id
)
where is_active = true;

create index youtube_video_topic_links_video_idx
on public.youtube_video_topic_links (
  user_id, exam_profile_id, youtube_playlist_video_id
);

create index youtube_video_topic_links_topic_idx
on public.youtube_video_topic_links (
  user_id, exam_profile_id, curriculum_node_id
);

create or replace function public.validate_youtube_video_topic_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_duration_seconds integer;
begin
  if new.segment_start_seconds is null
     and new.segment_end_seconds is null then
    return new;
  end if;

  select ypv.duration_seconds
  into v_duration_seconds
  from public.youtube_playlist_videos ypv
  where ypv.id = new.youtube_playlist_video_id
    and ypv.user_id = new.user_id
    and ypv.exam_profile_id = new.exam_profile_id;

  if not found then
    raise exception 'YOUTUBE_VIDEO_MAPPING_OWNER_MISMATCH';
  end if;

  if v_duration_seconds is null or v_duration_seconds <= 0 then
    raise exception 'YOUTUBE_VIDEO_DURATION_MISSING';
  end if;

  if new.segment_end_seconds > v_duration_seconds then
    raise exception 'SEGMENT_OUTSIDE_VIDEO_DURATION';
  end if;

  return new;
end;
$$;

create trigger youtube_video_topic_links_validate
before insert or update of
  youtube_playlist_video_id,
  user_id,
  exam_profile_id,
  segment_start_seconds,
  segment_end_seconds
on public.youtube_video_topic_links
for each row
execute function public.validate_youtube_video_topic_link();

create trigger youtube_video_topic_links_set_updated_at
before update on public.youtube_video_topic_links
for each row
execute function public.set_updated_at();

alter table public.youtube_video_topic_links enable row level security;

revoke all on public.youtube_video_topic_links from public, anon, authenticated;
grant select, insert, update, delete on public.youtube_video_topic_links to authenticated;

create policy "Users own youtube video topic links"
on public.youtube_video_topic_links
for all
to authenticated
using (
  user_id = (select auth.uid())
)
with check (
  user_id = (select auth.uid())
);

commit;
