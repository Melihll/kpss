begin;

create table if not exists public.p48_reference_resources (
  id uuid primary key,
  subject_id uuid not null references public.subjects(id),
  name text not null,
  publisher text null,
  resource_type text not null,
  resource_role text not null,
  work_mode text not null,
  planned_minutes integer not null,
  sequence_order integer not null,
  notes text null,
  is_active boolean not null default true,
  constraint p48_reference_resource_minutes_positive check (planned_minutes > 0),
  constraint p48_reference_resource_sequence_positive check (sequence_order > 0),
  constraint p48_reference_resource_work_mode_valid check (work_mode in ('video','book','notes','questions','mock','review','other'))
);

alter table public.p48_reference_resources enable row level security;
revoke all on public.p48_reference_resources from public, anon;
grant select on public.p48_reference_resources to authenticated;
create policy "Authenticated users read P48 reference resources" on public.p48_reference_resources
for select to authenticated using (true);

insert into public.p48_reference_resources(
  id, subject_id, name, publisher, resource_type, resource_role,
  work_mode, planned_minutes, sequence_order, notes
) values
('31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','20 Günde Zemin Hazırla – Paragraf Anlam Bilgisi Soru Bankası','Zeduva','question_bank','reinforcement','questions',2100,1,'Paragraf / anlam bilgisi'),
('31000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','2026 KPSS Türkçe – Tamamı Çözümlü Soru Bankası','Hoca Kafası Yayınları','question_bank','primary','questions',2700,2,'Öznur Saat Yıldırım'),
('31000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','2026 KPSS Matematik Soru Bankası','Yediiklim Atölyesi','question_bank','primary','questions',3300,1,'Mehmet Bilge Yıldız'),
('31000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002','2026 KPSS Genel Yetenek Matematik Soru Bankası – Tamamı Çözümlü','Yargı Plus','question_bank','reinforcement','questions',3000,2,'İlyas Güneş'),
('31000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000004','2026 KPSS Genel Kültür Coğrafya Video Ders Notları','Yargı Plus','notes','primary','notes',1800,1,'Engin Eraydın'),
('31000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000004','2026 KPSS Genel Kültür Coğrafya Soru Bankası – Tamamı Çözümlü','Yargı Plus','question_bank','primary','questions',2400,2,'Engin Eraydın'),
('31000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000003','2026 KPSS Tarih Ders Notları','Benim Hocam','notes','primary','notes',2400,1,'Ramazan Yetgin'),
('31000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000003','2026 KPSS Tarih Soru Bankası – Tamamı Çözümlü','Benim Hocam','question_bank','primary','questions',3000,2,'Ramazan Yetgin'),
('31000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000006','Libertus Anayasa Hukuku – Konu Anlatımlı','Pegem Akademi','book','primary','book',1800,1,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000006','Libertus İdare Hukuku – Konu Anlatımlı','Pegem Akademi','book','primary','book',2100,2,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000006','Libertus Ceza Hukuku – Konu Anlatımlı','Pegem Akademi','book','primary','book',1500,3,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000006','Libertus Medeni Hukuk – Konu Anlatımlı','Pegem Akademi','book','primary','book',1800,4,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000006','Libertus Borçlar Hukuku – Konu Anlatımlı','Pegem Akademi','book','primary','book',1800,5,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-000000000006','Libertus Ticaret Hukuku – Konu Anlatımlı','Pegem Akademi','book','primary','book',2100,6,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-000000000006','Libertus İcra-İflas Hukuku – Konu Anlatımlı','Pegem Akademi','book','primary','book',1500,7,'KPSS A Grubu'),
('31000000-0000-0000-0000-000000000016','20000000-0000-0000-0000-000000000006','Libertus Hukuk Soru Bankası – Kamu Hukuku','Pegem Akademi','question_bank','reinforcement','questions',2700,8,'Anayasa, İdare, İdari Yargılama, Ceza, Ceza Muhakemesi'),
('31000000-0000-0000-0000-000000000017','20000000-0000-0000-0000-000000000006','Libertus Hukuk Soru Bankası – Özel Hukuk','Pegem Akademi','question_bank','reinforcement','questions',2700,9,'Medeni, Borçlar, Ticaret, İcra-İflas'),
('31000000-0000-0000-0000-000000000018','20000000-0000-0000-0000-000000000007','Economicus Mikro İktisat – Konu Anlatımlı','Pegem Akademi','book','primary','book',3300,1,null),
('31000000-0000-0000-0000-000000000019','20000000-0000-0000-0000-000000000007','Economicus Makro İktisat Para-Banka-Kredi – Konu Anlatımlı','Pegem Akademi','book','primary','book',3300,2,null),
('31000000-0000-0000-0000-000000000020','20000000-0000-0000-0000-000000000007','Economicus Türkiye Ekonomisi, Uluslararası İktisat, Büyüme-Kalkınma ve İktisat Politikası – Ders Notları','Pegem Akademi','notes','primary','notes',2400,3,null),
('31000000-0000-0000-0000-000000000021','20000000-0000-0000-0000-000000000007','Economicus İktisat Soru Bankası 1 – Mikro İktisat','Pegem Akademi','question_bank','reinforcement','questions',2700,4,null),
('31000000-0000-0000-0000-000000000022','20000000-0000-0000-0000-000000000007','Economicus İktisat Soru Bankası 2 – Makro İktisat / Para-Banka-Kredi','Pegem Akademi','question_bank','reinforcement','questions',2700,5,null),
('31000000-0000-0000-0000-000000000023','20000000-0000-0000-0000-000000000008','Optimus Maliye – Konu Anlatımlı','Pegem Akademi','book','primary','book',4200,1,null),
('31000000-0000-0000-0000-000000000024','20000000-0000-0000-0000-000000000008','Optimus Maliye – Soru Bankası','Pegem Akademi','question_bank','reinforcement','questions',3300,2,null),
('31000000-0000-0000-0000-000000000025','20000000-0000-0000-0000-000000000009','Reditus Muhasebe – Konu Anlatımlı','Pegem Akademi','book','primary','book',4800,1,null),
('31000000-0000-0000-0000-000000000026','20000000-0000-0000-0000-000000000009','Reditus Muhasebe – Soru Bankası','Pegem Akademi','question_bank','reinforcement','questions',3600,2,null)
on conflict (id) do update set
  subject_id=excluded.subject_id,
  name=excluded.name,
  publisher=excluded.publisher,
  resource_type=excluded.resource_type,
  resource_role=excluded.resource_role,
  work_mode=excluded.work_mode,
  planned_minutes=excluded.planned_minutes,
  sequence_order=excluded.sequence_order,
  notes=excluded.notes,
  is_active=true;

create table if not exists public.p48_strategy_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  score_type text not null default 'KPSSP48',
  target_exam_date date not null,
  weekly_target_minutes integer not null default 1800,
  monthly_target_minutes integer not null default 7200,
  status text not null default 'active',
  plan_version integer not null default 1,
  source_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint p48_strategy_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint p48_strategy_profile_unique unique(exam_profile_id),
  constraint p48_strategy_weekly_positive check (weekly_target_minutes > 0),
  constraint p48_strategy_monthly_positive check (monthly_target_minutes > 0),
  constraint p48_strategy_status_valid check (status in ('active','paused','completed'))
);

create table if not exists public.p48_resource_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  resource_id uuid not null,
  reference_resource_id uuid null references public.p48_reference_resources(id),
  planned_minutes integer not null,
  sequence_order integer not null,
  work_mode text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint p48_resource_targets_profile_owner_fk foreign key(exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint p48_resource_targets_resource_owner_fk foreign key(resource_id,user_id)
    references public.resources(id,user_id) on delete cascade,
  constraint p48_resource_targets_resource_unique unique(resource_id),
  constraint p48_resource_targets_minutes_positive check(planned_minutes > 0),
  constraint p48_resource_targets_sequence_positive check(sequence_order > 0),
  constraint p48_resource_targets_work_mode_valid check(work_mode in ('video','book','notes','questions','mock','review','other'))
);

create trigger p48_strategy_profiles_set_updated_at before update on public.p48_strategy_profiles
for each row execute function public.set_updated_at();
create trigger p48_resource_targets_set_updated_at before update on public.p48_resource_targets
for each row execute function public.set_updated_at();

alter table public.p48_strategy_profiles enable row level security;
alter table public.p48_resource_targets enable row level security;
revoke all on public.p48_strategy_profiles, public.p48_resource_targets from public, anon;
grant select, insert, update, delete on public.p48_strategy_profiles, public.p48_resource_targets to authenticated;

create policy "Users own P48 strategy" on public.p48_strategy_profiles
for all to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create policy "Users own P48 resource targets" on public.p48_resource_targets
for all to authenticated using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

create or replace function public.bootstrap_p48_strategy()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.exam_profiles;
  v_ref public.p48_reference_resources;
  v_resource public.resources;
  v_resource_count integer := 0;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_profile
  from public.exam_profiles
  where user_id=v_user and status='active'
  limit 1;
  if not found then raise exception 'NO_ACTIVE_EXAM_PROFILE'; end if;

  update public.exam_profiles
  set target_exam_date='2027-09-06'
  where id=v_profile.id and user_id=v_user;

  insert into public.p48_strategy_profiles(
    user_id,exam_profile_id,score_type,target_exam_date,
    weekly_target_minutes,monthly_target_minutes,status,source_note
  ) values (
    v_user,v_profile.id,'KPSSP48','2027-09-06',1800,7200,'active',
    '2027 sınav tarihi 6 Eylül varsayımıdır. 2026 resmi KPSSP48 ağırlıkları baz alınmıştır; 2027 ÖSYM kılavuzu yayımlanınca doğrulanmalıdır.'
  )
  on conflict(exam_profile_id) do update set
    target_exam_date=excluded.target_exam_date,
    weekly_target_minutes=excluded.weekly_target_minutes,
    monthly_target_minutes=excluded.monthly_target_minutes,
    status='active',
    plan_version=public.p48_strategy_profiles.plan_version+1,
    source_note=excluded.source_note;

  insert into public.user_subjects(user_id,exam_profile_id,subject_id,status)
  select v_user,v_profile.id,s.id,'active'
  from public.subjects s
  where s.id in (
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000009'
  )
  on conflict(exam_profile_id,subject_id) do update set status='active';

  insert into public.topic_progress(user_id,exam_profile_id,curriculum_node_id)
  select v_user,v_profile.id,cn.id
  from public.curriculum_nodes cn
  join public.user_subjects us
    on us.exam_profile_id=v_profile.id and us.user_id=v_user
   and us.subject_id=cn.subject_id and us.status='active'
  where cn.is_active=true and cn.node_type='topic'
  on conflict(exam_profile_id,curriculum_node_id) do nothing;

  delete from public.weekly_availability
  where user_id=v_user and exam_profile_id=v_profile.id;

  insert into public.weekly_availability(user_id,exam_profile_id,weekday,start_time,end_time,label,is_active)
  values
    (v_user,v_profile.id,1,'18:00','22:00','P48 4 saat',true),
    (v_user,v_profile.id,2,'18:00','22:00','P48 4 saat',true),
    (v_user,v_profile.id,3,'18:00','22:00','P48 4 saat',true),
    (v_user,v_profile.id,4,'18:00','22:00','P48 4 saat',true),
    (v_user,v_profile.id,5,'18:00','22:00','P48 4 saat',true),
    (v_user,v_profile.id,6,'13:00','18:00','P48 5 saat',true),
    (v_user,v_profile.id,7,'13:00','18:00','P48 5 saat',true);

  delete from public.calendar_periods
  where user_id=v_user and exam_profile_id=v_profile.id and name like 'P48 Tahmini %';

  insert into public.calendar_periods(user_id,exam_profile_id,period_type,name,start_date,end_date,capacity_multiplier)
  values
    (v_user,v_profile.id,'midterm','P48 Tahmini Güz Vize','2026-11-09','2026-11-15',0),
    (v_user,v_profile.id,'final','P48 Tahmini Güz Final','2027-01-04','2027-01-17',0),
    (v_user,v_profile.id,'midterm','P48 Tahmini Bahar Vize','2027-04-05','2027-04-11',0),
    (v_user,v_profile.id,'final','P48 Tahmini Bahar Final','2027-06-07','2027-06-20',0);

  update public.resources
  set status='paused'
  where user_id=v_user and exam_profile_id=v_profile.id;

  for v_ref in
    select * from public.p48_reference_resources
    where is_active=true
    order by subject_id,sequence_order
  loop
    select * into v_resource
    from public.resources
    where user_id=v_user and exam_profile_id=v_profile.id
      and subject_id=v_ref.subject_id and name=v_ref.name
    limit 1;

    if not found then
      insert into public.resources(
        user_id,exam_profile_id,subject_id,name,publisher,resource_type,
        resource_role,difficulty,status
      ) values (
        v_user,v_profile.id,v_ref.subject_id,v_ref.name,v_ref.publisher,
        v_ref.resource_type,v_ref.resource_role,'normal','active'
      ) returning * into v_resource;
    else
      update public.resources
      set publisher=v_ref.publisher,
          resource_type=v_ref.resource_type,
          resource_role=v_ref.resource_role,
          difficulty='normal',
          status='active'
      where id=v_resource.id
      returning * into v_resource;
    end if;

    insert into public.p48_resource_targets(
      user_id,exam_profile_id,resource_id,reference_resource_id,
      planned_minutes,sequence_order,work_mode
    ) values (
      v_user,v_profile.id,v_resource.id,v_ref.id,
      v_ref.planned_minutes,v_ref.sequence_order,v_ref.work_mode
    )
    on conflict(resource_id) do update set
      reference_resource_id=excluded.reference_resource_id,
      planned_minutes=excluded.planned_minutes,
      sequence_order=excluded.sequence_order,
      work_mode=excluded.work_mode;

    v_resource_count := v_resource_count + 1;
  end loop;

  return jsonb_build_object(
    'configured',true,
    'examProfileId',v_profile.id,
    'targetExamDate','2027-09-06',
    'weeklyTargetMinutes',1800,
    'monthlyTargetMinutes',7200,
    'resourceCount',v_resource_count,
    'estimatedCalendarPeriods',4
  );
end;
$$;

revoke all on function public.bootstrap_p48_strategy() from public,anon;
grant execute on function public.bootstrap_p48_strategy() to authenticated;

-- Scheduler and Telegram run with the service role. This wrapper lets those
-- trusted workers create a P48 week without weakening the user-facing RPC.
create or replace function public.service_replace_manual_weekly_plan(
  p_user_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  return public.replace_manual_weekly_plan(p_payload);
end;
$$;

revoke all on function public.service_replace_manual_weekly_plan(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.service_replace_manual_weekly_plan(uuid,jsonb) to service_role;

commit;
