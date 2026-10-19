begin;
-- Privilege-only DB47 -> DB48. No function/owner/schema/boundary/data changes.
-- postgres already has the platform's ADMIN management grant for this role.
do $$ begin
 if session_user<>'postgres' or current_user<>'postgres'
 or (select count(*) from supabase_migrations.schema_migrations)<>47
 or not exists(select 1 from supabase_migrations.schema_migrations where version='20261017213000') then
  raise exception 'EXACT_PRODUCTION47_OPERATOR_REQUIRED';
 end if;
 if not exists(select 1 from pg_auth_members where roleid='kpss_session_repairer'::regrole
   and member='postgres'::regrole and grantor='supabase_admin'::regrole
   and admin_option and not inherit_option and not set_option)
 or exists(select 1 from pg_auth_members where roleid='kpss_session_repairer'::regrole
   and (member<>'postgres'::regrole or grantor<>'supabase_admin'::regrole or inherit_option or set_option)) then
  raise exception 'EXACT_REPAIR_MEMBERSHIP_REQUIRED';
 end if;
 if exists(select 1 from pg_roles where rolname='kpss_session_repairer'
   and (rolcanlogin or rolinherit or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)) then
  raise exception 'RESTRICTED_REPAIR_ROLE_REQUIRED';
 end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='p0_session_repair')<>9
 or exists(
  select 1 from (values
   ('p0_session_repair.apply(uuid,text,integer)','f51dc52b66f2c018df61dcac6d29e4d8','kpss_session_repairer'),
   ('p0_session_repair.authorize(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text)','c1185077fa7fce29ce4e7c1bcfa0e03b','postgres'),
   ('p0_session_repair.guard_allocation_change()','6ea01fa746898b6d8e00583d0290848a','kpss_session_repairer'),
   ('p0_session_repair.guard_report()','0d4382835cf4df5febc86ed7ded6dc02','kpss_session_repairer'),
   ('p0_session_repair.immutable_receipt()','91c8b99ce939bcb5d25f1612315c93dd','kpss_session_repairer'),
   ('p0_session_repair.revision(jsonb)','c73e19cb6dbd367d78c40c8c844de97b','kpss_session_repairer'),
   ('p0_session_repair.scope(text,uuid,uuid,uuid,timestamptz)','7000df1f7a438e3f6f454a4bc1483f56','kpss_session_repairer'),
   ('p0_session_repair.session_change_allowed(public.study_sessions,public.study_sessions)','1d789482e935431b5750d8eae5070f0d','kpss_session_repairer'),
   ('p0_session_repair.snapshot(uuid)','cad9c6d2616e7d3024ba202747cfccf7','kpss_session_repairer')
  ) e(signature,body_hash,owner_name)
  left join pg_proc p on p.oid=to_regprocedure(e.signature)
  where p.oid is null or md5(p.prosrc)<>e.body_hash or pg_get_userbyid(p.proowner)<>e.owner_name
 ) then raise exception 'EXACT_REPAIR_FUNCTION_BASELINE_REQUIRED';end if;
end $$;

-- NOINHERIT does not confer the owner's function GRANT OPTION. Act explicitly
-- as the existing owner, only within this transaction; retain no SET authority.
grant kpss_session_repairer to postgres with inherit false,set true;
set local role kpss_session_repairer;
revoke execute on function
 p0_session_repair.apply(uuid,text,integer),
 p0_session_repair.guard_allocation_change(),
 p0_session_repair.guard_report(),
 p0_session_repair.immutable_receipt(),
 p0_session_repair.revision(jsonb),
 p0_session_repair.scope(text,uuid,uuid,uuid,timestamptz),
 p0_session_repair.session_change_allowed(public.study_sessions,public.study_sessions),
 p0_session_repair.snapshot(uuid)
from public;
-- Replace implicit PUBLIC access with the three operator entry points intended
-- by DB47. authorize remains postgres-owned and is already private.
grant execute on function
 p0_session_repair.apply(uuid,text,integer),
 p0_session_repair.snapshot(uuid),
 p0_session_repair.revision(jsonb)
to postgres;
reset role;
revoke kpss_session_repairer from postgres granted by postgres;

do $$ begin
 if (select count(*) from pg_auth_members where roleid='kpss_session_repairer'::regrole)<>1
 or exists(select 1 from pg_auth_members where roleid='kpss_session_repairer'::regrole
  and (member<>'postgres'::regrole or grantor<>'supabase_admin'::regrole or not admin_option or inherit_option or set_option)) then
  raise exception 'REPAIR_MEMBERSHIP_NOT_RESTORED';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where n.nspname='p0_session_repair' and a.grantee=0 and a.privilege_type='EXECUTE')
 or exists(select 1 from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='p0_session_repair' and r.rolname in ('anon','authenticated','service_role','authenticator')
   and has_function_privilege(r.oid,p.oid,'EXECUTE')) then
  raise exception 'PRIVATE_REPAIR_EXECUTE_NOT_CLOSED';
 end if;
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator')
   and has_schema_privilege(r.oid,'p0_session_repair','USAGE')) then raise exception 'PRIVATE_REPAIR_SCHEMA_ACCESS_DRIFT';end if;
 if not has_function_privilege('postgres','p0_session_repair.authorize(uuid,uuid,uuid,uuid,uuid,uuid,date,text,text)','EXECUTE')
 or not has_function_privilege('postgres','p0_session_repair.apply(uuid,text,integer)','EXECUTE')
 or not has_function_privilege('postgres','p0_session_repair.snapshot(uuid)','EXECUTE')
 or not has_function_privilege('postgres','p0_session_repair.revision(jsonb)','EXECUTE') then
  raise exception 'NATIVE_REPAIR_OPERATOR_EXECUTE_MISSING';
 end if;
end $$;
commit;
