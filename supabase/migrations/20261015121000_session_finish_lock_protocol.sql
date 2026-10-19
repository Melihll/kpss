begin;
-- Keep the old Finish calculation behind a private-to-callers wrapper. All RPC clients take profile before session.
alter function public.finish_study_session(uuid) rename to finish_study_session_pre_p0_integrity;
revoke all on function public.finish_study_session_pre_p0_integrity(uuid) from public,anon,authenticated,service_role;
create function public.finish_study_session(p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED';end if;
 perform 1 from public.exam_profiles where user_id=auth.uid() and id=(select exam_profile_id from public.study_sessions where id=p_session_id and user_id=auth.uid()) for update;
 if not found then raise exception 'SESSION_NOT_FOUND';end if;
 return public.finish_study_session_pre_p0_integrity(p_session_id);
end $$;
revoke all on function public.finish_study_session(uuid) from public,anon;
grant execute on function public.finish_study_session(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
