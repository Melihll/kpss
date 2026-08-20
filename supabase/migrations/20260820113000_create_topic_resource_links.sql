begin;

create table public.youtube_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  source_url text not null,
  youtube_playlist_id text not null,
  title text null,
  total_duration_seconds integer not null default 0,
  video_count integer not null default 0,
  last_synced_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint youtube_playlists_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint youtube_playlists_id_owner_unique
    unique (id, user_id, exam_profile_id),

  constraint youtube_playlists_identity_unique
    unique (user_id, exam_profile_id, youtube_playlist_id),

  constraint youtube_playlists_source_url_not_blank
    check (btrim(source_url) <> ''),

  constraint youtube_playlists_youtube_id_not_blank
    check (btrim(youtube_playlist_id) <> ''),

  constraint youtube_playlists_total_duration_nonnegative
    check (total_duration_seconds >= 0),

  constraint youtube_playlists_video_count_nonnegative
    check (video_count >= 0)
);

create table public.topic_resource_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  curriculum_node_id uuid not null references public.curriculum_nodes(id),
  resource_id uuid not null,
  youtube_playlist_id uuid null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint topic_resource_links_profile_owner_fk
    foreign key (exam_profile_id, user_id)
    references public.exam_profiles(id, user_id)
    on delete cascade,

  constraint topic_resource_links_resource_owner_fk
    foreign key (resource_id, user_id)
    references public.resources(id, user_id)
    on delete cascade,

  constraint topic_resource_links_playlist_fk
    foreign key (youtube_playlist_id)
    references public.youtube_playlists(id)
    on delete set null,

  constraint topic_resource_links_unique
    unique (user_id, exam_profile_id, curriculum_node_id, resource_id)
);

create index topic_resource_links_topic_idx
on public.topic_resource_links(user_id, exam_profile_id, curriculum_node_id);

create index topic_resource_links_resource_idx
on public.topic_resource_links(user_id, resource_id);

create index youtube_playlists_profile_idx
on public.youtube_playlists(user_id, exam_profile_id);

create or replace function public.enforce_single_primary_topic_resource()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.is_primary then
    update public.topic_resource_links
    set is_primary=false
    where user_id=new.user_id
      and exam_profile_id=new.exam_profile_id
      and curriculum_node_id=new.curriculum_node_id
      and id<>new.id
      and is_primary=true;
  end if;
  return new;
end;
$$;

create trigger topic_resource_links_single_primary
before insert or update of is_primary
on public.topic_resource_links
for each row
execute function public.enforce_single_primary_topic_resource();

create trigger youtube_playlists_set_updated_at
before update on public.youtube_playlists
for each row execute function public.set_updated_at();

create trigger topic_resource_links_set_updated_at
before update on public.topic_resource_links
for each row execute function public.set_updated_at();

alter table public.youtube_playlists enable row level security;
alter table public.topic_resource_links enable row level security;

revoke all on public.youtube_playlists, public.topic_resource_links
from public, anon, authenticated;

grant select, insert, update, delete
on public.youtube_playlists, public.topic_resource_links
to authenticated;

create policy "Users own youtube playlists"
on public.youtube_playlists
for all
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

create policy "Users own topic resource links"
on public.topic_resource_links
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.resources r
    join public.curriculum_nodes c
      on c.id = topic_resource_links.curriculum_node_id
     and c.subject_id = r.subject_id
    where r.id = topic_resource_links.resource_id
      and r.user_id = (select auth.uid())
      and r.exam_profile_id = topic_resource_links.exam_profile_id
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.resources r
    join public.curriculum_nodes c
      on c.id = topic_resource_links.curriculum_node_id
     and c.subject_id = r.subject_id
    where r.id = topic_resource_links.resource_id
      and r.user_id = (select auth.uid())
      and r.exam_profile_id = topic_resource_links.exam_profile_id
  )
  and (
    topic_resource_links.youtube_playlist_id is null
    or exists (
      select 1
      from public.youtube_playlists yp
      where yp.id = topic_resource_links.youtube_playlist_id
        and yp.user_id = (select auth.uid())
        and yp.exam_profile_id = topic_resource_links.exam_profile_id
    )
  )
);

commit;