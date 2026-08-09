begin;

with test_totals as (
  select
    tr.user_id,
    tr.exam_profile_id,
    tr.curriculum_node_id,
    sum(tr.total_questions)::integer as total_questions,
    sum(tr.correct_count)::integer as correct_questions,
    sum(tr.wrong_count)::integer as wrong_questions,
    sum(tr.blank_count)::integer as blank_questions,
    max(tr.completed_at) as last_practiced_at
  from public.test_results tr
  where tr.curriculum_node_id is not null
  group by
    tr.user_id,
    tr.exam_profile_id,
    tr.curriculum_node_id
)
update public.topic_progress tp
set
  total_questions = tt.total_questions,
  correct_questions = tt.correct_questions,
  wrong_questions = tt.wrong_questions,
  blank_questions = tt.blank_questions,
  last_practiced_at = greatest(tp.last_practiced_at, tt.last_practiced_at)
from test_totals tt
where tp.user_id = tt.user_id
  and tp.exam_profile_id = tt.exam_profile_id
  and tp.curriculum_node_id = tt.curriculum_node_id;

commit;