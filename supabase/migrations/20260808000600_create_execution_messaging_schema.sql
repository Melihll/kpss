alter table public.task_progress
add column actual_study_minutes integer not null default 0,
add constraint task_progress_actual_minutes_nonnegative check (actual_study_minutes >= 0);

alter table public.resource_units
add constraint resource_units_id_resource_unique unique (id, resource_id);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  task_id uuid null,
  subject_id uuid null references public.subjects(id),
  curriculum_node_id uuid null,
  resource_id uuid null,
  resource_unit_id uuid null,
  session_type text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_minutes integer null,
  status text not null,
  entry_source text not null,
  note text null,
  accounted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_sessions_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint study_sessions_task_owner_fk foreign key (task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint study_sessions_curriculum_subject_fk foreign key (curriculum_node_id,subject_id)
    references public.curriculum_nodes(id,subject_id),
  constraint study_sessions_resource_owner_fk foreign key (resource_id,user_id,exam_profile_id,subject_id)
    references public.resources(id,user_id,exam_profile_id,subject_id),
  constraint study_sessions_unit_resource_fk foreign key (resource_unit_id,resource_id)
    references public.resource_units(id,resource_id),
  constraint study_sessions_type_valid check (session_type in ('task','topic','resource','custom')),
  constraint study_sessions_status_valid check (status in ('active','completed','cancelled')),
  constraint study_sessions_source_valid check (entry_source in ('live','retroactive','manual','telegram','web')),
  constraint study_sessions_duration_valid check (duration_minutes is null or duration_minutes > 0),
  constraint study_sessions_dates_valid check (ended_at is null or ended_at >= started_at),
  constraint study_sessions_completion_consistent check (
    (status='active' and ended_at is null and duration_minutes is null and accounted_at is null)
    or (status='completed' and ended_at is not null and duration_minutes is not null and accounted_at is not null)
    or (status='cancelled' and accounted_at is null)
  ),
  constraint study_sessions_curriculum_has_subject check (curriculum_node_id is null or subject_id is not null),
  constraint study_sessions_unit_has_resource check (resource_unit_id is null or resource_id is not null)
);

create unique index study_sessions_one_active_per_user on public.study_sessions(user_id) where status='active';
create index study_sessions_user_id_idx on public.study_sessions(user_id);
create index study_sessions_task_id_idx on public.study_sessions(task_id);
create index study_sessions_status_idx on public.study_sessions(status);
create index study_sessions_started_at_idx on public.study_sessions(started_at);

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_profile_id uuid not null,
  task_id uuid null,
  subject_id uuid not null references public.subjects(id),
  curriculum_node_id uuid null,
  resource_id uuid null,
  resource_unit_id uuid null,
  correct_count integer not null,
  wrong_count integer not null,
  blank_count integer not null,
  total_questions integer not null,
  duration_minutes integer null,
  accuracy numeric generated always as (correct_count::numeric / total_questions::numeric) stored,
  review_status text not null,
  entry_source text not null,
  idempotency_key text null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_results_profile_owner_fk foreign key (exam_profile_id,user_id)
    references public.exam_profiles(id,user_id) on delete cascade,
  constraint test_results_task_owner_fk foreign key (task_id,user_id,exam_profile_id)
    references public.tasks(id,user_id,exam_profile_id),
  constraint test_results_curriculum_subject_fk foreign key (curriculum_node_id,subject_id)
    references public.curriculum_nodes(id,subject_id),
  constraint test_results_resource_owner_fk foreign key (resource_id,user_id,exam_profile_id,subject_id)
    references public.resources(id,user_id,exam_profile_id,subject_id),
  constraint test_results_unit_resource_fk foreign key (resource_unit_id,resource_id)
    references public.resource_units(id,resource_id),
  constraint test_results_counts_nonnegative check (correct_count>=0 and wrong_count>=0 and blank_count>=0),
  constraint test_results_total_positive check (total_questions>0),
  constraint test_results_total_matches check (total_questions=correct_count+wrong_count+blank_count),
  constraint test_results_duration_valid check (duration_minutes is null or duration_minutes>0),
  constraint test_results_review_valid check (review_status in ('pending','reviewed','skipped')),
  constraint test_results_source_valid check (entry_source in ('live','retroactive','manual','telegram','web')),
  constraint test_results_unit_has_resource check (resource_unit_id is null or resource_id is not null)
);

create unique index test_results_user_idempotency_unique on public.test_results(user_id,idempotency_key) where idempotency_key is not null;
create index test_results_user_id_idx on public.test_results(user_id);
create index test_results_task_id_idx on public.test_results(task_id);
create index test_results_curriculum_node_id_idx on public.test_results(curriculum_node_id);
create index test_results_completed_at_idx on public.test_results(completed_at);

create table public.messaging_identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, external_user_id text not null, external_chat_id text null, username text null,
  linked_at timestamptz not null default now(), created_at timestamptz not null default now(),
  constraint messaging_identities_provider_valid check (provider='telegram'),
  constraint messaging_identities_external_not_blank check (btrim(external_user_id)<>' ' and btrim(external_user_id)<>''),
  constraint messaging_identities_provider_external_unique unique(provider,external_user_id),
  constraint messaging_identities_user_provider_unique unique(user_id,provider)
);

create table public.messaging_link_tokens (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null, token_hash text not null unique, expires_at timestamptz not null,
  used_at timestamptz null, created_at timestamptz not null default now(),
  constraint messaging_link_tokens_provider_valid check (provider='telegram'),
  constraint messaging_link_tokens_hash_not_blank check (btrim(token_hash)<>''),
  constraint messaging_link_tokens_expiry_valid check (expires_at>created_at)
);

create table public.telegram_conversation_states (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null, state text not null, payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null, updated_at timestamptz not null default now(),
  constraint telegram_conversation_user_chat_unique unique(user_id,chat_id)
);

create table public.processed_external_events (
  provider text not null, external_event_id text not null, processed_at timestamptz not null default now(),
  primary key(provider,external_event_id), constraint processed_external_provider_valid check(provider='telegram')
);

create trigger study_sessions_set_updated_at before update on public.study_sessions for each row execute function public.set_updated_at();
create trigger test_results_set_updated_at before update on public.test_results for each row execute function public.set_updated_at();

alter table public.study_sessions enable row level security;
alter table public.test_results enable row level security;
alter table public.messaging_identities enable row level security;
alter table public.messaging_link_tokens enable row level security;
alter table public.telegram_conversation_states enable row level security;
alter table public.processed_external_events enable row level security;

revoke all on public.study_sessions,public.test_results,public.messaging_identities,public.messaging_link_tokens,public.telegram_conversation_states,public.processed_external_events from anon,authenticated;
grant select,insert,update,delete on public.study_sessions,public.test_results,public.messaging_identities,public.messaging_link_tokens,public.telegram_conversation_states to authenticated;

create policy "Users own study sessions" on public.study_sessions for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users own test results" on public.test_results for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users own messaging identities" on public.messaging_identities for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users own messaging tokens" on public.messaging_link_tokens for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Users own telegram conversation state" on public.telegram_conversation_states for all to authenticated
using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
