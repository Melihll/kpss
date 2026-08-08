create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text null,
  timezone text not null default 'Europe/Istanbul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_profiles is 'User-owned profile data created from Auth signups.';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata_display_name text;
begin
  if jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string' then
    metadata_display_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  end if;

  insert into public.user_profiles (id, display_name)
  values (new.id, metadata_display_name)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    raise warning 'Could not create profile for auth user %: %', new.id, sqlerrm;
    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.user_profiles enable row level security;

revoke all on table public.user_profiles from anon;
revoke all on table public.user_profiles from authenticated;
grant select, update on table public.user_profiles to authenticated;

create policy "Users can read their own profile"
on public.user_profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
