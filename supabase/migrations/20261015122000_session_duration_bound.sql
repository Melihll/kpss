begin;

-- Clients may not hide an excessive duration behind a short claimed interval.
-- Explicit reviews and transaction-bound retroactive confirmations retain their
-- own validation. No existing session or migration is rewritten.
create function p0_session_integrity.guard_duration_bound() returns trigger
language plpgsql security definer set search_path='' as $$
declare c jsonb; observed integer;
begin
 if auth.uid() is null and session_user in ('postgres','supabase_admin') then return new; end if;
 if new.status<>'completed' or (tg_op='UPDATE' and old.status='completed') then return new; end if;
 if exists(select 1 from p0_session_integrity.finish_reviews r where r.session_id=new.id and r.user_id=auth.uid() and r.phase='confirmed') then return new; end if;
 if tg_op='INSERT' then c:=jsonb_build_object('session',to_jsonb(new),'breaks','[]'::jsonb);
 else c:=p0_session_integrity.context(new.id); end if;
 observed:=(p0_session_integrity.observation(c,case when tg_op='INSERT' then coalesce(new.ended_at,now()) else now() end)->>'observedMinutes')::integer;
 if new.duration_minutes>observed then raise exception 'INVALID_SESSION_DURATION'; end if;
 return new;
end $$;
revoke all on function p0_session_integrity.guard_duration_bound() from public,anon,authenticated,service_role;
create trigger p0_session_credited_duration_guard before insert or update on public.study_sessions
for each row execute function p0_session_integrity.guard_duration_bound();
notify pgrst,'reload schema';
commit;
