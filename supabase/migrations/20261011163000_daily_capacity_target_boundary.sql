begin;
-- Preserve legacy window arithmetic; daily mode uses the R2 profile/strategy target fallback.
CREATE OR REPLACE FUNCTION kpss_s0_private.day_capacities(p_input jsonb, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_date date; v_week date:=(p_input->>'weekStart')::date; v_today date:=(p_input->>'today')::date;
  v_w int4multirange; v_u int4multirange; v_row jsonb; v_override jsonb;
  v_base numeric; v_removed numeric; v_multiplier numeric; v_delta numeric;
  v_calculated numeric; v_base_calculated numeric; v_planning numeric; v_spent numeric;
  v_target date:=coalesce((p_input#>>'{profile,target_exam_date}')::date,(select min((value->>'target_exam_date')::date) from jsonb_array_elements(coalesce(p_input->'strategies','[]')) where value->>'status'='active'));
  v_start integer; v_end integer; v_result jsonb:='{}'::jsonb;
begin
  if p_mode not in ('p48','manual') or p_mode is null then raise exception 'INVALID_CAPACITY_MODE'; end if;
  for i in 0..6 loop
    v_date:=v_week+i; v_w:='{}'::int4multirange; v_u:='{}'::int4multirange;
    if p_input#>>'{capacitySource,mode}'='daily_minutes' then
      if v_date<v_today or v_date<(p_input#>>'{profile,preparation_start_date}')::date or v_date>v_target then
        v_result:=v_result||jsonb_build_object(v_date::text,0); continue;
      end if;
      if exists(select 1 from jsonb_array_elements(p_input->'exceptions') where (value->>'exception_date')::date=v_date and value->>'exception_type'='unavailable' and value->>'start_time' is not null) then raise exception 'CAPACITY_TIMED_EXCEPTION_UNSUPPORTED'; end if;
      select (value->>'minutes')::integer into v_base from jsonb_array_elements(p_input#>'{capacitySource,days}') where (value->>'weekday')::integer=extract(isodow from v_date);
      if v_base is null or v_base not between 0 and 1440 then raise exception 'INVALID_DAILY_CAPACITY'; end if;
      v_removed:=0;
    else
    for v_row in select value from jsonb_array_elements(p_input->'availability') where (value->>'is_active')::boolean and (value->>'weekday')::integer=extract(isodow from v_date) loop
      v_start:=extract(hour from (v_row->>'start_time')::time)::int*60+extract(minute from (v_row->>'start_time')::time)::int;
      v_end:=extract(hour from (v_row->>'end_time')::time)::int*60+extract(minute from (v_row->>'end_time')::time)::int;
      v_w:=v_w+int4multirange(int4range(v_start,v_end,'[)'));
    end loop;
    for v_row in select value from jsonb_array_elements(p_input->'exceptions') where (value->>'exception_date')::date=v_date and value->>'exception_type'='unavailable' and value->>'start_time' is not null loop
      v_start:=extract(hour from (v_row->>'start_time')::time)::int*60+extract(minute from (v_row->>'start_time')::time)::int;
      v_end:=extract(hour from (v_row->>'end_time')::time)::int*60+extract(minute from (v_row->>'end_time')::time)::int;
      v_u:=v_u+int4multirange(int4range(v_start,v_end,'[)'));
    end loop;
    select coalesce(sum(upper(r)-lower(r)),0) into v_base from unnest(v_w) r;
    select coalesce(sum(upper(r)-lower(r)),0) into v_removed from unnest(v_w*v_u) r;
    end if;
    select coalesce(min((value->>'capacity_multiplier')::numeric),1) into v_multiplier from jsonb_array_elements(p_input->'periods') where (value->>'start_date')::date<=v_date and (value->>'end_date')::date>=v_date;
    select coalesce(sum((value->>'minutes_delta')::numeric),0) into v_delta from jsonb_array_elements(p_input->'exceptions') where (value->>'exception_date')::date=v_date and value->>'exception_type' in ('extra_available','custom','unavailable');
    v_base_calculated:=greatest(0,floor(v_base*greatest(0,v_multiplier)+0.5));
    v_calculated:=greatest(0,floor((v_base-v_removed)*greatest(0,v_multiplier)+v_delta+0.5));
    select value into v_override from jsonb_array_elements(p_input->'overrides') where (value->>'capacity_date')::date=v_date;
    v_planning:=case when v_override is null then v_calculated else greatest(0,(v_override->>'capacity_minutes')::numeric-(v_override->>'reserve_minutes')::numeric+v_calculated-v_base_calculated) end;
    if p_mode='p48' then
      select coalesce(sum(greatest(0,(value->>'planned_credit_minutes')::numeric)),0) into v_spent from jsonb_array_elements(p_input->'allocations') where ((value->>'session_started_at')::timestamptz at time zone 'Europe/Istanbul')::date=v_date;
    else
      select coalesce(sum(greatest(0,(value->>'duration_minutes')::numeric)),0) into v_spent from jsonb_array_elements(p_input->'sessions') where value->>'status'='completed' and ((value->>'started_at')::timestamptz at time zone 'Europe/Istanbul')::date=v_date;
    end if;
    v_result:=v_result||jsonb_build_object(v_date::text,case when v_date<v_today then 0 else greatest(0,v_planning-v_spent) end);
  end loop;
  return v_result;
end; $function$;
notify pgrst, 'reload schema';
commit;
