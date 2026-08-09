begin;

-- Existing users may have completed onboarding before the production
-- curriculum catalog was populated. Backfill only active top-level topics
-- belonging to subjects the user actually selected.

insert into public.topic_progress (
  user_id,
  exam_profile_id,
  curriculum_node_id
)
select
  us.user_id,
  us.exam_profile_id,
  cn.id
from public.user_subjects us
join public.curriculum_nodes cn
  on cn.subject_id = us.subject_id
where us.status = 'active'
  and cn.is_active = true
  and cn.node_type = 'topic'
on conflict (exam_profile_id, curriculum_node_id) do nothing;

commit;